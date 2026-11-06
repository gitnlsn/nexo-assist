"use client";

import { ArrowUpRight, Bot, CircleCheck, Hand, Headset, LogOut, MessageCircle, Search, Send, ShieldAlert, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import { DraftCard, QuickReplies, SystemDivider, TicketCard, TicketChoice } from "@/components/chat/cards";
import { StepLine, TracePanel } from "@/components/chat/trace";
import { Avatar, Button, Dot, NexoMark, STATUS_TONE, Spinner, cx, formatDay, formatTime } from "@/components/ui";
import type { ChatMessage, ConversationView, TicketView } from "@/shared/chat";
import { STATUS_LABEL, type User } from "@/shared/domain";
import { isActive } from "@/shared/rules/tickets";

type Filter = "all" | "attention" | "agent" | "mine";

interface ConsoleConversation extends ConversationView {
  employeeName: string;
  employeeEmail: string;
  employeeDepartment: string;
}

interface Detail {
  conversation: ConversationView;
  employee: User | null;
  messages: ChatMessage[];
  tickets: TicketView[] | null;
  ticketsError: string | null;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "attention", label: "Para você" },
  { key: "agent", label: "Com o agent" },
  { key: "mine", label: "Minhas" },
];

const POLL_MS = 3000;
const firstName = (name: string) => name.split(" ")[0];

function statusLine(c: ConsoleConversation, analystId: string) {
  if (c.status === "waiting_analyst") return { dot: "bg-danger", cls: "text-danger", text: `Transferida · ${c.handoffReason ?? "aguardando atendente"}` };
  if (c.status === "with_analyst")
    return c.analystId === analystId
      ? { dot: "bg-primary-2", cls: "text-primary", text: "Você está atendendo" }
      : { dot: "bg-primary-2", cls: "text-muted", text: `${c.analystName ?? "Analista"} atendendo` };
  if (c.needsAttention) return { dot: "bg-warn", cls: "text-warn-ink", text: "Agent pediu ajuda · sem segurança na decisão" };
  return { dot: "bg-ok", cls: "text-muted", text: "Agent atendendo" };
}

function ConsoleMessage({ m }: { m: ChatMessage }) {
  const [open, setOpen] = useState(false);
  if (m.role === "system") return <SystemDivider text={m.text} time={formatTime(m.createdAt)} />;
  if (m.role === "user") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[460px] rounded-xl bg-white px-3.5 py-2.5 text-[14.5px] leading-[21px] whitespace-pre-line shadow-[0_1px_2px_rgba(27,36,49,0.06)]">
          {m.text} <span className="ml-1.5 text-[11px] text-muted">{formatTime(m.createdAt)}</span>
        </div>
      </div>
    );
  }
  const isAnalyst = m.role === "analyst";
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="font-semibold">{isAnalyst ? m.authorName : "Nexo Assist"}</span>
        <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-semibold", isAnalyst ? "bg-ok-soft text-[#16794A]" : "bg-primary-soft text-primary")}>
          {isAnalyst ? "Analista" : "IA"}
        </span>
      </div>
      {!isAnalyst && m.trace && (
        <StepLine steps={m.trace.steps} tone="console" hasDetails open={open} onToggle={() => setOpen((o) => !o)} />
      )}
      {m.text && (
        <div className={cx("max-w-[460px] rounded-xl px-3.5 py-2.5 text-[14.5px] leading-[21px] whitespace-pre-line", isAnalyst ? "bg-[#E3F5EA]" : "bg-[#E8F1FC]")}>
          {m.text} <span className="ml-1.5 text-[11px] text-muted">{formatTime(m.createdAt)}</span>
        </div>
      )}
      {m.parts.map((p, i) => (
        <div key={i} className="w-full max-w-[560px]">
          {p.type === "ticket" && <TicketCard ticket={p.ticket} />}
          {p.type === "ticketChoice" && <TicketChoice prompt={p.prompt} tickets={p.tickets} />}
          {p.type === "draft" && <DraftCard draft={p.draft} interactive={false} />}
          {p.type === "options" && (
            <div className="flex justify-end">
              <QuickReplies options={p.options} />
            </div>
          )}
          {p.type === "handoff" && (
            <div className="text-right text-[12.5px] text-warn-ink">Transferida para analista · {p.reason}</div>
          )}
        </div>
      ))}
      {open && m.trace && (
        <div className="w-full max-w-[560px]">
          <TracePanel trace={m.trace} />
        </div>
      )}
    </div>
  );
}

function TicketsPanel({ detail }: { detail: Detail | null }) {
  const name = detail?.employee ? firstName(detail.employee.name) : "";
  const tickets = detail?.tickets ?? [];
  const mentioned = useMemo(() => {
    const ids = new Set<string>();
    for (const m of detail?.messages ?? []) {
      for (const match of m.text.matchAll(/\b(INC|REQ)-\d+\b/g)) ids.add(match[0]);
      for (const p of m.parts) {
        if (p.type === "ticket") ids.add(p.ticket.id);
        if (p.type === "draft" && p.draft.ticketId) ids.add(p.draft.ticketId);
      }
    }
    return ids;
  }, [detail?.messages]);
  const fromConversation = tickets.filter((t) => mentioned.has(t.id));
  const others = tickets.filter((t) => !mentioned.has(t.id));
  const open = tickets.filter(isActive).length;

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-line xl:flex">
      <div className="border-b border-line px-5 py-4">
        <div className="text-[16px] font-semibold">{detail ? `Chamados da ${name}` : "Chamados"}</div>
        {detail?.tickets && (
          <div className="text-[13px] text-muted">
            {open} abertos · {tickets.length - open} encerrados
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {!detail && <p className="text-[13.5px] text-muted">Selecione uma conversa.</p>}
        {detail?.ticketsError && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn-ink">
            Sistema de chamados indisponível agora. Tentaremos de novo em instantes.
          </p>
        )}
        {fromConversation.length > 0 && (
          <>
            <div className="mb-2 text-[13px] font-semibold text-muted">Desta conversa</div>
            {fromConversation.map((t) => {
              const tone = STATUS_TONE[t.status];
              return (
                <div key={t.id} className="mb-3 rounded-xl bg-canvas p-3.5">
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="text-muted">{t.id}</span>
                    <span className={cx("flex items-center gap-1.5 font-medium", tone.text)}>
                      <Dot className={tone.dot} /> {STATUS_LABEL[t.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-[14.5px] font-semibold">{t.title}</div>
                  <div className="text-[13px] text-muted">
                    {t.category} · prioridade {t.priority.toLowerCase()}
                  </div>
                  {t.dueLabel && (
                    <div className={cx("mt-2 border-t border-line pt-2 text-[12.5px]", t.overdue ? "text-danger" : "text-muted")}>
                      {t.overdue ? "Prazo vencido · " : ""}
                      {t.dueLabel}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
        {others.length > 0 && (
          <>
            <div className="mt-3 mb-1 text-[13px] font-semibold text-muted">Outros chamados</div>
            {others.map((t) => (
              <div key={t.id} className="flex gap-2.5 border-b border-line py-3 last:border-0">
                <Dot className={cx("mt-1.5", STATUS_TONE[t.status].dot)} />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium">{t.title}</div>
                  <div className="text-[12.5px] text-muted">
                    {t.id} · {t.status === "resolved" && t.resolvedAt ? `Resolvido em ${formatDay(t.resolvedAt)}` : STATUS_LABEL[t.status]}
                    {t.overdue && <span className="text-danger"> · vencido</span>}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      {detail && (
        <div className="border-t border-line p-4">
          <div className="flex items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-[13.5px] text-ink-2">
            Ver todos os chamados da {name} <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </div>
      )}
    </aside>
  );
}

export function ConsoleView({ analyst }: { analyst: { id: string; name: string; title: string } }) {
  const [filter, setFilter] = useState<Filter>("attention");
  const [q, setQ] = useState("");
  const [list, setList] = useState<ConsoleConversation[] | null>(null);
  const [counts, setCounts] = useState<Record<Filter, number> | null>(null);
  const [listError, setListError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`/api/console/conversations?filter=${filter}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (res.status === 401) return router.replace("/login");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { conversations: ConsoleConversation[]; counts: Record<Filter, number> };
      setList(data.conversations);
      setCounts(data.counts);
      setListError(false);
    } catch {
      setListError(true);
    }
  }, [filter, q, router]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/console/conversations/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setDetail((await res.json()) as Detail);
    } catch {
      setError("Não foi possível carregar a conversa.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  usePolling(loadList, POLL_MS);
  usePolling(selected ? () => loadDetail(selected) : null, POLL_MS);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length, selected]);

  async function act(action: "assume" | "release" | "close") {
    if (!selected) return;
    setActing(action);
    setError(null);
    try {
      const res = await fetch(`/api/console/conversations/${selected}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error);
      await Promise.all([loadDetail(selected), loadList()]);
      if (action === "close") setSelected(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setActing(null);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setActing("reply");
    setError(null);
    try {
      const res = await fetch(`/api/console/conversations/${selected}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: reply }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error);
      setReply("");
      await loadDetail(selected);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Não foi possível enviar.");
    } finally {
      setActing(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const conv = detail?.conversation;
  const mine = conv?.status === "with_analyst" && conv.analystId === analyst.id;
  const employeeFirst = detail?.employee ? firstName(detail.employee.name) : "";

  return (
    <div className="flex h-full bg-white">
      {/* Rail */}
      <nav className="flex w-16 shrink-0 flex-col items-center border-r border-line bg-canvas py-5">
        <NexoMark className="h-[18px] w-[22px]" color="#0285F7" />
        <div className="relative mt-6 flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-[0_1px_3px_rgba(27,36,49,0.08)]">
          <MessageCircle className="h-5 w-5" />
          {!!counts?.attention && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {counts.attention}
            </span>
          )}
        </div>
        <div className="mt-auto flex flex-col items-center gap-3">
          <button onClick={logout} title="Sair" className="text-muted hover:text-ink">
            <LogOut className="h-4 w-4" />
          </button>
          <Avatar name={analyst.name} size={32} />
        </div>
      </nav>

      {/* Conversation list */}
      <section className="flex w-[380px] shrink-0 flex-col border-r border-line">
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[20px] font-bold">Conversas</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-[13px] font-semibold text-[#16794A]">
              <Dot className="bg-ok" /> Disponível
            </span>
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-full bg-canvas px-3.5 py-2">
            <Search className="h-4 w-4 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar por funcionário"
              className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
            />
          </label>
          <div className="mt-3 flex gap-1.5 pb-3">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cx(
                  "rounded-md px-2.5 py-1 text-[13px]",
                  filter === f.key ? "bg-primary-soft font-semibold text-primary" : "bg-canvas text-ink-2 hover:bg-line",
                )}
              >
                {f.label} {counts && f.key !== "all" ? counts[f.key] : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {list === null && !listError && (
            <div className="flex justify-center py-10 text-muted">
              <Spinner className="h-5 w-5" />
            </div>
          )}
          {listError && <p className="px-3 py-4 text-[13.5px] text-danger">Não foi possível carregar as conversas. Tentando de novo…</p>}
          {list?.length === 0 && (
            <div className="px-3 py-10 text-center text-[13.5px] text-muted">
              <CircleCheck className="mx-auto mb-2 h-6 w-6 text-ok" />
              Nenhuma conversa {filter === "attention" ? "precisa de você agora" : "neste filtro"}.
            </div>
          )}
          {list?.map((c) => {
            const s = statusLine(c, analyst.id);
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c.id);
                  setDetailLoading(true);
                  setDetail(null);
                  setError(null);
                }}
                className={cx(
                  "flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                  selected === c.id ? "bg-canvas" : "hover:bg-canvas/60",
                )}
              >
                <Avatar name={c.employeeName} size={44} online={c.status !== "closed"} />
                <div className="min-w-0 flex-1 border-b border-line pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold">{c.employeeName}</span>
                    <span className={cx("text-[12.5px]", c.status === "waiting_analyst" ? "font-semibold text-primary" : "text-muted")}>
                      {formatTime(c.updatedAt)}
                    </span>
                  </div>
                  <div className="truncate text-[14px] text-ink-2">{c.lastMessagePreview ?? "Sem mensagens"}</div>
                  <div className={cx("mt-0.5 flex items-center gap-1.5 truncate text-[12.5px]", s.cls)}>
                    <Dot className={s.dot} /> {s.text}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Conversation */}
      <section className="flex min-w-0 flex-1 flex-col bg-canvas">
        {!selected && (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-muted">
            <Headset className="mb-3 h-8 w-8" />
            <p className="text-[15px]">Selecione uma conversa para ver o histórico e as decisões do agent.</p>
          </div>
        )}
        {selected && detailLoading && !detail && (
          <div className="flex flex-1 items-center justify-center text-muted">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {detail && conv && (
          <>
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white px-5">
              <Avatar name={detail.employee?.name ?? "?"} size={40} />
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold">{detail.employee?.name}</div>
                <div className="truncate text-[13px] text-muted">
                  {detail.employee?.department} · {detail.employee?.email}
                </div>
              </div>
              {conv.status === "waiting_analyst" && (
                <span className="flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-[13px] font-semibold text-warn-ink">
                  <Bot className="h-3.5 w-3.5" /> Aguardando atendente
                </span>
              )}
              {conv.status === "agent" && (
                <span className="flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-[13px] font-semibold text-[#16794A]">
                  <Sparkles className="h-3.5 w-3.5" /> Com o agent
                </span>
              )}
              {mine && (
                <>
                  <Button onClick={() => act("release")} disabled={!!acting}>
                    {acting === "release" ? <Spinner /> : <Bot className="h-4 w-4" />} Devolver ao agent
                  </Button>
                  <Button variant="danger" onClick={() => act("close")} disabled={!!acting}>
                    {acting === "close" ? <Spinner /> : <CircleCheck className="h-4 w-4" />} Encerrar atendimento
                  </Button>
                </>
              )}
              {conv.status === "with_analyst" && !mine && (
                <span className="rounded-full bg-primary-soft px-3 py-1 text-[13px] font-semibold text-primary">
                  {conv.analystName} atendendo
                </span>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="mx-auto flex max-w-[680px] flex-col gap-4">
                {conv.handoffSummary && (
                  <div className="rounded-xl border border-[#F3D9A4] bg-warn-soft px-4 py-3 text-[14px]">
                    <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-warn-ink">
                      <ShieldAlert className="h-4 w-4" /> Resumo do agent para o analista · {conv.handoffReason}
                    </div>
                    {conv.handoffSummary}
                  </div>
                )}
                {detail.messages.map((m) => (
                  <ConsoleMessage key={m.id} m={m} />
                ))}
                <div ref={bottomRef} />
              </div>
            </div>

            <footer className="shrink-0 border-t border-line bg-white px-5 py-3">
              {error && <p className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
              {!mine && conv.status !== "closed" && (
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warn-soft">
                    <Hand className="h-4 w-4 text-warn-ink" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[14.5px] font-semibold">
                      {conv.status === "waiting_analyst"
                        ? `${employeeFirst} espera um atendente`
                        : conv.status === "agent"
                          ? `O Nexo Assist está atendendo ${employeeFirst}`
                          : `${conv.analystName} está atendendo`}
                    </div>
                    <div className="text-[12.5px] text-muted">
                      {conv.status === "agent" ? "Você pode assumir a qualquer momento" : "Agent pausado"}
                    </div>
                  </div>
                  {conv.status === "waiting_analyst" && (
                    <Button onClick={() => act("release")} disabled={!!acting}>
                      {acting === "release" ? <Spinner /> : <Bot className="h-4 w-4" />} Devolver ao agent
                    </Button>
                  )}
                  {conv.status !== "with_analyst" && (
                    <Button variant="primary" onClick={() => act("assume")} disabled={!!acting}>
                      {acting === "assume" ? <Spinner /> : <Headset className="h-4 w-4" />} Assumir atendimento
                    </Button>
                  )}
                </div>
              )}
              <form onSubmit={sendReply} className="flex items-center gap-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  disabled={!mine}
                  placeholder={mine ? `Responder para ${employeeFirst}…` : "Assuma o atendimento para responder"}
                  className="flex-1 rounded-xl bg-canvas px-4 py-3 text-[14.5px] outline-none placeholder:text-muted disabled:cursor-not-allowed"
                />
                {mine && (
                  <button
                    type="submit"
                    disabled={!reply.trim() || acting === "reply"}
                    aria-label="Enviar"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50"
                  >
                    {acting === "reply" ? <Spinner /> : <Send className="h-4 w-4" />}
                  </button>
                )}
              </form>
            </footer>
          </>
        )}
      </section>

      <TicketsPanel detail={detail} />
    </div>
  );
}
