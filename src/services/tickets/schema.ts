import { index, pgSchema, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Storage of the simulated legacy ticket system. It lives in its own Postgres schema ("tickets")
 * and is only accessed by code inside src/services/tickets.
 */
export const ticketsSchema = pgSchema("tickets");

export const incSequence = ticketsSchema.sequence("inc_seq", { startWith: 20500 });
export const reqSequence = ticketsSchema.sequence("req_seq", { startWith: 10500 });

export const ticketsTable = ticketsSchema.table(
  "tickets",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["INC", "REQ"] }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    priority: text("priority").notNull(),
    affected: text("affected").notNull(),
    requesterId: text("requester_id").notNull(),
    status: text("status").notNull(),
    queue: text("queue", { enum: ["N1", "N2"] }).notNull().default("N1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("tickets_requester_idx").on(t.requesterId)],
);

export const ticketEventsTable = ticketsSchema.table(
  "ticket_events",
  {
    id: serial("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => ticketsTable.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull(),
    author: text("author").notNull(),
    kind: text("kind", { enum: ["created", "comment", "status", "reopened", "transferred"] }).notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("ticket_events_ticket_idx").on(t.ticketId)],
);
