import type { ConversationStatus } from "@/shared/domain";

/**
 * Who is in charge of a conversation. Pure state machine, so the handoff rules are easy to test:
 *
 *   agent ──handoff──▶ waiting_analyst ──assume──▶ with_analyst ──release──▶ agent
 *     │                      │                          │
 *     └──────────────────────┴────────── close ─────────┴──▶ closed
 *
 * The agent only answers in "agent". In every other state user messages are stored for the analyst.
 */
export type ConversationEvent = "handoff" | "assume" | "release" | "close";

const TRANSITIONS: Record<ConversationStatus, Partial<Record<ConversationEvent, ConversationStatus>>> = {
  agent: { handoff: "waiting_analyst", assume: "with_analyst", close: "closed" },
  waiting_analyst: { assume: "with_analyst", release: "agent", close: "closed" },
  with_analyst: { release: "agent", close: "closed" },
  closed: {},
};

export class InvalidTransitionError extends Error {
  constructor(from: ConversationStatus, event: ConversationEvent) {
    super(`Não é possível "${event}" uma conversa em "${from}".`);
  }
}

export function transition(from: ConversationStatus, event: ConversationEvent): ConversationStatus {
  const to = TRANSITIONS[from][event];
  if (!to) throw new InvalidTransitionError(from, event);
  return to;
}

export function agentCanRespond(status: ConversationStatus): boolean {
  return status === "agent";
}

export function employeeCanWrite(status: ConversationStatus): boolean {
  return status !== "closed";
}
