import { ApiHttpError, BadRequestError } from "@atlas-kb/errors";
import type {
  ChatReplyFinal,
  ChatReplyRequest,
  ChatReplyStreamDataEvent,
  ChatReplyStreamFocusSource,
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
  listChatMessages,
  listChatSessions,
  requireChatSession,
  saveMessageFeedback,
  updateChatSession,
} from "./chat-repository";
import { createChatReplyStreamEventMapper } from "./chat-stream-events";
import type { AssistantRolePromptConfig } from "./repository-shared";
import { requireKnowledgeSource } from "./sources-repository";
import { resolveKnowledgeSourceWorkspacePath } from "./workspace-paths";

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

async function prepareChatReplyExecution(params: {
  userId: string;
  sessionId: string;
  query: string;
  limit?: number;
  sourceId?: string;
}) {
  const [session, assistantRole] = await Promise.all([
    requireChatSession(params.userId, params.sessionId),
    getActiveAssistantRolePromptConfig(params.userId),
  ]);
  const source = params.sourceId
    ? await requireKnowledgeSource(params.userId, params.sourceId)
    : null;

  if (source && source.collectionId !== session.collectionId) {
    throw new BadRequestError("当前资料不属于本次会话所在的资料文件夹。");
  }

  const focusSource = source ? buildChatFocusSource(source) : undefined;
  const userMessage = await appendChatMessage({
    userId: params.userId,
    sessionId: session.id,
    assistantRoleId: assistantRole.id,
    role: "user",
    content: params.query,
  });

  return {
    session,
    assistantRole,
    focusSource,
    userMessage,
    agentParams: {
      question: params.query,
      collectionId: session.collectionId,
      focusSource,
      limit: params.limit,
      userId: params.userId,
      threadId: session.id,
      assistantRole,
    },
  };
}

function buildChatFocusSource(params: {
  id: string;
  title: string;
  documentId?: string;
  sourceFilename?: string;
}): ChatReplyStreamFocusSource {
  const path = resolveKnowledgeSourceWorkspacePath(params);

  if (!path) {
    throw new BadRequestError("当前资料缺少可读取的工作区文件路径。");
  }

  return {
    path,
    sourceId: params.id,
    title: params.title.trim() || path.replace(/^\//, ""),
  };
}

async function completeChatReply(params: {
  assistantRole: AssistantRolePromptConfig;
  userId: string;
  sessionId: string;
  userMessage: ChatReplyFinal["userMessage"];
  answer: string;
}): Promise<ChatReplyFinal> {
  const assistantMessage = await appendChatMessage({
    userId: params.userId,
    sessionId: params.sessionId,
    assistantRoleId: params.assistantRole.id,
    role: "assistant",
    content: params.answer,
  });
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
    sourceId: parsedInput.sourceId,
  });
  const answer = await runKnowledgeAgentQuestion(execution.agentParams);

  return completeChatReply({
    assistantRole: execution.assistantRole,
    userId: params.userId,
    sessionId: execution.session.id,
    userMessage: execution.userMessage,
    answer: answer.answer,
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
    sourceId: parsedInput.sourceId,
  });
  const { session, userMessage } = execution;
  const responseMessageId = crypto.randomUUID();
  const textPartId = `text:${responseMessageId}`;
  const progressEventMapper = createChatReplyStreamEventMapper({
    focusSource: execution.focusSource,
  });

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
