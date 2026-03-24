import type { ChatReplyRequest, ChatReplyFinal } from "@atlas-kb/schema";
import { ChatReplyRequestSchema } from "@atlas-kb/schema";
import {
  appendChatMessage,
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  requireChatSession,
  saveMessageFeedback,
  updateChatSession,
} from "./repository";
import { generateGroundedAnswer } from "./search";

export {
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  saveMessageFeedback,
  updateChatSession,
};

export async function createChatReply(params: {
  sessionId: string;
  input: ChatReplyRequest;
  fetchImpl?: typeof fetch;
}): Promise<ChatReplyFinal> {
  const session = await requireChatSession(params.sessionId);
  const parsedInput = ChatReplyRequestSchema.parse(params.input);
  const userMessage = await appendChatMessage({
    sessionId: session.id,
    role: "user",
    content: parsedInput.query,
  });
  const answer = await generateGroundedAnswer({
    query: parsedInput.query,
    collectionId: parsedInput.collectionId ?? session.collectionId,
    limit: parsedInput.limit,
    fetchImpl: params.fetchImpl,
  });
  const assistantMessage = await appendChatMessage({
    sessionId: session.id,
    role: "assistant",
    content: answer.answer,
    citations: answer.citations,
    retrieval: answer.search,
  });
  const refreshedSession = await requireChatSession(session.id);

  return {
    session: refreshedSession,
    userMessage,
    assistantMessage,
    retrieval: answer.search,
    search: answer.search,
  };
}
