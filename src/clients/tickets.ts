import type { NewTicket, Ticket, TicketUpdate } from "@/shared/domain";

/**
 * HTTP client for the (flaky, legacy) ticket service. Used by the agent tools and the BFF routes.
 * Retries 5xx / network errors / timeouts with exponential backoff and jitter; 4xx are returned as-is.
 */

export type TicketActor = { kind: "employee" | "analyst"; id: string; name: string };

export class TicketsUnavailableError extends Error {
  constructor(public readonly attempts: number) {
    super("O sistema de chamados está indisponível no momento.");
  }
}

export class TicketsRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface CallInfo {
  attempts: number;
  durationMs: number;
}

export interface TicketsClientOptions {
  baseUrl?: string;
  token?: string;
  maxAttempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  /** Called on every call with its attempt count, so callers can surface retries in the decision trace. */
  onCall?: (info: CallInfo & { path: string }) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createTicketsClient(actor: TicketActor, opts: TicketsClientOptions = {}) {
  const baseUrl = opts.baseUrl ?? process.env.TICKETS_SERVICE_URL ?? "http://localhost:3000/api/tickets-service";
  const token = opts.token ?? process.env.TICKETS_SERVICE_TOKEN ?? "";
  const maxAttempts = opts.maxAttempts ?? 4;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  const doFetch = opts.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const started = Date.now();
    let attempt = 0;
    while (true) {
      attempt++;
      let res: Response | null = null;
      try {
        res = await doFetch(`${baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            "x-actor": `${actor.kind}:${actor.id}`,
            "x-actor-name": encodeURIComponent(actor.name),
            ...(body ? { "content-type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
      } catch {
        res = null; // network error or timeout → retryable
      }

      if (res && res.status < 500) {
        opts.onCall?.({ path, attempts: attempt, durationMs: Date.now() - started });
        const data = (await res.json().catch(() => ({}))) as T & { error?: string };
        if (!res.ok) throw new TicketsRequestError(res.status, data.error ?? `Erro ${res.status}`);
        return data;
      }
      if (attempt >= maxAttempts) {
        opts.onCall?.({ path, attempts: attempt, durationMs: Date.now() - started });
        throw new TicketsUnavailableError(attempt);
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs);
    }
  }

  return {
    async list(filter: { requesterId?: string } = {}): Promise<Ticket[]> {
      const qs = filter.requesterId ? `?requesterId=${encodeURIComponent(filter.requesterId)}` : "";
      return (await request<{ tickets: Ticket[] }>("GET", `/tickets${qs}`)).tickets;
    },
    async get(id: string): Promise<Ticket> {
      return (await request<{ ticket: Ticket }>("GET", `/tickets/${encodeURIComponent(id)}`)).ticket;
    },
    async create(input: NewTicket): Promise<Ticket> {
      return (await request<{ ticket: Ticket }>("POST", "/tickets", input)).ticket;
    },
    async update(id: string, update: TicketUpdate): Promise<Ticket> {
      return (await request<{ ticket: Ticket }>("PATCH", `/tickets/${encodeURIComponent(id)}`, update)).ticket;
    },
    async transfer(id: string, note: string): Promise<Ticket> {
      return (await request<{ ticket: Ticket }>("POST", `/tickets/${encodeURIComponent(id)}/transfer`, { note })).ticket;
    },
  };
}

export type TicketsClient = ReturnType<typeof createTicketsClient>;
