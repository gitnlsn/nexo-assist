import { createTicketsClient } from "@/clients/tickets";
import type { ChatMessage, ConversationView, DecisionTrace, MessagePart } from "@/shared/chat";
import type { Category, Priority, User } from "@/shared/domain";
import { toTicketView } from "@/shared/rules/tickets";
import { HANDOFF_REASON_LABEL } from "./agent-turn";
import { addMessage, applyEvent, getConversation, getConversationRow, getDraft, setDraftStatus } from "./conversations";
import { HttpError } from "./http";

/**
 * Executes (or cancels) a draft proposed by the agent. This is the ONLY path that creates or updates
 * tickets on behalf of an employee, which is how "confirm before acting" is guaranteed by code.
 * No LLM call here: the outcome is deterministic and recorded with its own trace.
 */
export async function resolveDraft(
  user: User,
  draftId: string,
  action: "confirm" | "cancel",
): Promise<{ message: ChatMessage; conversation: ConversationView }> {
  const draft = await getDraft(draftId);
  if (!draft || draft.employeeId !== user.id) throw new HttpError(404, "Rascunho não encontrado.");
  if (draft.status !== "pending") throw new HttpError(409, "Este rascunho já foi usado ou substituído.");
  const conversation = await getConversationRow(draft.conversationId);
  if (!conversation || conversation.status === "closed") throw new HttpError(409, "A conversa foi encerrada.");

  if (action === "cancel") {
    await setDraftStatus(draft.id, "cancelled");
    const message = await addMessage({
      conversationId: draft.conversationId,
      role: "system",
      text: "Rascunho descartado. Se quiser, me conte o que mudar.",
    });
    return { message, conversation: (await getConversation(draft.conversationId))! };
  }

  const started = Date.now();
  let attempts = 0;
  const client = createTicketsClient(
    { kind: "employee", id: user.id, name: user.name },
    { onCall: (c) => (attempts = c.attempts) },
  );
  const p = draft.payload;
  const ticket =
    draft.kind === "create"
      ? await client.create({
          type: p.type,
          title: p.title,
          description: p.description,
          category: p.category as Category,
          priority: p.priority as Priority,
          affected: p.affected,
        })
      : await client.update(draft.ticketId!, { comment: p.comment ?? "", reopen: p.reopen ?? false });
  await setDraftStatus(draft.id, "confirmed", ticket.id);

  const view = toTicketView(ticket, new Date());
  const parts: MessagePart[] = [{ type: "ticket", ticket: view }];
  const guards: string[] = [];
  let text =
    draft.kind === "create"
      ? `Pronto: abri o ${ticket.id} com prioridade ${ticket.priority.toLowerCase()}. ${view.dueLabel ? `O prazo de resposta ${view.dueLabel}.` : ""}`
      : p.reopen
        ? `Pronto: reabri o ${ticket.id} com as novas informações.`
        : `Pronto: adicionei as informações ao ${ticket.id}.`;

  // Anexo A: critical cases go to an analyst right away.
  if (draft.kind === "create" && ticket.priority === "Crítica" && conversation.status === "agent") {
    await applyEvent(draft.conversationId, "handoff", {
      reason: HANDOFF_REASON_LABEL.caso_critico,
      summary: `Chamado crítico ${ticket.id} aberto pelo Nexo Assist: ${ticket.title}. Afetados: ${ticket.affected}. ${ticket.description}`,
    });
    await client.transfer(ticket.id, "Caso crítico: encaminhado ao N2 pelo Nexo Assist.").catch(() => undefined);
    parts.push({ type: "handoff", reason: HANDOFF_REASON_LABEL.caso_critico });
    guards.push("Prioridade Crítica: conversa transferida automaticamente para um analista (regra de transferência).");
    text += " Como é um caso crítico, já chamei um analista para acompanhar com você.";
  }

  const trace: DecisionTrace = {
    intent: draft.kind === "create" ? "abrir_chamado" : p.reopen ? "reabrir_chamado" : "complementar_chamado",
    understood: "O funcionário confirmou o rascunho.",
    facts: { chamado: ticket.id, prioridade: ticket.priority, categoria: ticket.category },
    action: draft.kind === "create" ? "criou_chamado" : "atualizou_chamado",
    confidence: 1,
    reason: "Ação executada somente após a confirmação explícita do funcionário no rascunho.",
    rulesApplied: ["Confirmação antes de criar ou atualizar"],
    steps: [
      {
        id: `draft-${draft.id}`,
        tool: draft.kind === "create" ? "createTicket" : "updateTicket",
        label: draft.kind === "create" ? "criou um chamado" : p.reopen ? "reabriu o chamado" : "atualizou o chamado",
        status: "ok",
        input: `rascunho ${draft.id.slice(0, 8)} confirmado`,
        output: `${ticket.id} · ${ticket.priority}`,
        durationMs: Date.now() - started,
        retries: attempts > 1 ? attempts - 1 : undefined,
      },
    ],
    guards,
    model: null,
    latencyMs: Date.now() - started,
  };

  const message = await addMessage({
    conversationId: draft.conversationId,
    role: "agent",
    authorName: "Nexo Assist",
    text: text.trim(),
    parts,
    trace,
  });
  return { message, conversation: (await getConversation(draft.conversationId))! };
}
