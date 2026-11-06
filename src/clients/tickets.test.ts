import { describe, expect, it, vi } from "vitest";
import { TicketsRequestError, TicketsUnavailableError, createTicketsClient } from "./tickets";

const actor = { kind: "employee" as const, id: "u-ana", name: "Ana Souza" };
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("tickets client", () => {
  it("retries 503s and succeeds, reporting the attempts", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ error: "down" }, 503))
      .mockResolvedValueOnce(ok({ error: "down" }, 503))
      .mockResolvedValueOnce(ok({ tickets: [] }));
    const onCall = vi.fn();
    const client = createTicketsClient(actor, { fetchImpl, baseDelayMs: 1, token: "t", baseUrl: "http://x", onCall });

    await expect(client.list()).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ attempts: 3 }));
  });

  it("gives up after maxAttempts with a TicketsUnavailableError", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNREFUSED"));
    const client = createTicketsClient(actor, { fetchImpl, baseDelayMs: 1, maxAttempts: 3, token: "t", baseUrl: "http://x" });
    await expect(client.list()).rejects.toBeInstanceOf(TicketsUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok({ error: "Chamado INC-1 não encontrado." }, 404));
    const client = createTicketsClient(actor, { fetchImpl, baseDelayMs: 1, token: "t", baseUrl: "http://x" });
    await expect(client.get("INC-1")).rejects.toBeInstanceOf(TicketsRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends the actor from the session, not from user input", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok({ tickets: [] }));
    const client = createTicketsClient(actor, { fetchImpl, token: "t", baseUrl: "http://x" });
    await client.list();
    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["x-actor"]).toBe("employee:u-ana");
  });
});
