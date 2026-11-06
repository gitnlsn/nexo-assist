import { z } from "zod";
import { TicketsRequestError, TicketsUnavailableError } from "@/clients/tickets";
import type { ChatMessage } from "@/shared/chat";
import { AuthError } from "./auth";
import { InvalidTransitionError } from "./conversation-state";
import { getDraftStatuses } from "./conversations";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Maps known errors to JSON responses so route handlers stay focused on the happy path. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof AuthError) return Response.json({ error: err.message }, { status: err.status });
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      if (err instanceof InvalidTransitionError) return Response.json({ error: err.message }, { status: 409 });
      if (err instanceof z.ZodError) return Response.json({ error: "Dados inválidos.", issues: err.issues }, { status: 400 });
      if (err instanceof TicketsUnavailableError) return Response.json({ error: err.message }, { status: 503 });
      if (err instanceof TicketsRequestError) return Response.json({ error: err.message }, { status: err.status });
      console.error("[api]", err);
      return Response.json({ error: "Erro inesperado. Tente novamente." }, { status: 500 });
    }
  };
}

/** Draft cards are stored with the status they had when proposed; refresh it from the drafts table. */
export async function withCurrentDraftStatus(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const ids = messages.flatMap((m) => m.parts.flatMap((p) => (p.type === "draft" ? [p.draft.id] : [])));
  const statuses = await getDraftStatuses(ids);
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === "draft" && statuses.has(p.draft.id)
        ? { ...p, draft: { ...p.draft, status: statuses.get(p.draft.id) as typeof p.draft.status } }
        : p,
    ),
  }));
}
