import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { NewTicketSchema, TicketUpdateSchema } from "@/shared/domain";
import {
  type Actor,
  TicketServiceError,
  createTicket,
  getTicket,
  listTickets,
  transferTicket,
  updateTicket,
} from "./repository";

/**
 * HTTP facade of the simulated legacy ticket system.
 * - Callers authenticate with a shared service token and say on whose behalf they act
 *   (`X-Actor: employee:<id>` or `analyst:<id>`), like a back-office integration would.
 * - It is deliberately flaky: TICKETS_FAILURE_RATE of requests fail with 503 and TICKETS_LATENCY_MS is added,
 *   reproducing the "unavailable for a few seconds" behaviour described in the PRD.
 */

const ActorHeaderSchema = z
  .string()
  .regex(/^(employee|analyst):[\w.-]+$/)
  .transform((v): Actor => {
    const [kind, id] = v.split(":") as ["employee" | "analyst", string];
    return { kind, id };
  });

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

function authenticate(req: Request): { actor: Actor; authorName: string } | Response {
  const expected = process.env.TICKETS_SERVICE_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return json(401, { error: "unauthorized" });
  }
  const actor = ActorHeaderSchema.safeParse(req.headers.get("x-actor") ?? "");
  if (!actor.success) return json(400, { error: "invalid X-Actor header" });
  const authorName = decodeURIComponent(req.headers.get("x-actor-name") ?? actor.data.id);
  return { actor: actor.data, authorName };
}

async function simulateLegacyBehaviour(): Promise<Response | null> {
  const latency = Number(process.env.TICKETS_LATENCY_MS ?? 0);
  if (latency > 0) await new Promise((r) => setTimeout(r, latency));
  const failureRate = Number(process.env.TICKETS_FAILURE_RATE ?? 0);
  if (Math.random() < failureRate) {
    return json(503, { error: "Sistema de chamados temporariamente indisponível." });
  }
  return null;
}

type Handler = (ctx: { req: Request; actor: Actor; authorName: string; params: Record<string, string> }) => Promise<Response>;

function handle(fn: Handler) {
  return async (req: Request, routeCtx?: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const auth = authenticate(req);
    if (auth instanceof Response) return auth;
    const outage = await simulateLegacyBehaviour();
    if (outage) return outage;
    try {
      const params = (await routeCtx?.params) ?? {};
      return await fn({ req, ...auth, params });
    } catch (err) {
      if (err instanceof TicketServiceError) {
        const status = { not_found: 404, conflict: 409, forbidden: 403, invalid: 400 }[err.code];
        return json(status, { error: err.message, code: err.code });
      }
      if (err instanceof z.ZodError) return json(400, { error: "Dados inválidos.", issues: err.issues });
      console.error("[tickets-service]", err);
      return json(500, { error: "Erro interno no sistema de chamados." });
    }
  };
}

export const listOrCreate = {
  GET: handle(async ({ req, actor }) => {
    const requesterId = new URL(req.url).searchParams.get("requesterId") ?? undefined;
    return json(200, { tickets: await listTickets(actor, { requesterId }) });
  }),
  POST: handle(async ({ req, actor, authorName }) => {
    const input = NewTicketSchema.parse(await req.json());
    return json(201, { ticket: await createTicket(actor, input, authorName) });
  }),
};

export const single = {
  GET: handle(async ({ actor, params }) => json(200, { ticket: await getTicket(actor, params.id) })),
  PATCH: handle(async ({ req, actor, authorName, params }) => {
    const update = TicketUpdateSchema.parse(await req.json());
    return json(200, { ticket: await updateTicket(actor, params.id, update, authorName) });
  }),
};

export const transfer = {
  POST: handle(async ({ req, actor, authorName, params }) => {
    const { note } = z.object({ note: z.string().min(1).max(4000) }).parse(await req.json());
    return json(200, { ticket: await transferTicket(actor, params.id, note, authorName) });
  }),
};
