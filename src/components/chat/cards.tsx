"use client";

import { ArrowLeftRight, BookOpen, Headset } from "lucide-react";
import { useEffect } from "react";
import type { DraftView, TicketView } from "@/shared/chat";
import { STATUS_LABEL } from "@/shared/domain";
import { Button, Dot, PRIORITY_DOT, STATUS_TONE, Spinner, cx, formatDay, formatDayTime, relativeTime } from "../ui";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-0.5 text-[14.5px] font-medium">{children}</div>
    </div>
  );
}

export function TicketCard({ ticket }: { ticket: TicketView }) {
  const tone = STATUS_TONE[ticket.status];
  return (
    <div className="rounded-xl border border-line bg-white px-[18px] py-4 shadow-[0_1px_3px_rgba(27,36,49,0.05)]">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-muted">
          Chamado <span className="mx-1">·</span> {ticket.id}
        </span>
        <span className={cx("flex items-center gap-1.5 font-medium", tone.text)}>
          <Dot className={tone.dot} /> {STATUS_LABEL[ticket.status]}
        </span>
      </div>
      <div className="mt-1.5 text-[18px] font-semibold tracking-[-0.2px]">{ticket.title}</div>
      <p className="mt-1 line-clamp-2 text-[14px] text-ink-2">{ticket.description}</p>
      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3 sm:grid-cols-4">
        <Field label="Categoria">{ticket.category}</Field>
        <Field label="Prioridade">
          <span className="flex items-center gap-1.5">
            <Dot className={PRIORITY_DOT[ticket.priority]} /> {ticket.priority}
          </span>
        </Field>
        <Field label="Aberto em">{formatDayTime(ticket.createdAt)}</Field>
        <Field label="Última atualização">
          <span className={ticket.overdue ? "text-warn-ink" : ""}>{relativeTime(ticket.updatedAt)}</span>
          {ticket.dueLabel && (
            <span className={cx("ml-1 text-[13px] font-normal", ticket.overdue ? "text-danger" : "text-muted")}>
              · {ticket.overdue ? "prazo vencido" : ticket.dueLabel}
            </span>
          )}
        </Field>
      </div>
    </div>
  );
}

export function TicketChoice({
  prompt,
  tickets,
  onPick,
  disabled,
}: {
  prompt: string;
  tickets: TicketView[];
  onPick?: (t: TicketView) => void;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_3px_rgba(27,36,49,0.05)]" role="radiogroup" aria-label={prompt}>
      {tickets.map((t, i) => {
        const tone = STATUS_TONE[t.status];
        return (
          <button
            key={t.id}
            disabled={disabled || !onPick}
            onClick={() => onPick?.(t)}
            className={cx(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-canvas disabled:cursor-default",
              i > 0 && "border-t border-line",
            )}
          >
            <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-[#C9CED6]" />
            <span className="w-[86px] shrink-0 text-[13px] text-muted">{t.id}</span>
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{t.title}</span>
            {t.overdue && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11.5px] font-medium text-danger">vencido</span>}
            <span className={cx("hidden items-center gap-1.5 text-[13px] sm:flex", tone.text)}>
              <Dot className={tone.dot} /> {STATUS_LABEL[t.status]}
            </span>
            <span className="hidden w-12 text-right text-[13px] text-muted sm:block">{formatDay(t.updatedAt)}</span>
          </button>
        );
      })}
    </div>
  );
}

const DRAFT_STATUS = {
  pending: { label: "Aguardando confirmação", cls: "text-warn-ink", dot: "bg-warn" },
  confirmed: { label: "Confirmado", cls: "text-[#16794A]", dot: "bg-ok" },
  cancelled: { label: "Descartado", cls: "text-muted", dot: "bg-[#C9CED6]" },
  superseded: { label: "Substituído por outro rascunho", cls: "text-muted", dot: "bg-[#C9CED6]" },
};

export function DraftCard({
  draft,
  onConfirm,
  onEdit,
  onCancel,
  busy,
  interactive,
}: {
  draft: DraftView;
  onConfirm?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  busy?: boolean;
  interactive: boolean;
}) {
  const status = DRAFT_STATUS[draft.status];
  const actionable = interactive && draft.status === "pending";

  // ⌘↵ / Ctrl+↵ confirms the pending draft, as shown in the prototype.
  useEffect(() => {
    if (!actionable || !onConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !busy) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actionable, onConfirm, busy]);

  const t = draft.ticket;
  return (
    <div className={cx("overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_3px_rgba(27,36,49,0.05)]", draft.status !== "pending" && "opacity-80")}>
      <div className="px-[18px] pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-muted">
            {draft.kind === "create" ? "Novo chamado" : draft.reopen ? `Reabrir ${draft.ticketId}` : `Complementar ${draft.ticketId}`}
            <span className="mx-1.5">·</span>Rascunho {draft.id.slice(0, 5).toUpperCase()}
          </span>
          <span className={cx("flex items-center gap-1.5 font-medium", status.cls)}>
            <Dot className={status.dot} /> {status.label}
          </span>
        </div>
        <div className="mt-1.5 text-[18px] font-semibold tracking-[-0.2px]">{t.title}</div>
        {draft.kind === "create" ? (
          <p className="mt-1 text-[14px] whitespace-pre-line text-ink-2">{t.description}</p>
        ) : (
          <div className="mt-2 rounded-lg bg-canvas px-3 py-2 text-[14px] text-ink-2">
            <span className="text-[12.5px] font-medium text-muted">Será adicionado ao chamado:</span>
            <p className="whitespace-pre-line">{draft.comment}</p>
          </div>
        )}
        {draft.kind === "create" && (
          <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3 sm:grid-cols-4">
            <Field label="Tipo">{t.type === "INC" ? "Incidente" : "Requisição"}</Field>
            <Field label="Categoria">{t.category}</Field>
            <Field label="Prioridade">
              <span className="flex items-center gap-1.5">
                <Dot className={PRIORITY_DOT[t.priority]} /> {t.priority}
              </span>
              <span className="text-[12.5px] font-normal text-muted">{t.deadlineLabel}</span>
            </Field>
            <Field label="Afetados">{t.affected}</Field>
          </div>
        )}
      </div>
      {actionable && (
        <div className="flex items-center gap-2 border-t border-line bg-canvas px-2 py-2">
          <Button variant="primary" onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : "Confirmar"}
            <kbd className="hidden rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-medium sm:inline">⌘↵</kbd>
          </Button>
          <Button onClick={onEdit} disabled={busy}>
            Editar
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

export function QuickReplies({ options, onPick, disabled }: { options: string[]; onPick?: (o: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          disabled={disabled || !onPick}
          onClick={() => onPick?.(o)}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-[14px] text-ink transition-colors enabled:hover:border-primary-2 enabled:hover:bg-primary-soft enabled:hover:text-primary disabled:cursor-default disabled:opacity-60"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function HandoffNotice({ reason }: { reason: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn-ink">
      <Headset className="h-4 w-4" /> Conversa transferida para um analista · {reason}
    </div>
  );
}

export function ArticleChip({ id, title }: { id: string; title: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-[13px]">
      <BookOpen className="h-3.5 w-3.5 text-primary" /> {id} · {title}
    </span>
  );
}

export function SystemDivider({ text, time }: { text: string; time?: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[12.5px] text-muted">
      <span className="h-px flex-1 bg-line" />
      <span className="flex items-center gap-1.5 text-center">
        <ArrowLeftRight className="h-3.5 w-3.5" /> {text}
        {time && <span>· {time}</span>}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
