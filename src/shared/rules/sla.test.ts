import { describe, expect, it } from "vitest";
import { addBusinessDays, addBusinessHours, computeDueAt, describeDeadline } from "./sla";

// All instants are written in São Paulo time (-03:00) for readability.
const sp = (iso: string) => new Date(`${iso}-03:00`);

describe("business-hours SLA", () => {
  it("adds hours inside the same business day", () => {
    expect(addBusinessHours(sp("2026-11-04T09:00:00"), 4)).toEqual(sp("2026-11-04T13:00:00"));
  });

  it("rolls the remainder over to the next business morning", () => {
    expect(addBusinessHours(sp("2026-11-04T16:00:00"), 4)).toEqual(sp("2026-11-05T10:00:00"));
  });

  it("starts counting at 08:00 when the ticket is opened at night", () => {
    expect(addBusinessHours(sp("2026-11-04T22:30:00"), 4)).toEqual(sp("2026-11-05T12:00:00"));
  });

  it("skips weekends (Friday 17h + 4h = Monday 11h)", () => {
    expect(addBusinessHours(sp("2026-11-06T17:00:00"), 4)).toEqual(sp("2026-11-09T11:00:00"));
  });

  it("counts business days skipping the weekend", () => {
    expect(addBusinessDays(sp("2026-11-05T10:00:00"), 3)).toEqual(sp("2026-11-10T10:00:00"));
  });

  it("critical tickets run on wall-clock time (24h on-call)", () => {
    expect(computeDueAt("Crítica", sp("2026-11-07T23:30:00"))).toEqual(sp("2026-11-08T00:30:00"));
  });

  it("maps each priority to its deadline", () => {
    const start = sp("2026-11-04T09:00:00");
    expect(computeDueAt("Alta", start)).toEqual(sp("2026-11-04T13:00:00"));
    expect(computeDueAt("Média", start)).toEqual(sp("2026-11-09T09:00:00"));
    expect(computeDueAt("Baixa", start)).toEqual(sp("2026-11-11T09:00:00"));
  });
});

describe("describeDeadline", () => {
  const now = sp("2026-11-04T10:00:00");
  it("describes deadlines today, tomorrow and overdue", () => {
    expect(describeDeadline(sp("2026-11-04T14:00:00"), now)).toBe("vence hoje às 14:00");
    expect(describeDeadline(sp("2026-11-05T09:00:00"), now)).toBe("vence amanhã às 09:00");
    expect(describeDeadline(sp("2026-11-02T10:00:00"), now)).toBe("venceu há 2 dias");
  });
});
