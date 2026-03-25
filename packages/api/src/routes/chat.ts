import {
  createChatReply,
  createChatSession,
  deleteChatSession,
  getChatMessagesData,
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
  ChatSessionResponseSchema,
  ChatSessionsResponseSchema,
  ChatSessionUpdateRequestSchema,
  success,
} from "@atlas-kb/schema";
import { Elysia } from "elysia";

export const chatRoutes = new Elysia({ prefix: "/api/chat" })
  .get(
    "/sessions",
    async () => {
      return success({
        sessions: await listChatSessions(),
      });
    },
    {
      response: ChatSessionsResponseSchema,
    },
  )
  .post(
    "/sessions",
    async ({ body }) => {
      return success({
        session: await createChatSession(body),
      });
    },
    {
      body: ChatSessionCreateRequestSchema,
      response: ChatSessionResponseSchema,
    },
  )
  .get(
    "/sessions/:sessionId",
    async ({ params }) => {
      return success({
        session: await requireChatSession(params.sessionId),
      });
    },
    {
      params: ChatSessionIdParamsSchema,
      response: ChatSessionResponseSchema,
    },
  )
  .patch(
    "/sessions/:sessionId",
    async ({ body, params }) => {
      return success({
        session: await updateChatSession({
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
  .delete("/sessions/:sessionId", async ({ params }) => {
    await deleteChatSession(params.sessionId);
    return success({
      ok: true as const,
    });
  })
  .get(
    "/sessions/:sessionId/messages",
    async ({ params }) => {
      return success(await getChatMessagesData(params.sessionId));
    },
    {
      params: ChatSessionIdParamsSchema,
      response: ChatMessagesResponseSchema,
    },
  )
  .post(
    "/sessions/:sessionId/reply",
    async ({ body, params }) => {
      return success(
        await createChatReply({
          sessionId: params.sessionId,
          input: body,
          fetchImpl: fetch,
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
    async ({ body, params }) => {
      return streamChatReply({
        input: {
          ...body,
          sessionId: params.sessionId,
        },
      });
    },
    {
      body: ChatReplyStreamBodySchema,
      params: ChatSessionIdParamsSchema,
    },
  )
  .post(
    "/messages/:messageId/feedback",
    async ({ body, params }) => {
      return success(
        await saveMessageFeedback({
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
