import { z } from "zod";
import { requireUser } from "@/server/auth";
import { runAgentTurn } from "@/server/agent-turn";
import { agentCanRespond, employeeCanWrite } from "@/server/conversation-state";
import { addMessage, countRecentUserMessages, createConversation, getConversation, getOpenConversationFor } from "@/server/conversations";
import { HttpError, route } from "@/server/http";
import type { StreamEvent } from "@/shared/chat";
import { MAX_USER_MESSAGES_PER_SESSION } from "@/shared/domain";

export const maxDuration = 60;

const Body = z.object({ text: z.string().trim().min(1).max(2000) });
const HOUR_MS = 60 * 60 * 1000;

/**
 * Sends an employee message. Responds with newline-delimited JSON events (StreamEvent) so the UI can
 * show the agent's steps and text as they happen.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser("employee");
  const { text } = Body.parse(await req.json());

  const conversation = (await getOpenConversationFor(user.id)) ?? (await createConversation(user.id));
  if (!employeeCanWrite(conversation.status)) throw new HttpError(409, "Esta conversa foi encerrada.");
  if (conversation.userMessageCount >= MAX_USER_MESSAGES_PER_SESSION) {
    throw new HttpError(429, `Esta conversa chegou ao limite de ${MAX_USER_MESSAGES_PER_SESSION} mensagens. Inicie uma nova conversa.`);
  }
  const perHour = Number(process.env.RATE_LIMIT_PER_HOUR ?? 60);
  if ((await countRecentUserMessages(user.id, HOUR_MS)) >= perHour) {
    throw new HttpError(429, "Muitas mensagens em pouco tempo. Aguarde alguns minutos e tente de novo.");
  }

  const userMessage = await addMessage({ conversationId: conversation.id, role: "user", text, authorName: user.name, authorId: user.id });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        emit({ type: "user-message", message: userMessage });
        const current = (await getConversation(conversation.id))!;
        if (agentCanRespond(current.status)) {
          await runAgentTurn({ user, conversation: current, emit, abortSignal: req.signal });
        } else {
          // Agent is paused: the message waits for the analyst (Anexo A: the agent does not answer).
          emit({ type: "done", message: userMessage, conversation: current });
        }
      } catch (err) {
        console.error("[chat]", err);
        emit({ type: "error", error: "Não consegui processar sua mensagem. Tente novamente." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
});
