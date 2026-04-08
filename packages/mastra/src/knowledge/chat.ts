import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { ApiHttpError } from "@atlas-kb/errors";
import type {
  ChatReplyFinal,
  ChatReplyRequest,
  ChatReplyStreamDataEvent,
  ChatReplyStreamRequest,
} from "@atlas-kb/schema";
import {
  ChatReplyRequestSchema,
  ChatReplyStreamRequestSchema,
} from "@atlas-kb/schema";
import { buildKnowledgeMemoryResourceId } from "../memory";
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
import {
  runKnowledgeAgentQuestion,
  streamKnowledgeAgentQuestion,
} from "./agent";
import { getRuntimeModelLogContext } from "../models/runtime-model";

export {
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  saveMessageFeedback,
  updateChatSession,
};

type ReplyAcceptedEvent = Extract<
  ChatReplyStreamDataEvent,
  { type: "reply-accepted" }
>;
type ReplyCompletedEvent = Extract<
  ChatReplyStreamDataEvent,
  { type: "reply-completed" }
>;
type ReplyErrorEvent = Extract<
  ChatReplyStreamDataEvent,
  { type: "reply-error" }
>;

type ChatReplyStreamUIMessage = UIMessage<
  never,
  {
    replyAccepted: ReplyAcceptedEvent;
    replyCompleted: ReplyCompletedEvent;
    replyError: ReplyErrorEvent;
  }
>;

function writeStreamEvent(
  writer: UIMessageStreamWriter<ChatReplyStreamUIMessage>,
  event: ChatReplyStreamDataEvent,
) {
  switch (event.type) {
    case "reply-accepted":
      writer.write({
        type: "data-replyAccepted",
        id: "reply-accepted",
        data: event,
      });
      return;
    case "reply-completed":
      writer.write({
        type: "data-replyCompleted",
        id: "reply-completed",
        data: event,
      });
      return;
    case "reply-error":
      writer.write({
        type: "data-replyError",
        id: "reply-error",
        data: event,
      });
      return;
  }
}

const TIMEOUT_ERROR_PATTERN = /timed out|timeout|ETIMEDOUT|AbortError/i;

function readErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  const parts = [error.message];

  if (error.cause instanceof Error) {
    parts.push(error.cause.message);
  }

  return parts.join(" ").trim();
}

function getErrorMessage(error: unknown): string {
  const errorText = readErrorText(error);

  if (TIMEOUT_ERROR_PATTERN.test(errorText)) {
    return "知识库回答超时，请稍后重试。";
  }

  if (error instanceof ApiHttpError && error.message.trim()) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "AI 对话失败";
}

export async function createChatReply(params: {
  userId: string;
  sessionId: string;
  input: ChatReplyRequest;
}): Promise<ChatReplyFinal> {
  // 持久化对话主链路：
  // 1. 先保存用户消息
  // 2. 再用 sessionId 作为记忆线程调用绑定 workspace 的智能体
  // 3. 最后保存助手消息
  const session = await requireChatSession(params.userId, params.sessionId);
  const parsedInput = ChatReplyRequestSchema.parse(params.input);
  const collectionId = session.collectionId;
  const resourceId = buildKnowledgeMemoryResourceId(
    params.userId,
    collectionId,
  );

  const userMessage = await appendChatMessage({
    userId: params.userId,
    sessionId: session.id,
    role: "user",
    content: parsedInput.query,
  });
  const answer = await runKnowledgeAgentQuestion({
    question: parsedInput.query,
    collectionId,
    limit: parsedInput.limit,
    userId: params.userId,
    threadId: session.id,
    resourceId,
  });
  const assistantMessage = await appendChatMessage({
    userId: params.userId,
    sessionId: session.id,
    role: "assistant",
    content: answer.answer,
  });

  const refreshedSession = await requireChatSession(params.userId, session.id);

  return {
    session: refreshedSession,
    userMessage,
    assistantMessage,
  };
}

export async function streamChatReply(params: {
  input: ChatReplyStreamRequest;
  userId: string;
}): Promise<Response> {
  // 流式对话和 createChatReply 保持同样的持久化顺序，只是对前端只发
  // 已接收、文本增量、已完成、错误 这几个最小事件。
  const parsedInput = ChatReplyStreamRequestSchema.parse(params.input);
  const session = await requireChatSession(
    params.userId,
    parsedInput.sessionId,
  );
  const collectionId = session.collectionId;
  const resourceId = buildKnowledgeMemoryResourceId(
    params.userId,
    collectionId,
  );

  const userMessage = await appendChatMessage({
    userId: params.userId,
    sessionId: session.id,
    role: "user",
    content: parsedInput.query,
  });

  const responseMessageId = crypto.randomUUID();
  const textPartId = `text:${responseMessageId}`;

  return createUIMessageStreamResponse({
    stream: createUIMessageStream<ChatReplyStreamUIMessage>({
      execute: async ({ writer }) => {
        let textStarted = false;

        const writeTextDelta = (delta: string) => {
          if (!delta) {
            return;
          }

          if (!textStarted) {
            writer.write({
              type: "start",
              messageId: responseMessageId,
            });
            writer.write({
              type: "text-start",
              id: textPartId,
            });
            textStarted = true;
          }

          writer.write({
            type: "text-delta",
            id: textPartId,
            delta,
          });
        };

        const finishText = () => {
          if (!textStarted) {
            return;
          }

          writer.write({
            type: "text-end",
            id: textPartId,
          });
        };

        writeStreamEvent(writer, {
          type: "reply-accepted",
          userMessage,
        });

        try {
          const answer = await streamKnowledgeAgentQuestion({
            question: parsedInput.query,
            collectionId,
            limit: parsedInput.limit,
            userId: params.userId,
            threadId: session.id,
            resourceId,
            onStreamPart: async (part) => {
              if (part.type === "text-delta") {
                writeTextDelta(String(part.textDelta ?? ""));
              }
            },
          });

          if (!textStarted && answer.answer) {
            writeTextDelta(answer.answer);
          }

          finishText();

          const assistantMessage = await appendChatMessage({
            userId: params.userId,
            sessionId: session.id,
            role: "assistant",
            content: answer.answer,
          });

          const refreshedSession = await requireChatSession(
            params.userId,
            session.id,
          );

          writeStreamEvent(writer, {
            type: "reply-completed",
            session: refreshedSession,
            userMessage,
            assistantMessage,
          });
          writer.write({
            type: "finish",
            finishReason: "stop",
          });
        } catch (error) {
          finishText();
          if (!(error instanceof ApiHttpError)) {
            console.error("[knowledge] streamChatReply failed", {
              errorMessage: readErrorText(error) || undefined,
              errorName: error instanceof Error ? error.name : undefined,
              ...getRuntimeModelLogContext(),
            });
          }

          writeStreamEvent(writer, {
            type: "reply-error",
            message: getErrorMessage(error),
          });
          writer.write({
            type: "finish",
            finishReason: "error",
          });
        }
      },
      onError: getErrorMessage,
    }),
  });
}
