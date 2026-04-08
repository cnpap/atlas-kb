import {
  createChatReply,
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  requireChatSession,
  saveMessageFeedback,
  streamChatReply,
  updateChatSession,
} from "@atlas-kb/mastra/knowledge";
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
  success,
} from "@atlas-kb/schema";
import { Elysia } from "elysia";
import { requireAuthenticatedSession } from "../auth";

export const chatRoutes = new Elysia({ prefix: "/api/chat" })
  .get(
    "/sessions",
    async ({ headers, query }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        sessions: await listChatSessions(session.user.id, query.collectionId),
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
        session: await requireChatSession(session.user.id, params.sessionId),
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
        requireChatSession(session.user.id, params.sessionId),
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
