import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
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
type TraceDataEvent = Extract<ChatReplyStreamDataEvent, { type: "trace" }>;
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
    trace: TraceDataEvent;
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
    case "trace":
      writer.write({
        type: "data-trace",
        id: event.event.id,
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "AI 对话失败";
}

export async function createChatReply(params: {
  sessionId: string;
  input: ChatReplyRequest;
  fetchImpl?: typeof fetch;
}): Promise<ChatReplyFinal> {
  void params.fetchImpl;
  const session = await requireChatSession(params.sessionId);
  const parsedInput = ChatReplyRequestSchema.parse(params.input);
  const collectionId = parsedInput.collectionId ?? session.collectionId;

  if (!collectionId) {
    throw new Error("请先选择一个资料分组，再开始 AI 对话");
  }

  const userMessage = await appendChatMessage({
    sessionId: session.id,
    role: "user",
    content: parsedInput.query,
  });
  const answer = await runKnowledgeAgentQuestion({
    question: parsedInput.query,
    spaceId: collectionId,
    limit: parsedInput.limit,
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

export async function streamChatReply(params: {
  input: ChatReplyStreamRequest;
}): Promise<Response> {
  const parsedInput = ChatReplyStreamRequestSchema.parse(params.input);
  const session = await requireChatSession(parsedInput.sessionId);
  const collectionId = parsedInput.collectionId ?? session.collectionId;

  if (!collectionId) {
    throw new Error("请先选择一个资料分组，再开始 AI 对话");
  }

  const userMessage = await appendChatMessage({
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
            spaceId: collectionId,
            limit: parsedInput.limit,
            onStreamPart: async (part) => {
              if (part.type === "text-delta") {
                writeTextDelta(String(part.textDelta ?? ""));
              }
            },
            onTraceEvent: async (event) => {
              writeStreamEvent(writer, {
                type: "trace",
                event,
              });
            },
          });

          if (!textStarted && answer.answer) {
            writeTextDelta(answer.answer);
          }

          finishText();

          const assistantMessage = await appendChatMessage({
            sessionId: session.id,
            role: "assistant",
            content: answer.answer,
            citations: answer.citations,
            retrieval: answer.search,
            trace: answer.trace,
          });
          const refreshedSession = await requireChatSession(session.id);

          writeStreamEvent(writer, {
            type: "reply-completed",
            session: refreshedSession,
            userMessage,
            assistantMessage,
            retrieval: answer.search,
            search: answer.search,
          });
          writer.write({
            type: "finish",
            finishReason: answer.finishReason,
          });
        } catch (error) {
          finishText();

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
