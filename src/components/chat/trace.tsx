"use client";

import { AlertTriangle, Check, ChevronDown, CircleX, Info, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { ACTION_LABEL, type DecisionTrace, INTENT_LABEL, type TraceStep } from "@/shared/chat";
import { cx } from "../ui";

/** Compact line above a reply: "Nexo Assist ✓ consultou seus chamados ✓ buscou na central de ajuda  [por quê?]" */
export function StepLine({
  steps,
  open,
  onToggle,
  hasDetails,
  tone = "light",
}: {
  steps: TraceStep[];
  open?: boolean;
  onToggle?: () => void;
  hasDetails: boolean;
  tone?: "light" | "console";
}) {
  const visible = steps.filter((s) => !s.hidden);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
      {tone === "light" && <span className="font-semibold text-ink">Nexo Assist</span>}
      {visible.map((s) => (
        <span key={s.id} className={cx("flex items-center gap-1", s.status === "error" ? "text-danger" : "text-muted")}>
          {s.status === "running" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : s.status === "error" ? (
            <CircleX className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          {s.label}
          {s.retries ? <span className="text-warn-ink">({s.retries}× nova tentativa)</span> : null}
        </span>
      ))}
      {hasDetails && onToggle && (
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-primary hover:bg-primary-soft"
        >
          <Info className="h-3 w-3" />
          {open ? "ocultar detalhes" : "por quê?"}
          <ChevronDown className={cx("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

function confidenceTone(c: number) {
  if (c >= 0.8) return { bar: "bg-ok", text: "text-[#16794A]", label: "alta" };
  if (c >= 0.5) return { bar: "bg-warn", text: "text-warn-ink", label: "média" };
  return { bar: "bg-danger", text: "text-danger", label: "baixa" };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-[13px] leading-5 max-sm:grid-cols-1 max-sm:gap-0.5">
      <span className="text-muted">{label}</span>
      <div className="min-w-0 text-ink">{children}</div>
    </div>
  );
}

/** Detailed view of one decision: what the agent understood, what it did, how sure it was, and why. */
export function TracePanel({ trace }: { trace: DecisionTrace }) {
  const conf = trace.confidence;
  const tone = conf !== null ? confidenceTone(conf) : null;
  const facts = Object.entries(trace.facts);

  return (
    <div className="mt-2 rounded-xl border border-line bg-canvas px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-muted uppercase">
        <ShieldCheck className="h-3.5 w-3.5" /> Decisão do agent
      </div>
      <div className="divide-y divide-line">
        {(trace.understood || trace.intent) && (
          <Row label="Entendeu">
            {trace.intent && (
              <span className="mr-2 inline-block rounded-md bg-white px-1.5 py-0.5 text-[12px] font-medium ring-1 ring-line">
                {INTENT_LABEL[trace.intent]}
              </span>
            )}
            {trace.understood}
          </Row>
        )}
        {facts.length > 0 && (
          <Row label="Informações">
            <div className="flex flex-wrap gap-1.5">
              {facts.map(([k, v]) => (
                <span key={k} className="rounded-md bg-white px-1.5 py-0.5 text-[12px] ring-1 ring-line">
                  <span className="text-muted">{k}:</span> {v}
                </span>
              ))}
            </div>
          </Row>
        )}
        {trace.action && <Row label="Ação">{ACTION_LABEL[trace.action]}</Row>}
        <Row label="Segurança">
          {conf !== null && tone ? (
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-line">
                <div className={cx("h-full rounded-full", tone.bar)} style={{ width: `${Math.round(conf * 100)}%` }} />
              </div>
              <span className={cx("font-semibold", tone.text)}>
                {Math.round(conf * 100)}% · {tone.label}
              </span>
            </div>
          ) : (
            <span className="text-muted">não informada</span>
          )}
        </Row>
        {trace.reason && <Row label="Por quê">{trace.reason}</Row>}
        {trace.rulesApplied.length > 0 && (
          <Row label="Regras">
            <div className="flex flex-wrap gap-1.5">
              {trace.rulesApplied.map((r) => (
                <span key={r} className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[12px] text-primary">
                  {r}
                </span>
              ))}
            </div>
          </Row>
        )}
        {trace.steps.length > 0 && (
          <Row label="Passos">
            <ol className="flex flex-col gap-2">
              {trace.steps.map((s, i) => (
                <li key={s.id} className="flex gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-muted ring-1 ring-line">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className={cx("font-medium", s.status === "error" && "text-danger")}>{s.label}</span>
                      <code className="text-[11px] text-muted">{s.tool}</code>
                      {s.durationMs !== undefined && <span className="text-[11px] text-muted">{s.durationMs} ms</span>}
                      {s.retries ? (
                        <span className="flex items-center gap-1 text-[11px] text-warn-ink">
                          <RefreshCw className="h-3 w-3" />
                          {s.retries} nova(s) tentativa(s)
                        </span>
                      ) : null}
                    </div>
                    {s.input && <div className="truncate text-[12px] text-muted" title={s.input}>↳ {s.input}</div>}
                    {s.output && <div className="text-[12px] text-ink-2">→ {s.output}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </Row>
        )}
        {trace.guards.length > 0 && (
          <Row label="Verificações">
            <ul className="flex flex-col gap-1">
              {trace.guards.map((g) => (
                <li key={g} className="flex gap-1.5 text-warn-ink">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {g}
                </li>
              ))}
            </ul>
          </Row>
        )}
      </div>
      <div className="mt-2 border-t border-line pt-2 text-[11.5px] text-muted">
        {trace.model ? `Modelo ${trace.model}` : "Ação determinística (sem modelo)"}
        {trace.usage?.inputTokens !== undefined && ` · ${trace.usage.inputTokens} tokens de entrada, ${trace.usage.outputTokens ?? 0} de saída`}
        {trace.latencyMs !== undefined && ` · ${(trace.latencyMs / 1000).toFixed(1)} s`}
      </div>
    </div>
  );
}
