"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import type { ChatMessage, ConversationView, MessagePart, StreamEvent, TraceStep } from "@/shared/chat";

export interface PendingTurn {
  steps: TraceStep[];
  text: string;
  parts: MessagePart[];
}

interface ConversationPayload {
  conversation: ConversationView | null;
  messages: ChatMessage[];
  limit?: number;
}

const POLL_MS = 3000;

/**
 * Client state for the employee chat:
 * - sends messages and consumes the NDJSON stream (steps, text deltas, cards) from /api/chat/messages;
 * - polls the conversation while idle, so analyst replies and handoff changes show up.
 */
export function useChat() {
  const [conversation, setConversation] = useState<ConversationView | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const router = useRouter();

  const apply = useCallback((data: ConversationPayload) => {
    setConversation(data.conversation);
    setMessages(data.messages);
    if (data.limit) setLimit(data.limit);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversation", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ConversationPayload;
      if (!busy.current) apply(data);
      setLoadError(null);
    } catch {
      setLoadError("Não foi possível carregar a conversa. Verificando de novo…");
    } finally {
      setLoading(false);
    }
  }, [apply, router]);

  usePolling(() => {
    if (!busy.current) return refresh();
  }, POLL_MS);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy.current) return;
      busy.current = true;
      setSending(true);
      setError(null);
      const tempId = `temp-${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: tempId, conversationId: conversation?.id ?? "", role: "user", authorName: null, text: trimmed, parts: [], trace: null, createdAt: new Date().toISOString() },
      ]);
      setPending({ steps: [], text: "", parts: [] });

      try {
        const res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Não foi possível enviar a mensagem.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as StreamEvent;
            switch (event.type) {
              case "user-message":
                setMessages((m) => m.map((x) => (x.id === tempId ? event.message : x)));
                break;
              case "step":
                setPending((p) => {
                  if (!p) return p;
                  const exists = p.steps.some((s) => s.id === event.step.id);
                  return { ...p, steps: exists ? p.steps.map((s) => (s.id === event.step.id ? event.step : s)) : [...p.steps, event.step] };
                });
                break;
              case "text":
                setPending((p) => (p ? { ...p, text: p.text + event.delta } : p));
                break;
              case "part":
                setPending((p) => (p ? { ...p, parts: [...p.parts, event.part] } : p));
                break;
              case "done":
                setConversation(event.conversation);
                if (event.message.role !== "user") setMessages((m) => [...m, event.message]);
                break;
              case "error":
                setError(event.error);
                break;
            }
          }
        }
      } catch (err) {
        setMessages((m) => m.filter((x) => x.id !== tempId));
        setError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
        return false;
      } finally {
        setPending(null);
        setSending(false);
        busy.current = false;
      }
      return true;
    },
    [conversation?.id],
  );

  const resolveDraft = useCallback(
    async (draftId: string, action: "confirm" | "cancel") => {
      busy.current = true;
      setError(null);
      try {
        const res = await fetch(`/api/chat/drafts/${draftId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = (await res.json()) as { message?: ChatMessage; conversation?: ConversationView; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Não foi possível concluir.");
        busy.current = false;
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível concluir.");
      } finally {
        busy.current = false;
      }
    },
    [refresh],
  );

  const newConversation = useCallback(async () => {
    const res = await fetch("/api/chat/conversation", { method: "POST" });
    if (res.ok) apply((await res.json()) as ConversationPayload);
  }, [apply]);

  return { conversation, messages, limit, loading, loadError, sending, pending, error, setError, send, resolveDraft, newConversation };
}
