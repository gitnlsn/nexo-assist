/** Human labels for the step line shown above each agent reply ("consultou seus chamados · criou um chamado"). */
type Args = Record<string, unknown>;

const LABELS: Record<string, (args: Args) => string> = {
  searchHelpCenter: () => "buscou na central de ajuda",
  listMyTickets: () => "consultou seus chamados",
  getTicket: (a) => `consultou o ${String(a.ticketId ?? "chamado").toUpperCase()}`,
  findSimilarTickets: () => "verificou chamados parecidos",
  classifyPriority: () => "classificou a prioridade",
  proposeTicketDraft: () => "montou o rascunho",
  proposeTicketUpdate: (a) => (a.reabrir ? "preparou a reabertura" : "preparou o complemento"),
  showTickets: (a) => (a.modo === "escolha" ? "listou chamados para escolha" : "mostrou o chamado"),
  offerQuickReplies: () => "sugeriu respostas",
  transferToAnalyst: () => "chamou um analista",
  recordDecision: () => "registrou a decisão",
};

/** Steps hidden from the compact step line (still visible in the detail panel). */
export const HIDDEN_FROM_STEP_LINE = new Set(["recordDecision", "offerQuickReplies"]);

export function stepLabel(tool: string, args: Args): string {
  return LABELS[tool]?.(args) ?? tool;
}

/** One-line summary of tool input for the detail panel. */
export function summarizeArgs(tool: string, args: Args): string {
  if (tool === "recordDecision") return "";
  const entries = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  const text = entries.join(" · ");
  return text.length > 280 ? `${text.slice(0, 277)}…` : text;
}
