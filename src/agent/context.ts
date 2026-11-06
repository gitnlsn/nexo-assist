import type { RequestContext } from "@mastra/core/request-context";
import type { TicketsClient } from "@/clients/tickets";
import type { AgentAction, Intent, MessagePart } from "@/shared/chat";
import type { Category, Priority, TicketType } from "@/shared/domain";

/**
 * Everything a tool needs for one agent turn, injected by the server through Mastra's RequestContext.
 * The agent package never touches the database directly and never receives the user id from the LLM:
 * identity is part of this context, built from the session cookie.
 */

export interface DraftInput {
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  affected: string;
  comment?: string;
  reopen?: boolean;
}

export interface RecordedDecision {
  intent: Intent;
  understood: string;
  facts: { name: string; value: string }[];
  action: AgentAction;
  confidence: number;
  reason: string;
  rulesApplied: string[];
}

export type HandoffReason = "pedido_do_funcionario" | "caso_critico" | "chamado_vencido" | "baixa_confianca";

export interface TurnServices {
  user: { id: string; name: string; email: string; department: string };
  conversationId: string;
  now: Date;
  tickets: TicketsClient;
  createDraft(kind: "create" | "update", ticketId: string | null, draft: DraftInput): Promise<{ id: string }>;
  handoff(reason: HandoffReason, summary: string, ticketId?: string): Promise<void>;
  /** Adds a UI element (ticket card, draft, quick replies...) to the agent's reply. */
  addPart(part: MessagePart): void;
  recordDecision(decision: RecordedDecision): void;
}

export type AgentRequestContext = { turn: TurnServices };

export function getTurn(ctx: { requestContext?: RequestContext<AgentRequestContext> | RequestContext } | undefined): TurnServices {
  const turn = (ctx?.requestContext as RequestContext<AgentRequestContext> | undefined)?.get("turn");
  if (!turn) throw new Error("Turn context missing: tools must run inside runAgentTurn().");
  return turn;
}
