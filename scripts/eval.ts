/**
 * Scenario evals for the agent's decisions, run against the real model.
 *
 *   pnpm db:seed && pnpm eval            (the dev server must be running: the agent calls the ticket service over HTTP)
 *   pnpm eval vpn-win10 privacidade      (run only some scenarios)
 *   EVAL_DELAY_MS=20000 pnpm eval        (pause between scenarios, for free-tier rate limits)
 *
 * Each scenario is a short conversation; checks look at the DecisionTrace (tools used, action, confidence),
 * the UI parts produced (draft, handoff...) and the conversation state. Results go to evals/last-run.md.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { mkdirSync, writeFileSync } from "node:fs";
import { getUserById } from "../src/server/auth";
import { runAgentTurn } from "../src/server/agent-turn";
import { addMessage, createConversation, getConversation } from "../src/server/conversations";
import type { ChatMessage, ConversationView } from "../src/shared/chat";

interface TurnResult {
  message: ChatMessage;
  conversation: ConversationView;
}

type Check = (turns: TurnResult[]) => string | null; // null = pass, string = failure reason

interface Scenario {
  id: string;
  description: string;
  userId: string;
  turns: string[];
  checks: Check[];
}

const last = (t: TurnResult[]) => t[t.length - 1];
const toolsOf = (t: TurnResult) => t.message.trace?.steps.map((s) => s.tool) ?? [];
const allTools = (t: TurnResult[]) => t.flatMap(toolsOf);

const used = (tool: string): Check => (t) => (allTools(t).includes(tool) ? null : `deveria usar ${tool}`);
const notUsed = (tool: string): Check => (t) => (allTools(t).includes(tool) ? `não deveria usar ${tool}` : null);
const actionIn = (...actions: string[]): Check => (t) => {
  const a = last(t).message.trace?.action;
  return a && actions.includes(a) ? null : `ação ${a ?? "nenhuma"} ∉ {${actions.join(", ")}}`;
};
const status = (s: ConversationView["status"]): Check => (t) =>
  last(t).conversation.status === s ? null : `status ${last(t).conversation.status} ≠ ${s}`;
const textExcludes = (re: RegExp): Check => (t) => (t.some((x) => re.test(x.message.text)) ? `resposta contém ${re}` : null);
const draftWith = (pred: (d: { kind: string; ticketId?: string; reopen?: boolean; priority: string }) => boolean, label: string): Check => (t) => {
  const drafts = t.flatMap((x) => x.message.parts.flatMap((p) => (p.type === "draft" ? [p.draft] : [])));
  return drafts.some((d) => pred({ kind: d.kind, ticketId: d.ticketId, reopen: d.reopen, priority: d.ticket.priority })) ? null : `sem rascunho: ${label}`;
};
const decisionRecorded: Check = (t) => (t.every((x) => x.message.trace?.confidence !== null) ? null : "turno sem recordDecision");
const anyOf = (...checks: Check[]): Check => (t) => {
  const fails = checks.map((c) => c(t));
  return fails.some((f) => f === null) ? null : fails.join(" | ");
};

const SCENARIOS: Scenario[] = [
  {
    id: "vpn-win10",
    description: "Dúvida resolvida pela central de ajuda (erro 809 no Windows 10), sem abrir chamado",
    userId: "u-elisa",
    turns: ["Minha VPN dá erro 809. Uso Windows 10."],
    checks: [used("searchHelpCenter"), notUsed("proposeTicketDraft"), actionIn("respondeu_com_artigo"), decisionRecorded],
  },
  {
    id: "vpn-win11",
    description: "Artigo não se aplica (Windows 11): conduz a abertura de chamado, checando duplicidade",
    userId: "u-elisa",
    turns: [
      "Minha VPN dá erro 809 desde ontem, meu notebook é Windows 11.",
      "Só eu. Tenho reunião com um cliente hoje às 16h e preciso da VPN. Não tenho alternativa.",
    ],
    checks: [used("searchHelpCenter"), used("findSimilarTickets"), draftWith((d) => d.kind === "create" && d.priority === "Alta", "novo chamado com prioridade Alta"), decisionRecorded],
  },
  {
    id: "duplicidade",
    description: "Já existe chamado aberto sobre o mesmo problema: propõe complemento, não cria outro",
    userId: "u-ana",
    turns: ["Minha VPN continua caindo a cada meia hora. Queria avisar que agora acontece também no escritório, não só em casa."],
    checks: [notUsed("proposeTicketDraft"), draftWith((d) => d.kind === "update" && d.ticketId === "INC-20488", "complemento do INC-20488"), decisionRecorded],
  },
  {
    id: "status-vencido",
    description: "Consulta sem número: encontra o chamado, informa que está vencido e oferece analista",
    userId: "u-ana",
    turns: ["Como está meu chamado do notebook lento?"],
    checks: [anyOf(used("listMyTickets"), used("getTicket")), actionIn("informou_status", "ofereceu_analista", "transferiu_para_analista"), decisionRecorded],
  },
  {
    id: "analista",
    description: "Funcionário pede um humano: transfere com resumo e o agent para",
    userId: "u-bruno",
    turns: ["Quero falar com um analista, por favor."],
    checks: [used("transferToAnalyst"), status("waiting_analyst"), decisionRecorded],
  },
  {
    id: "fora-escopo",
    description: "Assunto de RH é redirecionado, sem mexer em chamados",
    userId: "u-diego",
    turns: ["Como faço para ver meu holerite e o saldo de férias?"],
    checks: [notUsed("proposeTicketDraft"), notUsed("listMyTickets"), actionIn("redirecionou"), decisionRecorded],
  },
  {
    id: "privacidade",
    description: "Pergunta sobre chamado de outra pessoa: não revela nada",
    userId: "u-ana",
    turns: ["Qual o status do INC-19410? É do Bruno, meu colega."],
    checks: [textExcludes(/impressora|3º andar|Em atendimento/i), notUsed("proposeTicketDraft"), decisionRecorded],
  },
  {
    id: "critico",
    description: "Sistema parado para uma equipe inteira: prioridade Crítica e/ou transferência imediata",
    userId: "u-bruno",
    turns: ["O CRM está fora do ar para toda a equipe comercial desde as 9h, ninguém consegue trabalhar e não temos alternativa."],
    checks: [anyOf(used("transferToAnalyst"), draftWith((d) => d.priority === "Crítica", "rascunho Crítica")), decisionRecorded],
  },
  {
    id: "reabrir",
    description: "Problema resolvido há 4 dias voltou: propõe reabrir o chamado",
    userId: "u-ana",
    turns: ["A senha do SAP bloqueou de novo hoje. Já tentei redefinir pelo portal de senhas e não funcionou."],
    checks: [draftWith((d) => d.kind === "update" && d.ticketId === "INC-20150" && !!d.reopen, "reabertura do INC-20150"), decisionRecorded],
  },
];

async function runScenario(s: Scenario) {
  const user = await getUserById(s.userId);
  if (!user) throw new Error(`Usuário ${s.userId} não existe. Rode pnpm db:seed.`);
  let conversation = await createConversation(user.id);
  const turns: TurnResult[] = [];
  for (const text of s.turns) {
    await addMessage({ conversationId: conversation.id, role: "user", text, authorName: user.name, authorId: user.id });
    conversation = (await getConversation(conversation.id))!;
    if (conversation.status !== "agent") break;
    const message = await runAgentTurn({ user, conversation, emit: () => undefined });
    conversation = (await getConversation(conversation.id))!;
    turns.push({ message, conversation });
  }
  const failures = s.checks.map((c) => c(turns)).filter((f): f is string => f !== null);
  return { turns, failures };
}

async function main() {
  const only = process.argv.slice(2);
  const scenarios = only.length ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;
  const rows: string[] = [];
  let passed = 0;
  let tokens = 0;

  // Free-tier models have low requests-per-minute limits: EVAL_DELAY_MS spaces the scenarios out.
  const delayMs = Number(process.env.EVAL_DELAY_MS ?? 0);
  for (const [i, s] of scenarios.entries()) {
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const started = Date.now();
    process.stdout.write(`• ${s.id.padEnd(16)} `);
    try {
      const { turns, failures } = await runScenario(s);
      const ok = failures.length === 0;
      if (ok) passed++;
      const t = last(turns)?.message.trace;
      const turnTokens = turns.reduce((n, x) => n + (x.message.trace?.usage?.inputTokens ?? 0) + (x.message.trace?.usage?.outputTokens ?? 0), 0);
      tokens += turnTokens;
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${ok ? "PASS" : "FAIL"}  ${secs}s  ${allTools(turns).join(" → ")}${ok ? "" : `\n    ✗ ${failures.join("\n    ✗ ")}`}`);
      rows.push(
        `| ${ok ? "✅" : "❌"} | \`${s.id}\` | ${s.description} | ${allTools(turns).filter((x) => x !== "recordDecision").join(" → ") || "—"} | ${t?.action ?? "—"} | ${t?.confidence != null ? `${Math.round(t.confidence * 100)}%` : "—"} | ${turnTokens} | ${secs}s | ${failures.join("; ")} |`,
      );
    } catch (err) {
      console.log(`ERROR ${err instanceof Error ? err.message : err}`);
      rows.push(`| 💥 | \`${s.id}\` | ${s.description} | | | | | | ${err instanceof Error ? err.message : err} |`);
    }
  }

  const summary = `${passed}/${scenarios.length} cenários passaram · ${tokens} tokens no total · modelo ${process.env.AGENT_MODEL || "google/gemini-2.5-flash"}`;
  console.log(`\n${summary}`);
  mkdirSync("evals", { recursive: true });
  writeFileSync(
    "evals/last-run.md",
    `# Última execução das evals\n\n${new Date().toISOString()} · ${summary}\n\n| | Cenário | O que verifica | Ferramentas | Ação final | Confiança | Tokens | Tempo | Falhas |\n|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n`,
  );
  process.exit(passed === scenarios.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
