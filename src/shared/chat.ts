import type {
  Category,
  ConversationStatus,
  Priority,
  Ticket,
  TicketType,
} from "./domain";

/**
 * Transparency model. Every agent turn produces one DecisionTrace that answers:
 * what did the agent understand, what did it do (steps), what it decided, how sure, and why.
 */

export const INTENTS = [
  "duvida",
  "consultar_chamado",
  "complementar_chamado",
  "abrir_chamado",
  "reabrir_chamado",
  "falar_com_analista",
  "fora_do_escopo",
  "saudacao_ou_outro",
] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_LABEL: Record<Intent, string> = {
  duvida: "Tirar uma dúvida",
  consultar_chamado: "Consultar um chamado",
  complementar_chamado: "Complementar um chamado",
  abrir_chamado: "Abrir um chamado",
  reabrir_chamado: "Reabrir um chamado",
  falar_com_analista: "Falar com um analista",
  fora_do_escopo: "Assunto fora de TI",
  saudacao_ou_outro: "Conversa geral",
};

export const ACTIONS = [
  "respondeu_com_artigo",
  "informou_status",
  "pediu_informacao",
  "propos_rascunho",
  "propos_atualizacao",
  "criou_chamado",
  "atualizou_chamado",
  "transferiu_para_analista",
  "ofereceu_analista",
  "redirecionou",
  "respondeu",
] as const;
export type AgentAction = (typeof ACTIONS)[number];

export const ACTION_LABEL: Record<AgentAction, string> = {
  respondeu_com_artigo: "Respondeu com artigo da central de ajuda",
  informou_status: "Informou o status do chamado",
  pediu_informacao: "Pediu mais informações",
  propos_rascunho: "Propôs um rascunho de chamado",
  propos_atualizacao: "Propôs uma atualização de chamado",
  criou_chamado: "Criou o chamado",
  atualizou_chamado: "Atualizou o chamado",
  transferiu_para_analista: "Transferiu para um analista",
  ofereceu_analista: "Ofereceu falar com um analista",
  redirecionou: "Redirecionou para outra área",
  respondeu: "Respondeu",
};

export interface TraceStep {
  id: string;
  tool: string;
  /** Short human label shown above the reply, e.g. "consultou seus chamados". */
  label: string;
  /** Bookkeeping steps (e.g. recordDecision) are hidden from the compact step line but kept in the detail view. */
  hidden?: boolean;
  status: "running" | "ok" | "error";
  /** One-line, human readable summary of input and result. */
  input?: string;
  output?: string;
  durationMs?: number;
  retries?: number;
}

export interface DecisionTrace {
  intent: Intent | null;
  /** What the agent understood, in plain Portuguese. */
  understood: string;
  /** Structured facts extracted from the conversation (category, impact, ...). */
  facts: Record<string, string>;
  action: AgentAction | null;
  confidence: number | null;
  reason: string;
  rulesApplied: string[];
  steps: TraceStep[];
  /** Notes added by server-side guards (e.g. automatic handoff because of low confidence). */
  guards: string[];
  model: string | null;
  usage?: { inputTokens?: number; outputTokens?: number };
  latencyMs?: number;
}

export interface DraftView {
  id: string;
  kind: "create" | "update";
  status: "pending" | "confirmed" | "cancelled" | "superseded";
  ticketId?: string;
  ticket: {
    type: TicketType;
    title: string;
    description: string;
    category: Category;
    priority: Priority;
    affected: string;
    deadlineLabel: string;
  };
  comment?: string;
  reopen?: boolean;
}

export type MessagePart =
  | { type: "ticket"; ticket: TicketView }
  | { type: "ticketList"; tickets: TicketView[] }
  | { type: "ticketChoice"; prompt: string; tickets: TicketView[] }
  | { type: "draft"; draft: DraftView }
  | { type: "options"; options: string[] }
  | { type: "handoff"; reason: string }
  | { type: "article"; id: string; title: string };

/** A ticket enriched with computed, display-ready SLA info. */
export interface TicketView extends Ticket {
  overdue: boolean;
  dueLabel: string | null;
}

export type MessageRole = "user" | "agent" | "analyst" | "system";

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  authorName: string | null;
  text: string;
  parts: MessagePart[];
  trace: DecisionTrace | null;
  createdAt: string;
}

export interface ConversationView {
  id: string;
  employeeId: string;
  status: ConversationStatus;
  analystId: string | null;
  analystName: string | null;
  handoffReason: string | null;
  handoffSummary: string | null;
  userMessageCount: number;
  needsAttention: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string | null;
}

/** Events streamed from /api/chat to the browser (newline-delimited JSON). */
export type StreamEvent =
  | { type: "user-message"; message: ChatMessage }
  | { type: "step"; step: TraceStep }
  | { type: "text"; delta: string }
  | { type: "part"; part: MessagePart }
  | { type: "done"; message: ChatMessage; conversation: ConversationView }
  | { type: "error"; error: string };
