import { boolean, index, integer, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { DecisionTrace, MessagePart } from "@/shared/chat";

/** Storage of the Nexo Assist application itself (users, conversations, messages, drafts). */
export const appSchema = pgSchema("app");

export const usersTable = appSchema.table("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["employee", "analyst"] }).notNull(),
  department: text("department").notNull(),
  title: text("title").notNull(),
});

export const conversationsTable = appSchema.table(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status", { enum: ["agent", "waiting_analyst", "with_analyst", "closed"] })
      .notNull()
      .default("agent"),
    analystId: text("analyst_id").references(() => usersTable.id),
    handoffReason: text("handoff_reason"),
    handoffSummary: text("handoff_summary"),
    /** Set when the agent was not confident about its decision; surfaces the conversation to analysts. */
    needsAttention: boolean("needs_attention").notNull().default(false),
    userMessageCount: integer("user_message_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("conversations_employee_idx").on(t.employeeId), index("conversations_status_idx").on(t.status)],
);

export const messagesTable = appSchema.table(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "agent", "analyst", "system"] }).notNull(),
    authorName: text("author_name"),
    authorId: text("author_id"),
    text: text("text").notNull(),
    parts: jsonb("parts").$type<MessagePart[]>().notNull().default([]),
    trace: jsonb("trace").$type<DecisionTrace>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export interface DraftPayload {
  type: "INC" | "REQ";
  title: string;
  description: string;
  category: string;
  priority: string;
  affected: string;
  comment?: string;
  reopen?: boolean;
}

/**
 * A ticket creation/update proposed by the agent. Nothing reaches the ticket system until the employee
 * confirms the draft through POST /api/chat/drafts/[id] (enforced by the server, not by the prompt).
 */
export const draftsTable = appSchema.table("drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull(),
  kind: text("kind", { enum: ["create", "update"] }).notNull(),
  ticketId: text("ticket_id"),
  payload: jsonb("payload").$type<DraftPayload>().notNull(),
  status: text("status", { enum: ["pending", "confirmed", "cancelled", "superseded"] })
    .notNull()
    .default("pending"),
  resultTicketId: text("result_ticket_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
