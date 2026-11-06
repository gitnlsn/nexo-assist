"use client";

import { AlertCircle, ArrowUp, Headset, Plus, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ArticleChip, DraftCard, HandoffNotice, QuickReplies, SystemDivider, TicketCard, TicketChoice } from "@/components/chat/cards";
import { StepLine, TracePanel } from "@/components/chat/trace";
import { Button, Spinner, cx, formatTime } from "@/components/ui";
import type { ChatMessage, ConversationView, MessagePart } from "@/shared/chat";
import { Breadcrumb } from "../breadcrumb";
import { type PendingTurn, useChat } from "./use-chat";

const SUGGESTIONS = [
  "Minha VPN dá erro 809",
  "Qual o status do meu chamado?",
  "Preciso de um segundo monitor",
  "Quero falar com um analista",
];

function StatusPill({ conversation }: { conversation: ConversationView | null }) {
  const status = conversation?.status ?? "agent";
  const map = {
    agent: { cls: "bg-ok-soft text-[#16794A]", dot: "bg-ok", text: "Assistente online" },
    waiting_analyst: { cls: "bg-warn-soft text-warn-ink", dot: "bg-warn", text: "Aguardando analista" },
    with_analyst: { cls: "bg-primary-soft text-primary", dot: "bg-primary-2", text: `${conversation?.analystName ?? "Analista"} atendendo` },
    closed: { cls: "bg-canvas text-muted", dot: "bg-[#C9CED6]", text: "Conversa encerrada" },
  }[status];
  return (
    <span className={cx("flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold", map.cls)}>
      <span className={cx("h-[7px] w-[7px] rounded-full", map.dot)} /> {map.text}
    </span>
  );
}

function AgentBubble({
  message,
  pending,
  isLast,
  canInteract,
  onSend,
  onDraft,
  onEditDraft,
  draftBusy,
}: {
  message?: ChatMessage;
  pending?: PendingTurn;
  isLast: boolean;
  canInteract: boolean;
  onSend: (text: string) => void;
  onDraft: (id: string, action: "confirm" | "cancel") => void;
  onEditDraft: () => void;
  draftBusy: string | null;
}) {
  const [open, setOpen] = useState(false);
  const steps = message?.trace?.steps ?? pending?.steps ?? [];
  const text = message?.text ?? pending?.text ?? "";
  const parts: MessagePart[] = message?.parts ?? pending?.parts ?? [];
  const options = parts.find((p) => p.type === "options");
  const cards = parts.filter((p) => p.type !== "options");
  const interactive = isLast && canInteract && !pending;

  return (
    <div className="flex flex-col gap-1.5">
      <StepLine steps={steps} hasDetails={!!message?.trace} open={open} onToggle={() => setOpen((o) => !o)} />
      {(text || options || pending) && (
        <div className="max-w-[600px] rounded-xl border border-line bg-white px-4 py-3 text-[15px] leading-[22px] whitespace-pre-line">
          {text ? (
            text
          ) : (
            <span className="flex items-center gap-1 py-1" aria-label="Nexo Assist está pensando">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
            </span>
          )}
          {options && options.type === "options" && (
            <div className="mt-3">
              <QuickReplies options={options.options} onPick={interactive ? onSend : undefined} />
            </div>
          )}
        </div>
      )}
      {cards.map((part, i) => (
        <div key={i} className="mt-1">
          {part.type === "ticket" && <TicketCard ticket={part.ticket} />}
          {part.type === "ticketChoice" && (
            <TicketChoice
              prompt={part.prompt}
              tickets={part.tickets}
              onPick={interactive ? (t) => onSend(`${t.id} · ${t.title}`) : undefined}
            />
          )}
          {part.type === "draft" && (
            <DraftCard
              draft={part.draft}
              interactive={canInteract && !pending}
              busy={draftBusy === part.draft.id}
              onConfirm={() => onDraft(part.draft.id, "confirm")}
              onCancel={() => onDraft(part.draft.id, "cancel")}
              onEdit={onEditDraft}
            />
          )}
          {part.type === "handoff" && <HandoffNotice reason={part.reason} />}
          {part.type === "article" && <ArticleChip id={part.id} title={part.title} />}
        </div>
      ))}
      {open && message?.trace && <TracePanel trace={message.trace} />}
    </div>
  );
}

export function ChatView() {
  const chat = useChat();
  const [input, setInput] = useState("");
  const [placeholder, setPlaceholder] = useState("Escreva para o Nexo…");
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { conversation, messages, pending, sending, limit } = chat;
  const used = conversation?.userMessageCount ?? 0;
  const limitReached = used >= limit;
  const closed = conversation?.status === "closed";
  const agentActive = !conversation || conversation.status === "agent";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending?.text, pending?.steps.length, pending?.parts.length]);

  async function submit(text: string) {
    if (!text.trim() || sending || limitReached) return;
    setInput("");
    setPlaceholder("Escreva para o Nexo…");
    const ok = await chat.send(text);
    if (ok === false) setInput(text);
    inputRef.current?.focus();
  }

  async function onDraft(id: string, action: "confirm" | "cancel") {
    setDraftBusy(id);
    await chat.resolveDraft(id, action);
    setDraftBusy(null);
  }

  const lastAgentIndex = messages.map((m) => m.role).lastIndexOf("agent");

  return (
    <>
      <Breadcrumb
        current="Atendimento"
        right={
          <div className="flex items-center gap-3">
            <StatusPill conversation={conversation} />
            {messages.length > 0 && (
              <Button variant="ghost" onClick={() => chat.newConversation()} disabled={sending} title="Encerra esta conversa e começa outra">
                <Plus className="h-4 w-4" /> Nova conversa
              </Button>
            )}
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[872px] flex-col gap-5 px-6 pt-10 pb-6">
          {chat.loading && (
            <div className="flex justify-center py-20 text-muted">
              <Spinner className="h-6 w-6" />
            </div>
          )}

          {!chat.loading && messages.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h1 className="mt-4 font-serif text-[34px] leading-tight">Como posso ajudar?</h1>
              <p className="mt-2 max-w-[460px] text-[15px] text-muted">
                Descreva o problema com suas palavras. Eu consulto seus chamados, busco na central de ajuda e chamo um analista quando
                precisar.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <QuickReplies options={SUGGESTIONS} onPick={submit} />
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[520px] rounded-xl bg-ink px-4 py-2.5 text-[15px] leading-[22px] whitespace-pre-line text-white">
                    {m.text}
                  </div>
                </div>
              );
            }
            if (m.role === "system") return <SystemDivider key={m.id} text={m.text} time={formatTime(m.createdAt)} />;
            if (m.role === "analyst") {
              return (
                <div key={m.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span className="font-semibold">{m.authorName}</span>
                    <span className="rounded bg-ok-soft px-1.5 py-0.5 text-[11px] font-semibold text-[#16794A]">Analista</span>
                  </div>
                  <div className="max-w-[600px] rounded-xl bg-[#EDF8F2] px-4 py-3 text-[15px] leading-[22px] whitespace-pre-line">{m.text}</div>
                </div>
              );
            }
            return (
              <AgentBubble
                key={m.id}
                message={m}
                isLast={i === lastAgentIndex && i >= messages.length - 2}
                canInteract={agentActive && !closed}
                onSend={submit}
                onDraft={onDraft}
                onEditDraft={() => {
                  setPlaceholder("Diga o que quer mudar no rascunho…");
                  inputRef.current?.focus();
                }}
                draftBusy={draftBusy}
              />
            );
          })}

          {pending && (
            <AgentBubble pending={pending} isLast canInteract={false} onSend={submit} onDraft={onDraft} onEditDraft={() => {}} draftBusy={null} />
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="shrink-0 px-6 pb-5">
        <div className="mx-auto max-w-[872px]">
          {(chat.error || chat.loadError) && (
            <div role="alert" className="mb-2 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" /> {chat.error ?? chat.loadError}
              {chat.error && (
                <button className="ml-auto text-[12.5px] font-semibold underline" onClick={() => chat.setError(null)}>
                  fechar
                </button>
              )}
            </div>
          )}
          {conversation && conversation.status !== "agent" && !closed && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13.5px] text-warn-ink">
              <Headset className="h-4 w-4 shrink-0" />
              {conversation.status === "waiting_analyst"
                ? "Um analista vai continuar por aqui. O Nexo Assist está pausado; suas mensagens chegam direto para ele."
                : `${conversation.analystName ?? "Um analista"} está atendendo você. O Nexo Assist está pausado.`}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className={cx(
              "flex items-end gap-2 rounded-xl border border-line bg-white p-1.5 pl-4 focus-within:border-primary-2",
              (limitReached || closed) && "bg-canvas",
            )}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              disabled={limitReached || closed}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              placeholder={limitReached ? "Limite de mensagens desta conversa atingido. Inicie uma nova conversa." : placeholder}
              className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-muted"
              aria-label="Mensagem"
            />
            <Button type="submit" variant="primary" disabled={!input.trim() || sending || limitReached || closed}>
              {sending ? <Spinner /> : <ArrowUp className="h-4 w-4" />} Enviar
            </Button>
          </form>
          <div className="mt-1.5 text-right text-[12.5px] text-muted">
            {used}/{limit} mensagens nesta sessão
          </div>
        </div>
      </footer>
    </>
  );
}
