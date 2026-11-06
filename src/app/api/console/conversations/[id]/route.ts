import { createTicketsClient } from "@/clients/tickets";
import { getUserById, requireUser } from "@/server/auth";
import { getConversation, listMessages } from "@/server/conversations";
import { HttpError, route, withCurrentDraftStatus } from "@/server/http";
import { toTicketView } from "@/shared/rules/tickets";

/** Conversation detail for the analyst: history with decision traces, employee and their tickets. */
export const GET = route(async (_req: Request, ctx: RouteContext<"/api/console/conversations/[id]">) => {
  const analyst = await requireUser("analyst");
  const { id } = await ctx.params;
  const conversation = await getConversation(id);
  if (!conversation) throw new HttpError(404, "Conversa não encontrada.");
  const employee = await getUserById(conversation.employeeId);
  const messages = await withCurrentDraftStatus(await listMessages(id));

  let tickets = null;
  let ticketsError: string | null = null;
  try {
    const client = createTicketsClient({ kind: "analyst", id: analyst.id, name: analyst.name });
    const now = new Date();
    tickets = (await client.list({ requesterId: conversation.employeeId })).map((t) => toTicketView(t, now));
  } catch (err) {
    ticketsError = err instanceof Error ? err.message : "Sistema de chamados indisponível.";
  }
  return Response.json({ conversation, employee, messages, tickets, ticketsError });
});
