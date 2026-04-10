import {
  createChatReply,
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  requireChatMessage,
  requireChatSession,
  saveMessageFeedback,
  streamChatReply,
  updateChatSession,
} from "@atlas-kb/mastra/knowledge";
import { BadRequestError, NotFoundError } from "@atlas-kb/errors";
import {
  ChatMessageFeedbackRequestSchema,
  ChatMessageFeedbackResponseSchema,
  ChatMessageIdParamsSchema,
  ChatMessagesResponseSchema,
  ChatReplyRequestSchema,
  ChatReplyResponseSchema,
  ChatReplyStreamBodySchema,
  ChatSessionCreateRequestSchema,
  ChatSessionIdParamsSchema,
  ChatSessionsQuerySchema,
  ChatSessionResponseSchema,
  ChatSessionsResponseSchema,
  ChatSessionUpdateRequestSchema,
  type Session,
  success,
} from "@atlas-kb/schema";
import { Elysia } from "elysia";
import { requireAuthenticatedSession } from "../auth";

function requireActiveCollection(
  session: Session,
  collectionId: string,
): string {
  const normalizedCollectionId = collectionId.trim();

  if (session.activeCollectionId !== normalizedCollectionId) {
    throw new BadRequestError("当前登录态未绑定该工作区，请先切换工作区。");
  }

  return normalizedCollectionId;
}

async function requireActiveChatSession(session: Session, sessionId: string) {
  const chatSession = await requireChatSession(session.user.id, sessionId);

  if (chatSession.collectionId !== session.activeCollectionId) {
    throw new NotFoundError(`Chat session "${sessionId}" not found`);
  }

  return chatSession;
}

export const chatRoutes = new Elysia({ prefix: "/api/chat" })
  .get(
    "/sessions",
    async ({ headers, query }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      const collectionId = requireActiveCollection(
        session,
        query.collectionId?.trim() || session.activeCollectionId,
      );
      return success({
        sessions: await listChatSessions(session.user.id, collectionId),
      });
    },
    {
      query: ChatSessionsQuerySchema,
      response: ChatSessionsResponseSchema,
    },
  )
  .post(
    "/sessions",
    async ({ body, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      requireActiveCollection(session, body.collectionId);
      return success({
        session: await createChatSession({
          userId: session.user.id,
          ...body,
        }),
      });
    },
    {
      body: ChatSessionCreateRequestSchema,
      response: ChatSessionResponseSchema,
    },
  )
  .get(
    "/sessions/:sessionId",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        session: await requireActiveChatSession(session, params.sessionId),
      });
    },
    {
      params: ChatSessionIdParamsSchema,
      response: ChatSessionResponseSchema,
    },
  )
  .patch(
    "/sessions/:sessionId",
    async ({ body, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      await requireActiveChatSession(session, params.sessionId);
      return success({
        session: await updateChatSession({
          userId: session.user.id,
          sessionId: params.sessionId,
          title: body.title,
        }),
      });
    },
    {
      body: ChatSessionUpdateRequestSchema,
      params: ChatSessionIdParamsSchema,
      response: ChatSessionResponseSchema,
    },
  )
  .delete("/sessions/:sessionId", async ({ params, headers }) => {
    const session = await requireAuthenticatedSession(headers.authorization);
    await requireActiveChatSession(session, params.sessionId);
    await deleteChatSession(session.user.id, params.sessionId);
    return success({
      ok: true as const,
    });
  })
  .get(
    "/sessions/:sessionId/messages",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      const [chatSession, messages] = await Promise.all([
        requireActiveChatSession(session, params.sessionId),
        listChatMessages(session.user.id, params.sessionId),
      ]);

      return success({
        session: chatSession,
        messages,
      });
    },
    {
      params: ChatSessionIdParamsSchema,
      response: ChatMessagesResponseSchema,
    },
  )
  .post(
    "/sessions/:sessionId/reply",
    async ({ body, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      await requireActiveChatSession(session, params.sessionId);
      return success(
        await createChatReply({
          userId: session.user.id,
          sessionId: params.sessionId,
          input: body,
        }),
      );
    },
    {
      body: ChatReplyRequestSchema,
      params: ChatSessionIdParamsSchema,
      response: ChatReplyResponseSchema,
    },
  )
  .post(
    "/sessions/:sessionId/reply/stream",
    async ({ body, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      await requireActiveChatSession(session, params.sessionId);
      return streamChatReply({
        input: {
          ...body,
          sessionId: params.sessionId,
        },
        userId: session.user.id,
      });
    },
    {
      body: ChatReplyStreamBodySchema,
      params: ChatSessionIdParamsSchema,
    },
  )
  .post(
    "/messages/:messageId/feedback",
    async ({ body, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      const message = await requireChatMessage(
        session.user.id,
        params.messageId,
      );
      await requireActiveChatSession(session, message.sessionId);
      return success(
        await saveMessageFeedback({
          userId: session.user.id,
          messageId: params.messageId,
          input: body,
        }),
      );
    },
    {
      body: ChatMessageFeedbackRequestSchema,
      params: ChatMessageIdParamsSchema,
      response: ChatMessageFeedbackResponseSchema,
    },
  );
