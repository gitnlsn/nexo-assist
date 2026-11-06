import { RequestContext } from "@mastra/core/request-context";
import { createTicketsClient } from "@/clients/tickets";
import { type AgentRequestContext, type HandoffReason, type RecordedDecision, type TurnServices } from "@/agent/context";
import { agentModel, nexoAssist } from "@/agent/agent";
import { HIDDEN_FROM_STEP_LINE, stepLabel, summarizeArgs } from "@/agent/labels";
import type { ChatMessage, ConversationView, DecisionTrace, MessagePart, StreamEvent, TraceStep } from "@/shared/chat";
import type { User } from "@/shared/domain";
import { addMessage, applyEvent, createDraft, getConversation, getDraftStatuses, listMessages, markNeedsAttention } from "./conversations";

/** Below this self-reported confidence the server hands the conversation to an analyst (Anexo A). */
export const CONFIDENCE_THRESHOLD = 0.5;
const HISTORY_LIMIT = 20;
const MAX_STEPS = 8;

export const HANDOFF_REASON_LABEL: Record<HandoffReason, string> = {
  pedido_do_funcionario: "O funcionário pediu um analista",
  caso_critico: "Caso crítico",
  chamado_vencido: "Chamado com prazo vencido",
  baixa_confianca: "O agent não teve segurança para decidir",
};

/**
 * Converts the stored conversation into model messages. Cards are summarised in brackets, using the
 * draft's *current* status, so the model knows e.g. that a draft was confirmed by the employee.
 */
async function buildHistory(messages: ChatMessage[]) {
  const draftIds = messages.flatMap((m) => m.parts.filter((p) => p.type === "draft").map((p) => (p.type === "draft" ? p.draft.id : "")));
  const statuses = await getDraftStatuses(draftIds);
  const describePart = (p: MessagePart): string => {
    switch (p.type) {
      case "draft": {
        const status = statuses.get(p.draft.id) ?? p.draft.status;
        const label = { pending: "aguardando confirmação", confirmed: "CONFIRMADO pelo funcionário", cancelled: "cancelado", superseded: "substituído" }[status] ?? status;
        return p.draft.kind === "create"
          ? `[rascunho de chamado "${p.draft.ticket.title}" (${p.draft.ticket.priority}) — ${label}]`
          : `[rascunho de ${p.draft.reopen ? "reabertura" : "complemento"} do ${p.draft.ticketId} — ${label}]`;
      }
      case "ticket":
        return `[cartão do chamado ${p.ticket.id}]`;
      case "ticketChoice":
        return `[lista para escolha: ${p.tickets.map((t) => t.id).join(", ")}]`;
      case "options":
        return `[opções: ${p.options.join(" / ")}]`;
      case "handoff":
        return `[conversa transferida: ${p.reason}]`;
      case "article":
        return `[artigo ${p.id}]`;
      default:
        return "";
    }
  };

  return messages.slice(-HISTORY_LIMIT).map((m) => {
    const cards = m.parts.map(describePart).join(" ");
    if (m.role === "user") return { role: "user" as const, content: m.text };
    const prefix = m.role === "analyst" ? `[Analista ${m.authorName ?? ""}] ` : m.role === "system" ? "[Sistema] " : "";
    return { role: "assistant" as const, content: `${prefix}${m.text}${cards ? `\n${cards}` : ""}`.trim() || "(sem texto)" };
  });
}

export interface RunTurnInput {
  user: User;
  conversation: ConversationView;
  emit: (event: StreamEvent) => void;
  abortSignal?: AbortSignal;
}

export async function runAgentTurn({ user, conversation, emit, abortSignal }: RunTurnInput): Promise<ChatMessage> {
  const started = Date.now();
  const steps: TraceStep[] = [];
  const parts: MessagePart[] = [];
  const guards: string[] = [];
  let decision: RecordedDecision | null = null;
  let handedOff: { reason: HandoffReason } | null = null;
  let lastCallAttempts = 0;
  const stepStarted = new Map<string, number>();

  const turn: TurnServices = {
    user: { id: user.id, name: user.name, email: user.email, department: user.department },
    conversationId: conversation.id,
    now: new Date(),
    tickets: createTicketsClient(
      { kind: "employee", id: user.id, name: user.name },
      { onCall: ({ attempts }) => (lastCallAttempts = Math.max(lastCallAttempts, attempts)) },
    ),
    async createDraft(kind, ticketId, draft) {
      const row = await createDraft({ conversationId: conversation.id, employeeId: user.id, kind, ticketId, payload: draft });
      return { id: row.id };
    },
    async handoff(reason, summary, ticketId) {
      await applyEvent(conversation.id, "handoff", { reason: HANDOFF_REASON_LABEL[reason], summary });
      handedOff = { reason };
      const part: MessagePart = { type: "handoff", reason: HANDOFF_REASON_LABEL[reason] };
      parts.push(part);
      emit({ type: "part", part });
      if (ticketId) {
        // Best effort: move the ticket to the N2 queue too. The conversation handoff already happened.
        await turn.tickets.transfer(ticketId, `Transferido pelo Nexo Assist: ${summary}`).catch(() => {
          guards.push(`Não foi possível transferir o ${ticketId} no sistema de chamados; o analista foi avisado pela conversa.`);
        });
      }
    },
    addPart(part) {
      parts.push(part);
      emit({ type: "part", part });
    },
    recordDecision(d) {
      decision = d;
    },
  };

  const requestContext = new RequestContext<AgentRequestContext>();
  requestContext.set("turn", turn);

  const history = await buildHistory(await listMessages(conversation.id));
  let text = "";
  let usage: DecisionTrace["usage"];
  let failed = false;

  try {
    const stream = await nexoAssist.stream(history, {
      requestContext,
      maxSteps: MAX_STEPS,
      toolCallConcurrency: 1,
      abortSignal,
      modelSettings: { temperature: 0.2, maxOutputTokens: 1200 },
    });

    for await (const chunk of stream.fullStream) {
      switch (chunk.type) {
        case "text-delta":
          text += chunk.payload.text;
          emit({ type: "text", delta: chunk.payload.text });
          break;
        case "tool-call": {
          lastCallAttempts = 0;
          const args = (chunk.payload.args ?? {}) as Record<string, unknown>;
          const step: TraceStep = {
            id: chunk.payload.toolCallId,
            tool: chunk.payload.toolName,
            label: stepLabel(chunk.payload.toolName, args),
            hidden: HIDDEN_FROM_STEP_LINE.has(chunk.payload.toolName) || undefined,
            status: "running",
            input: summarizeArgs(chunk.payload.toolName, args),
          };
          steps.push(step);
          stepStarted.set(step.id, Date.now());
          emit({ type: "step", step });
          break;
        }
        case "tool-result": {
          const step = steps.find((s) => s.id === chunk.payload.toolCallId);
          if (!step) break;
          const result = chunk.payload.result as { ok?: boolean; resumo?: string; message?: string } | undefined;
          step.status = chunk.payload.isError || result?.ok === false ? "error" : "ok";
          step.output = result?.resumo ?? result?.message ?? "";
          step.durationMs = Date.now() - (stepStarted.get(step.id) ?? Date.now());
          if (lastCallAttempts > 1) step.retries = lastCallAttempts - 1;
          emit({ type: "step", step });
          break;
        }
        case "error":
          throw chunk.payload.error instanceof Error ? chunk.payload.error : new Error(String(chunk.payload.error));
      }
    }
    const u = await stream.usage;
    usage = { inputTokens: u?.inputTokens, outputTokens: u?.outputTokens };
  } catch (err) {
    failed = true;
    console.error("[agent-turn]", err);
    guards.push(`Falha ao chamar o modelo: ${err instanceof Error ? err.message : String(err)}`);
    if (!text) {
      text = "Desculpe, tive um problema para processar sua mensagem agora. Pode tentar de novo em instantes?";
      emit({ type: "text", delta: text });
    }
  }

  // ---------------------------------------------------------------- server-side guards
  const recorded = decision as RecordedDecision | null;
  const handoff = handedOff as { reason: HandoffReason } | null;

  if (!recorded && !failed) {
    guards.push("O agent não registrou a decisão neste turno; conversa sinalizada para os analistas.");
    await markNeedsAttention(conversation.id);
  }
  if (recorded && recorded.confidence < CONFIDENCE_THRESHOLD && !handoff) {
    guards.push(
      `Confiança ${Math.round(recorded.confidence * 100)}% abaixo de ${CONFIDENCE_THRESHOLD * 100}%: conversa transferida automaticamente para um analista.`,
    );
    await turn.handoff(
      "baixa_confianca",
      `Transferência automática por baixa confiança. Entendimento do agent: ${recorded.understood}. Motivo: ${recorded.reason}`,
    );
    const note = " Como não tenho certeza do melhor caminho, chamei um analista para continuar com você aqui mesmo.";
    text += note;
    emit({ type: "text", delta: note });
  }

  const trace: DecisionTrace = {
    intent: recorded?.intent ?? null,
    understood: recorded?.understood ?? "",
    facts: Object.fromEntries((recorded?.facts ?? []).map((f) => [f.name, f.value])),
    action: recorded?.action ?? null,
    confidence: recorded?.confidence ?? null,
    reason: recorded?.reason ?? "",
    rulesApplied: recorded?.rulesApplied ?? [],
    steps,
    guards,
    model: agentModel(),
    usage,
    latencyMs: Date.now() - started,
  };

  const message = await addMessage({
    conversationId: conversation.id,
    role: "agent",
    authorName: "Nexo Assist",
    text: text.trim(),
    parts,
    trace,
  });
  const updated = (await getConversation(conversation.id)) ?? conversation;
  emit({ type: "done", message, conversation: updated });
  return message;
}
