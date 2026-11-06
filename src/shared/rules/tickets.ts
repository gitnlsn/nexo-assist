import { ACTIVE_STATUSES, type Ticket } from "../domain";
import type { TicketView } from "../chat";
import { describeDeadline } from "./sla";

export const REOPEN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isActive(ticket: Pick<Ticket, "status">): boolean {
  return ACTIVE_STATUSES.includes(ticket.status);
}

/** A ticket is overdue when it is still active and the service desk missed the response deadline. */
export function isOverdue(ticket: Pick<Ticket, "status" | "dueAt">, now: Date): boolean {
  if (!isActive(ticket) || !ticket.dueAt) return false;
  return new Date(ticket.dueAt).getTime() < now.getTime();
}

/** Resolved tickets can be reopened for up to 7 days after resolution. */
export function canReopen(ticket: Pick<Ticket, "status" | "resolvedAt">, now: Date): boolean {
  if (ticket.status !== "resolved" || !ticket.resolvedAt) return false;
  return now.getTime() - new Date(ticket.resolvedAt).getTime() <= REOPEN_WINDOW_DAYS * DAY_MS;
}

export function toTicketView(ticket: Ticket, now: Date): TicketView {
  return {
    ...ticket,
    overdue: isOverdue(ticket, now),
    dueLabel: isActive(ticket) && ticket.dueAt ? describeDeadline(new Date(ticket.dueAt), now) : null,
  };
}

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "um", "uma",
  "para", "pra", "com", "sem", "meu", "minha", "que", "nao", "não", "esta", "está", "por", "ao", "se",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Jaccard-like overlap between two texts, used to surface duplicate candidates (the LLM makes the final call). */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}
