import type { Priority } from "../domain";

/**
 * SLA rules from Anexo A.
 * - Crítica: 1 hour, around the clock (critical tickets have a 24h on-call).
 * - Alta: 4 business hours.
 * - Média: 3 business days.
 * - Baixa: 5 business days.
 * Business hours: Monday to Friday, 08:00–18:00, São Paulo time (UTC-3, no DST since 2019).
 * Public holidays are intentionally out of scope (documented trade-off).
 */

const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;
const OPEN_HOUR = 8;
const CLOSE_HOUR = 18;
const HOUR_MS = 60 * 60 * 1000;

export const SLA_RULES: Record<Priority, { amount: number; unit: "hours" | "business_hours" | "business_days"; label: string }> = {
  Crítica: { amount: 1, unit: "hours", label: "1 hora" },
  Alta: { amount: 4, unit: "business_hours", label: "4 horas úteis" },
  Média: { amount: 3, unit: "business_days", label: "3 dias úteis" },
  Baixa: { amount: 5, unit: "business_days", label: "5 dias úteis" },
};

/** Shift a real instant into a Date whose UTC fields read as São Paulo wall-clock time. */
function toLocal(d: Date): Date {
  return new Date(d.getTime() + TZ_OFFSET_MS);
}
function fromLocal(d: Date): Date {
  return new Date(d.getTime() - TZ_OFFSET_MS);
}

function isWeekend(local: Date): boolean {
  const day = local.getUTCDay();
  return day === 0 || day === 6;
}

function atHour(local: Date, hour: number): Date {
  const d = new Date(local);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function nextDay(local: Date): Date {
  const d = new Date(local);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Move a local time forward to the nearest moment inside business hours. */
function normalizeToBusinessTime(local: Date): Date {
  let cursor = new Date(local);
  for (let i = 0; i < 14; i++) {
    if (!isWeekend(cursor)) {
      const open = atHour(cursor, OPEN_HOUR);
      const close = atHour(cursor, CLOSE_HOUR);
      if (cursor < open) return open;
      if (cursor < close) return cursor;
    }
    cursor = atHour(nextDay(cursor), OPEN_HOUR);
  }
  return cursor;
}

export function isBusinessTime(at: Date): boolean {
  const local = toLocal(at);
  return normalizeToBusinessTime(local).getTime() === local.getTime();
}

export function addBusinessHours(start: Date, hours: number): Date {
  let cursor = normalizeToBusinessTime(toLocal(start));
  let remaining = hours * HOUR_MS;
  for (let i = 0; i < 365 && remaining > 0; i++) {
    const close = atHour(cursor, CLOSE_HOUR);
    const available = close.getTime() - cursor.getTime();
    if (remaining <= available) {
      cursor = new Date(cursor.getTime() + remaining);
      remaining = 0;
    } else {
      remaining -= available;
      cursor = normalizeToBusinessTime(atHour(nextDay(cursor), OPEN_HOUR));
    }
  }
  return fromLocal(cursor);
}

export function addBusinessDays(start: Date, days: number): Date {
  let cursor = normalizeToBusinessTime(toLocal(start));
  let added = 0;
  while (added < days) {
    cursor = nextDay(cursor);
    if (!isWeekend(cursor)) added++;
  }
  return fromLocal(cursor);
}

/** Deadline for the next response from the service desk, counted from `from`. */
export function computeDueAt(priority: Priority, from: Date): Date {
  const rule = SLA_RULES[priority];
  switch (rule.unit) {
    case "hours":
      return new Date(from.getTime() + rule.amount * HOUR_MS);
    case "business_hours":
      return addBusinessHours(from, rule.amount);
    case "business_days":
      return addBusinessDays(from, rule.amount);
  }
}

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

function sameLocalDay(a: Date, b: Date): boolean {
  const la = toLocal(a);
  const lb = toLocal(b);
  return la.toISOString().slice(0, 10) === lb.toISOString().slice(0, 10);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Human description of a deadline relative to now, e.g. "vence hoje às 15:30" or "venceu há 2 dias". */
export function describeDeadline(dueAt: Date, now: Date): string {
  const diff = dueAt.getTime() - now.getTime();
  if (diff < 0) {
    const hours = Math.floor(-diff / HOUR_MS);
    if (hours < 1) return "venceu há menos de 1 hora";
    if (hours < 24) return `venceu há ${plural(hours, "hora", "horas")}`;
    return `venceu há ${plural(Math.floor(hours / 24), "dia", "dias")}`;
  }
  if (sameLocalDay(dueAt, now)) return `vence hoje às ${timeFmt.format(dueAt)}`;
  const tomorrow = new Date(now.getTime() + 24 * HOUR_MS);
  if (sameLocalDay(dueAt, tomorrow)) return `vence amanhã às ${timeFmt.format(dueAt)}`;
  return `vence em ${dateFmt.format(dueAt)} às ${timeFmt.format(dueAt)}`;
}
