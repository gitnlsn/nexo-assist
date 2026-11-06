import { z } from "zod";

/**
 * Domain vocabulary shared by the UI, the agent and the ticket service.
 * Values follow Anexo A of the PRD (service desk rules).
 */

export const TICKET_TYPES = ["INC", "REQ"] as const;
export const TicketTypeSchema = z.enum(TICKET_TYPES);
export type TicketType = z.infer<typeof TicketTypeSchema>;

export const CATEGORIES = [
  "Acesso",
  "Rede e VPN",
  "Hardware",
  "Software",
  "E-mail",
  "Outros",
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const PRIORITIES = ["Crítica", "Alta", "Média", "Baixa"] as const;
export const PrioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof PrioritySchema>;

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_analyst",
  "waiting_user",
  "approved",
  "resolved",
  "closed",
] as const;
export const TicketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  waiting_analyst: "Aguardando analista",
  waiting_user: "Aguardando você",
  approved: "Aprovado",
  resolved: "Resolvido",
  closed: "Fechado",
};

/** Statuses in which a ticket is still being worked on (and therefore can be overdue). */
export const ACTIVE_STATUSES: readonly TicketStatus[] = [
  "open",
  "in_progress",
  "waiting_analyst",
  "waiting_user",
  "approved",
];

export const IMPACTS = ["individual", "equipe", "empresa"] as const;
export const ImpactSchema = z.enum(IMPACTS);
export type Impact = z.infer<typeof ImpactSchema>;

export const TicketEventSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  at: z.string(),
  author: z.string(),
  kind: z.enum(["created", "comment", "status", "reopened", "transferred"]),
  text: z.string(),
});
export type TicketEvent = z.infer<typeof TicketEventSchema>;

export const TicketSchema = z.object({
  id: z.string(),
  type: TicketTypeSchema,
  title: z.string(),
  description: z.string(),
  category: CategorySchema,
  priority: PrioritySchema,
  affected: z.string(),
  requesterId: z.string(),
  status: TicketStatusSchema,
  queue: z.enum(["N1", "N2"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Deadline for the next response from the service desk (first response or next update). */
  dueAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  events: z.array(TicketEventSchema).optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const NewTicketSchema = z.object({
  type: TicketTypeSchema,
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(4000),
  category: CategorySchema,
  priority: PrioritySchema,
  affected: z.string().min(2).max(200),
});
export type NewTicket = z.infer<typeof NewTicketSchema>;

export const TicketUpdateSchema = z.object({
  comment: z.string().min(2).max(4000),
  reopen: z.boolean().default(false),
  priority: PrioritySchema.optional(),
});
export type TicketUpdate = z.infer<typeof TicketUpdateSchema>;

export const USER_ROLES = ["employee", "analyst"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: string;
  title: string;
}

export const CONVERSATION_STATUSES = [
  "agent",
  "waiting_analyst",
  "with_analyst",
  "closed",
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MAX_USER_MESSAGES_PER_SESSION = 30;
