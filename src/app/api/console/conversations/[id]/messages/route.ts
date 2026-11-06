import { z } from "zod";
import { requireUser } from "@/server/auth";
import { addMessage, getConversation } from "@/server/conversations";
import { HttpError, route } from "@/server/http";

const Body = z.object({ text: z.string().trim().min(1).max(4000) });

/** Analyst replies. Only the analyst who assumed the conversation can write. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/console/conversations/[id]/messages">) => {
  const analyst = await requireUser("analyst");
  const { id } = await ctx.params;
  const { text } = Body.parse(await req.json());
  const conversation = await getConversation(id);
  if (!conversation) throw new HttpError(404, "Conversa não encontrada.");
  if (conversation.status !== "with_analyst" || conversation.analystId !== analyst.id) {
    throw new HttpError(409, "Assuma a conversa antes de responder.");
  }
  const message = await addMessage({ conversationId: id, role: "analyst", text, authorName: analyst.name, authorId: analyst.id });
  return Response.json({ message });
});
