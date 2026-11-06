import { requireUser } from "@/server/auth";
import { createConversation, getOpenConversationFor, listMessages } from "@/server/conversations";
import { route, withCurrentDraftStatus } from "@/server/http";
import { MAX_USER_MESSAGES_PER_SESSION } from "@/shared/domain";

/** The employee's current conversation and its messages (also polled while an analyst is involved). */
export const GET = route(async () => {
  const user = await requireUser("employee");
  const conversation = await getOpenConversationFor(user.id);
  const messages = conversation ? await withCurrentDraftStatus(await listMessages(conversation.id)) : [];
  return Response.json({
    user: { id: user.id, name: user.name, email: user.email, department: user.department, title: user.title },
    conversation,
    messages,
    limit: MAX_USER_MESSAGES_PER_SESSION,
  });
});

/** Start a new conversation (closes the previous one). */
export const POST = route(async () => {
  const user = await requireUser("employee");
  const conversation = await createConversation(user.id);
  return Response.json({ conversation, messages: [] });
});
