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
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { getRuntimeModelLogContext } from "../models/runtime-model";
import {
  runKnowledgeAgentQuestion,
  streamKnowledgeAgentQuestion,
} from "./agent";
import { getActiveAssistantRolePromptConfig } from "./assistant-roles-repository";
import {
  appendChatMessage,
  createChatSession,
  deleteChatSession,
  isPlaceholderChatSession,
  listChatMessages,
  renamePlaceholderChatSession,
  listChatSessions,
  requireChatSession,
  saveMessageFeedback,
  updateChatSession,
} from "./chat-repository";
import { createChatReplyStreamEventMapper } from "./chat-stream-events";
import { buildFallbackChatTitle, generateChatTitle } from "./chat-title";
import type { AssistantRolePromptConfig } from "./repository-shared";

export {
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  saveMessageFeedback,
  updateChatSession,
};

type ChatReplyStreamUIMessage = UIMessage<
  never,
  { event: ChatReplyStreamDataEvent }
>;

function writeStreamEvent(
  writer: UIMessageStreamWriter<ChatReplyStreamUIMessage>,
  event: ChatReplyStreamDataEvent,
  id: string,
) {
  writer.write({
    type: "data-event",
    id,
    data: event,
  });
}

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
  if (error instanceof ApiHttpError && error.message.trim()) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "AI 对话失败";
}

async function autoRenamePlaceholderChatSession(params: {
  query: string;
  sessionId: string;
  userId: string;
}): Promise<void> {
  const fallbackTitle = buildFallbackChatTitle(params.query);

  if (!fallbackTitle) {
    return;
  }

  try {
    const nextTitle = (await generateChatTitle(params.query)) || fallbackTitle;

    await renamePlaceholderChatSession({
      userId: params.userId,
      sessionId: params.sessionId,
      title: nextTitle,
    });
    return;
  } catch (error) {
    console.warn("[knowledge] chat title generation failed", {
      errorMessage: readErrorText(error) || undefined,
      errorName: error instanceof Error ? error.name : undefined,
      ...getRuntimeModelLogContext(),
    });
  }

  try {
    await renamePlaceholderChatSession({
      userId: params.userId,
      sessionId: params.sessionId,
      title: fallbackTitle,
    });
  } catch (error) {
    console.warn("[knowledge] chat title fallback update failed", {
      errorMessage: readErrorText(error) || undefined,
      errorName: error instanceof Error ? error.name : undefined,
      ...getRuntimeModelLogContext(),
    });
  }
}

async function prepareChatReplyExecution(params: {
  userId: string;
  sessionId: string;
  query: string;
  limit?: number;
}) {
  const [session, assistantRole] = await Promise.all([
    requireChatSession(params.userId, params.sessionId),
    getActiveAssistantRolePromptConfig(params.userId),
  ]);
  const userMessage = await appendChatMessage({
    userId: params.userId,
    sessionId: session.id,
    assistantRoleId: assistantRole.id,
    role: "user",
    content: params.query,
  });
  const titleUpdatePromise = isPlaceholderChatSession(session)
    ? autoRenamePlaceholderChatSession({
        userId: params.userId,
        sessionId: session.id,
        query: params.query,
      })
    : Promise.resolve();

  return {
    session,
    assistantRole,
    userMessage,
    titleUpdatePromise,
    agentParams: {
      question: params.query,
      collectionId: session.collectionId,
      limit: params.limit,
      userId: params.userId,
      threadId: session.id,
      assistantRole,
    },
  };
}

async function completeChatReply(params: {
  assistantRole: AssistantRolePromptConfig;
  userId: string;
  sessionId: string;
  userMessage: ChatReplyFinal["userMessage"];
  answer: string;
  titleUpdatePromise?: Promise<void>;
}): Promise<ChatReplyFinal> {
  const assistantMessage = await appendChatMessage({
    userId: params.userId,
    sessionId: params.sessionId,
    assistantRoleId: params.assistantRole.id,
    role: "assistant",
    content: params.answer,
  });
  await params.titleUpdatePromise;
  const session = await requireChatSession(params.userId, params.sessionId);

  return {
    session,
    userMessage: params.userMessage,
    assistantMessage,
  };
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
  const parsedInput = ChatReplyRequestSchema.parse(params.input);
  const execution = await prepareChatReplyExecution({
    userId: params.userId,
    sessionId: params.sessionId,
    query: parsedInput.query,
    limit: parsedInput.limit,
  });
  const answer = await runKnowledgeAgentQuestion(execution.agentParams);

  return completeChatReply({
    assistantRole: execution.assistantRole,
    userId: params.userId,
    sessionId: execution.session.id,
    userMessage: execution.userMessage,
    answer: answer.answer,
    titleUpdatePromise: execution.titleUpdatePromise,
  });
}

export async function streamChatReply(params: {
  input: ChatReplyStreamRequest;
  userId: string;
}): Promise<Response> {
  // 流式对话和 createChatReply 保持同样的持久化顺序，只是对前端只发
  // 已接收、文本增量、已完成、错误 这几个最小事件。
  const parsedInput = ChatReplyStreamRequestSchema.parse(params.input);
  const execution = await prepareChatReplyExecution({
    userId: params.userId,
    sessionId: parsedInput.sessionId,
    query: parsedInput.query,
    limit: parsedInput.limit,
  });
  const { session, userMessage } = execution;
  const responseMessageId = crypto.randomUUID();
  const textPartId = `text:${responseMessageId}`;
  const progressEventMapper = createChatReplyStreamEventMapper();

  return createUIMessageStreamResponse({
    stream: createUIMessageStream<ChatReplyStreamUIMessage>({
      execute: async ({ writer }) => {
        let eventIndex = 0;
        let textStarted = false;

        const nextEventId = () =>
          `event:${responseMessageId}:${String(eventIndex++)}`;

        const writeReplyEvent = (event: ChatReplyStreamDataEvent) => {
          writeStreamEvent(writer, event, nextEventId());
        };

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

        writeReplyEvent({
          type: "reply-accepted",
          userMessage,
        });

        try {
          const answer = await streamKnowledgeAgentQuestion({
            ...execution.agentParams,
            onChunk: async (chunk) => {
              if (chunk.type === "text-delta") {
                writeTextDelta(chunk.payload.text);
              }

              for (const event of progressEventMapper.mapChunk(chunk)) {
                writeReplyEvent(event);
              }
            },
          });

          if (!textStarted && answer.answer) {
            writeTextDelta(answer.answer);
          }

          finishText();

          const finishedEvent =
            progressEventMapper.ensureFinished(responseMessageId);

          if (finishedEvent) {
            writeReplyEvent(finishedEvent);
          }

          const reply = await completeChatReply({
            assistantRole: execution.assistantRole,
            userId: params.userId,
            sessionId: session.id,
            userMessage,
            answer: answer.answer,
            titleUpdatePromise: execution.titleUpdatePromise,
          });

          writeReplyEvent({
            type: "reply-completed",
            ...reply,
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

          const failureMessage = getErrorMessage(error);
          const failureEvent = progressEventMapper.ensureFailed(
            failureMessage,
            responseMessageId,
          );

          if (failureEvent) {
            writeReplyEvent(failureEvent);
          }

          writeReplyEvent({
            type: "reply-error",
            message: failureMessage,
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
