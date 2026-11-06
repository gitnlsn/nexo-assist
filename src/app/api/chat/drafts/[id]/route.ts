import { z } from "zod";
import { requireUser } from "@/server/auth";
import { resolveDraft } from "@/server/drafts";
import { route } from "@/server/http";

const Body = z.object({ action: z.enum(["confirm", "cancel"]) });

/** The employee confirms or discards a draft proposed by the agent. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/chat/drafts/[id]">) => {
  const user = await requireUser("employee");
  const { id } = await ctx.params;
  const { action } = Body.parse(await req.json());
  return Response.json(await resolveDraft(user, id, action));
});
