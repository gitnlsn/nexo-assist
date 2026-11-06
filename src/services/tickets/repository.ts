import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  type NewTicket,
  type Ticket,
  type TicketEvent,
  type TicketStatus,
  type TicketUpdate,
} from "@/shared/domain";
import { computeDueAt } from "@/shared/rules/sla";
import { canReopen, isActive } from "@/shared/rules/tickets";
import { getTicketsDb } from "./db";
import { ticketEventsTable, ticketsTable } from "./schema";

export class TicketServiceError extends Error {
  constructor(
    public readonly code: "not_found" | "conflict" | "forbidden" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

/** Who is calling. Employees only ever see their own tickets; analysts see everything. */
export type Actor = { kind: "employee"; id: string } | { kind: "analyst"; id: string };

type TicketRow = typeof ticketsTable.$inferSelect;
type EventRow = typeof ticketEventsTable.$inferSelect;

function toTicket(row: TicketRow, events?: EventRow[]): Ticket {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    category: row.category as Ticket["category"],
    priority: row.priority as Ticket["priority"],
    affected: row.affected,
    requesterId: row.requesterId,
    status: row.status as TicketStatus,
    queue: row.queue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    dueAt: row.dueAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    events: events?.map(
      (e): TicketEvent => ({
        id: String(e.id),
        ticketId: e.ticketId,
        at: e.at.toISOString(),
        author: e.author,
        kind: e.kind,
        text: e.text,
      }),
    ),
  };
}

export async function listTickets(actor: Actor, filter: { requesterId?: string } = {}): Promise<Ticket[]> {
  const db = getTicketsDb();
  // Privacy: an employee's requesterId always comes from the actor, never from the query.
  const requesterId = actor.kind === "employee" ? actor.id : filter.requesterId;
  const rows = await db
    .select()
    .from(ticketsTable)
    .where(requesterId ? eq(ticketsTable.requesterId, requesterId) : undefined)
    .orderBy(desc(ticketsTable.updatedAt))
    .limit(50);
  return rows.map((r) => toTicket(r));
}

async function loadOwned(actor: Actor, id: string): Promise<TicketRow> {
  const db = getTicketsDb();
  const [row] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, id.toUpperCase()));
  // Same answer for "does not exist" and "belongs to someone else", so ticket IDs cannot be probed.
  if (!row || (actor.kind === "employee" && row.requesterId !== actor.id)) {
    throw new TicketServiceError("not_found", `Chamado ${id} não encontrado.`);
  }
  return row;
}

export async function getTicket(actor: Actor, id: string): Promise<Ticket> {
  const row = await loadOwned(actor, id);
  const events = await getTicketsDb()
    .select()
    .from(ticketEventsTable)
    .where(eq(ticketEventsTable.ticketId, row.id))
    .orderBy(asc(ticketEventsTable.at));
  return toTicket(row, events);
}

export async function createTicket(actor: Actor, input: NewTicket, authorName: string): Promise<Ticket> {
  if (actor.kind !== "employee") throw new TicketServiceError("forbidden", "Somente funcionários abrem chamados.");
  const db = getTicketsDb();
  const now = new Date();
  return db.transaction(async (tx) => {
    const seqName = input.type === "INC" ? "tickets.inc_seq" : "tickets.req_seq";
    const [{ next }] = await tx.execute<{ next: string }>(sql`select nextval(${seqName}::regclass)::text as next`);
    const id = `${input.type}-${next}`;
    const [row] = await tx
      .insert(ticketsTable)
      .values({
        id,
        ...input,
        requesterId: actor.id,
        status: "open",
        queue: "N1",
        createdAt: now,
        updatedAt: now,
        dueAt: computeDueAt(input.priority, now),
      })
      .returning();
    await tx.insert(ticketEventsTable).values({ ticketId: id, at: now, author: authorName, kind: "created", text: input.description });
    return toTicket(row);
  });
}

export async function updateTicket(
  actor: Actor,
  id: string,
  update: TicketUpdate,
  authorName: string,
): Promise<Ticket> {
  const row = await loadOwned(actor, id);
  const now = new Date();
  const db = getTicketsDb();

  if (update.reopen) {
    if (!canReopen(toTicket(row), now)) {
      throw new TicketServiceError("conflict", `O chamado ${row.id} não pode ser reaberto (só até 7 dias após a resolução).`);
    }
  } else if (!isActive(toTicket(row))) {
    throw new TicketServiceError("conflict", `O chamado ${row.id} está encerrado e não pode ser complementado.`);
  }

  const priority = update.priority ?? (row.priority as Ticket["priority"]);
  await db.transaction(async (tx) => {
    await tx
      .update(ticketsTable)
      .set({
        updatedAt: now,
        priority,
        ...(update.reopen
          ? { status: "open", resolvedAt: null, dueAt: computeDueAt(priority, now) }
          : update.priority && update.priority !== row.priority
            ? { dueAt: computeDueAt(priority, now) }
            : {}),
      })
      .where(eq(ticketsTable.id, row.id));
    await tx.insert(ticketEventsTable).values({
      ticketId: row.id,
      at: now,
      author: authorName,
      kind: update.reopen ? "reopened" : "comment",
      text: update.comment,
    });
  });
  return getTicket(actor, row.id);
}

export async function transferTicket(actor: Actor, id: string, note: string, authorName: string): Promise<Ticket> {
  const row = await loadOwned(actor, id);
  if (!isActive(toTicket(row))) {
    throw new TicketServiceError("conflict", `O chamado ${row.id} não está ativo.`);
  }
  const now = new Date();
  const db = getTicketsDb();
  await db.transaction(async (tx) => {
    await tx
      .update(ticketsTable)
      .set({ status: "waiting_analyst", queue: "N2", updatedAt: now })
      .where(and(eq(ticketsTable.id, row.id)));
    await tx.insert(ticketEventsTable).values({ ticketId: row.id, at: now, author: authorName, kind: "transferred", text: note });
  });
  return getTicket(actor, row.id);
}
