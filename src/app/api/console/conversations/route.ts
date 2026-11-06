import { z } from "zod";
import { requireUser } from "@/server/auth";
import { countByFilter, listConsoleConversations } from "@/server/conversations";
import { route } from "@/server/http";

const Query = z.object({
  filter: z.enum(["attention", "agent", "mine", "all"]).default("attention"),
  q: z.string().max(100).optional(),
});

export const GET = route(async (req: Request) => {
  const analyst = await requireUser("analyst");
  const params = new URL(req.url).searchParams;
  const { filter, q } = Query.parse({ filter: params.get("filter") ?? undefined, q: params.get("q") ?? undefined });
  const [conversations, counts] = await Promise.all([
    listConsoleConversations(filter, analyst.id, q),
    countByFilter(analyst.id),
  ]);
  return Response.json({ conversations, counts, analyst: { id: analyst.id, name: analyst.name, title: analyst.title } });
});
