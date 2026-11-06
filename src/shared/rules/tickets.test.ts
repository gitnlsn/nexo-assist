import { describe, expect, it } from "vitest";
import { canReopen, isOverdue, similarity } from "./tickets";

const now = new Date("2026-11-06T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe("ticket rules", () => {
  it("only active tickets past their deadline are overdue", () => {
    expect(isOverdue({ status: "waiting_analyst", dueAt: daysAgo(1) }, now)).toBe(true);
    expect(isOverdue({ status: "waiting_analyst", dueAt: daysAgo(-1) }, now)).toBe(false);
    expect(isOverdue({ status: "resolved", dueAt: daysAgo(1) }, now)).toBe(false);
  });

  it("resolved tickets can be reopened for 7 days", () => {
    expect(canReopen({ status: "resolved", resolvedAt: daysAgo(4) }, now)).toBe(true);
    expect(canReopen({ status: "resolved", resolvedAt: daysAgo(8) }, now)).toBe(false);
    expect(canReopen({ status: "open", resolvedAt: null }, now)).toBe(false);
  });

  it("similarity ignores accents and stopwords", () => {
    expect(similarity("VPN desconecta a cada 30 minutos", "minha vpn está desconectando")).toBeGreaterThan(0);
    expect(similarity("Notebook lento", "Senha do SAP bloqueada")).toBe(0);
  });
});
