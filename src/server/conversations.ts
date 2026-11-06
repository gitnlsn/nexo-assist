import { and, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { ChatMessage, ConversationView, DecisionTrace, MessagePart, MessageRole } from "@/shared/chat";
import type { ConversationStatus } from "@/shared/domain";
import { getDb } from "./db/client";
import { type DraftPayload, conversationsTable, draftsTable, messagesTable, usersTable } from "./db/schema";
import { type ConversationEvent, transition } from "./conversation-state";

type ConversationRow = typeof conversationsTable.$inferSelect;
type MessageRow = typeof messagesTable.$inferSelect;

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    authorName: row.authorName,
    text: row.text,
    parts: row.parts ?? [],
    trace: row.trace ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toView(row: ConversationRow, extra: { analystName?: string | null; preview?: string | null } = {}): ConversationView {
  return {
    id: row.id,
    employeeId: row.employeeId,
    status: row.status,
    analystId: row.analystId,
    analystName: extra.analystName ?? null,
    handoffReason: row.handoffReason,
    handoffSummary: row.handoffSummary,
    userMessageCount: row.userMessageCount,
    needsAttention: row.needsAttention,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMessagePreview: extra.preview ?? null,
  };
}

async function analystName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const [u] = await getDb().select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, id));
  return u?.name ?? null;
}

export async function getConversationRow(id: string): Promise<ConversationRow | null> {
  const [row] = await getDb().select().from(conversationsTable).where(eq(conversationsTable.id, id));
  return row ?? null;
}

export async function getConversation(id: string): Promise<ConversationView | null> {
  const row = await getConversationRow(id);
  return row ? toView(row, { analystName: await analystName(row.analystId) }) : null;
}

/** The employee's ongoing conversation ("voltar outro dia e continuar de onde parei"). */
export async function getOpenConversationFor(employeeId: string): Promise<ConversationView | null> {
  const [row] = await getDb()
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.employeeId, employeeId), ne(conversationsTable.status, "closed")))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(1);
  return row ? toView(row, { analystName: await analystName(row.analystId) }) : null;
}

export async function createConversation(employeeId: string): Promise<ConversationView> {
  const db = getDb();
  // Only one open conversation per employee: starting a new one closes the previous.
  await db
    .update(conversationsTable)
    .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(conversationsTable.employeeId, employeeId), ne(conversationsTable.status, "closed")));
  const [row] = await db.insert(conversationsTable).values({ employeeId }).returning();
  return toView(row);
}

export async function listMessages(conversationId: string, limit = 200): Promise<ChatMessage[]> {
  const rows = await getDb()
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit);
  return rows.reverse().map(toMessage);
}

export async function addMessage(input: {
  conversationId: string;
  role: MessageRole;
  text: string;
  authorName?: string | null;
  authorId?: string | null;
  parts?: MessagePart[];
  trace?: DecisionTrace | null;
}): Promise<ChatMessage> {
  const db = getDb();
  const [row] = await db
    .insert(messagesTable)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      text: input.text,
      authorName: input.authorName ?? null,
      authorId: input.authorId ?? null,
      parts: input.parts ?? [],
      trace: input.trace ?? null,
    })
    .returning();
  await db
    .update(conversationsTable)
    .set({
      updatedAt: new Date(),
      ...(input.role === "user" ? { userMessageCount: sql`${conversationsTable.userMessageCount} + 1` } : {}),
    })
    .where(eq(conversationsTable.id, input.conversationId));
  return toMessage(row);
}

/** Apply a state-machine event and persist the side data (analyst, handoff reason/summary). */
export async function applyEvent(
  conversationId: string,
  event: ConversationEvent,
  data: { analystId?: string; reason?: string; summary?: string; needsAttention?: boolean } = {},
): Promise<ConversationView> {
  const row = await getConversationRow(conversationId);
  if (!row) throw new Error("Conversa não encontrada.");
  const status: ConversationStatus = transition(row.status, event);
  const patch: Partial<typeof conversationsTable.$inferInsert> = { status, updatedAt: new Date() };
  if (event === "handoff") {
    patch.handoffReason = data.reason ?? null;
    patch.handoffSummary = data.summary ?? null;
    patch.needsAttention = data.needsAttention ?? row.needsAttention;
  }
  if (event === "assume") patch.analystId = data.analystId ?? null;
  if (event === "release") {
    patch.analystId = null;
    patch.needsAttention = false;
  }
  if (event === "close") patch.closedAt = new Date();
  const [updated] = await getDb()
    .update(conversationsTable)
    .set(patch)
    .where(eq(conversationsTable.id, conversationId))
    .returning();
  return toView(updated, { analystName: await analystName(updated.analystId) });
}

export async function markNeedsAttention(conversationId: string): Promise<void> {
  await getDb().update(conversationsTable).set({ needsAttention: true }).where(eq(conversationsTable.id, conversationId));
}

/** Agent turns by this user in the last hour, for the per-user rate limit. */
export async function countRecentUserMessages(employeeId: string, sinceMs: number): Promise<number> {
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(messagesTable)
    .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
    .where(
      and(
        eq(conversationsTable.employeeId, employeeId),
        eq(messagesTable.role, "user"),
        gte(messagesTable.createdAt, new Date(Date.now() - sinceMs)),
      ),
    );
  return r?.n ?? 0;
}

// ---------------------------------------------------------------- drafts

export async function createDraft(input: {
  conversationId: string;
  employeeId: string;
  kind: "create" | "update";
  ticketId?: string | null;
  payload: DraftPayload;
}) {
  const db = getDb();
  // A new proposal replaces any pending one in the same conversation.
  await db
    .update(draftsTable)
    .set({ status: "superseded" })
    .where(and(eq(draftsTable.conversationId, input.conversationId), eq(draftsTable.status, "pending")));
  const [row] = await db
    .insert(draftsTable)
    .values({ ...input, ticketId: input.ticketId ?? null })
    .returning();
  return row;
}

export async function getDraft(id: string) {
  const [row] = await getDb().select().from(draftsTable).where(eq(draftsTable.id, id));
  return row ?? null;
}

export async function setDraftStatus(id: string, status: "confirmed" | "cancelled", resultTicketId?: string) {
  await getDb()
    .update(draftsTable)
    .set({ status, resultTicketId: resultTicketId ?? null })
    .where(and(eq(draftsTable.id, id), eq(draftsTable.status, "pending")));
}

export async function getDraftStatuses(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: draftsTable.id, status: draftsTable.status })
    .from(draftsTable)
    .where(inArray(draftsTable.id, ids));
  return new Map(rows.map((r) => [r.id, r.status]));
}

// ---------------------------------------------------------------- analyst console

export type ConsoleFilter = "attention" | "agent" | "mine" | "all";

export interface ConsoleConversation extends ConversationView {
  employeeName: string;
  employeeEmail: string;
  employeeDepartment: string;
}

export async function listConsoleConversations(
  filter: ConsoleFilter,
  analystId: string,
  search?: string,
): Promise<ConsoleConversation[]> {
  const db = getDb();
  const conditions = [ne(conversationsTable.status, "closed")];
  if (filter === "attention") {
    conditions.push(
      or(
        eq(conversationsTable.status, "waiting_analyst"),
        and(eq(conversationsTable.status, "agent"), eq(conversationsTable.needsAttention, true)),
      )!,
    );
  } else if (filter === "agent") {
    conditions.push(eq(conversationsTable.status, "agent"));
  } else if (filter === "mine") {
    conditions.push(eq(conversationsTable.analystId, analystId));
  }
  if (search?.trim()) {
    conditions.push(or(ilike(usersTable.name, `%${search.trim()}%`), ilike(usersTable.email, `%${search.trim()}%`))!);
  }

  const rows = await db
    .select({ c: conversationsTable, u: usersTable })
    .from(conversationsTable)
    .innerJoin(usersTable, eq(conversationsTable.employeeId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(100);

  const ids = rows.map((r) => r.c.id);
  const previews = new Map<string, string>();
  if (ids.length) {
    const last = await db.execute<{ conversation_id: string; text: string }>(sql`
      select distinct on (conversation_id) conversation_id, text
      from app.messages where conversation_id in ${ids}
      order by conversation_id, created_at desc`);
    for (const m of last) previews.set(m.conversation_id, m.text);
  }
  const analystIds = [...new Set(rows.map((r) => r.c.analystId).filter((x): x is string => !!x))];
  const analysts = analystIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, analystIds))
    : [];
  const analystNames = new Map(analysts.map((a) => [a.id, a.name]));

  return rows.map(({ c, u }) => ({
    ...toView(c, { analystName: c.analystId ? analystNames.get(c.analystId) : null, preview: previews.get(c.id) ?? null }),
    employeeName: u.name,
    employeeEmail: u.email,
    employeeDepartment: u.department,
  }));
}

export async function countByFilter(analystId: string): Promise<Record<ConsoleFilter, number>> {
  const [attention, agent, mine, all] = await Promise.all(
    (["attention", "agent", "mine", "all"] as const).map((f) => listConsoleConversations(f, analystId).then((r) => r.length)),
  );
  return { attention, agent, mine, all };
}
