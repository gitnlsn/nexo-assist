import { z } from "zod";
import { requireUser } from "@/server/auth";
import { addMessage, applyEvent, getConversation } from "@/server/conversations";
import { HttpError, route } from "@/server/http";

const Body = z.object({ action: z.enum(["assume", "release", "close"]) });

const NOTES = {
  assume: (name: string) => `${name} assumiu o atendimento. O Nexo Assist está pausado.`,
  release: (name: string) => `${name} devolveu a conversa ao Nexo Assist.`,
  close: (name: string) => `${name} encerrou o atendimento.`,
};

/** Analyst actions: take over (agent paused), give back to the agent, or close. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/console/conversations/[id]/actions">) => {
  const analyst = await requireUser("analyst");
  const { id } = await ctx.params;
  const { action } = Body.parse(await req.json());
  const current = await getConversation(id);
  if (!current) throw new HttpError(404, "Conversa não encontrada.");
  if (action !== "assume" && current.status === "with_analyst" && current.analystId !== analyst.id) {
    throw new HttpError(403, `Esta conversa está com ${current.analystName}.`);
  }
  const conversation = await applyEvent(id, action, { analystId: analyst.id });
  await addMessage({ conversationId: id, role: "system", text: NOTES[action](analyst.name) });
  return Response.json({ conversation });
});
