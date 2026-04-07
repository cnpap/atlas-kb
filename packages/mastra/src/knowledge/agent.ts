import { ApiHttpError } from "@atlas-kb/errors";
import type { ChatTraceEvent } from "@atlas-kb/schema";
import type { ChunkType, FullOutput } from "@mastra/core/stream";
import { createKnowledgeAgent } from "../agents";
import { buildKnowledgeMemoryResourceId } from "../memory";
import {
  mapModelProviderError,
  requireChatModelProvider,
} from "./model-provider";
import { requireKnowledgeCollection } from "./repository";
import { getKnowledgeWorkspace } from "./runtime";

const AGENT_EXECUTION_TIMEOUT_MS = 20_000;
const MAX_AGENT_STEPS = 6;
const MAX_TRACE_DETAIL = 600;

class AgentPhaseTimeoutError extends Error {}

type StreamPart = {
  type: string;
  [key: string]: unknown;
};

type TraceUpdater = {
  id: string;
  kind: ChatTraceEvent["kind"];
  state: ChatTraceEvent["state"];
  title: string;
  detail?: string;
  toolCallId?: string;
  toolName?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AgentPhaseTimeoutError(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function trimTraceDetail(detail: string, max = MAX_TRACE_DETAIL): string {
  const normalized = detail.trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max - 1)}…`;
}

function createTraceStore(
  publish?: (event: ChatTraceEvent) => Promise<void> | void,
) {
  const orderedIds: string[] = [];
  const events = new Map<string, ChatTraceEvent>();

  return {
    async upsert(event: TraceUpdater) {
      const current = events.get(event.id);
      const nextEvent: ChatTraceEvent = {
        id: event.id,
        kind: event.kind,
        state: event.state,
        title: event.title,
        detail: event.detail ? trimTraceDetail(event.detail) : undefined,
        createdAt: current?.createdAt ?? nowIso(),
        toolCallId: event.toolCallId,
        toolName: event.toolName,
      };

      if (!events.has(event.id)) {
        orderedIds.push(event.id);
      }

      events.set(event.id, nextEvent);
      await publish?.(nextEvent);
    },
    list() {
      return orderedIds
        .map((id) => events.get(id))
        .filter((event): event is ChatTraceEvent => Boolean(event));
    },
  };
}

function getToolTraceKind(toolName: string): ChatTraceEvent["kind"] {
  if (toolName.toLowerCase().includes("search")) {
    return "search";
  }

  return "tool-call";
}

function summarizeToolArgs(args: unknown): string | undefined {
  if (!args || typeof args !== "object") {
    return undefined;
  }

  const values = args as Record<string, unknown>;

  if (typeof values.query === "string" && values.query.trim()) {
    return `query: ${values.query.trim()}`;
  }

  if (typeof values.path === "string" && values.path.trim()) {
    return `path: ${values.path.trim()}`;
  }

  return undefined;
}

function normalizeResultText(result: unknown): string {
  if (typeof result === "string") {
    return result.trim();
  }

  if (result === null || result === undefined) {
    return "";
  }

  try {
    return JSON.stringify(result).trim();
  } catch {
    return String(result).trim();
  }
}

function summarizeToolResult(result: unknown): string | undefined {
  const text = normalizeResultText(result);

  if (!text) {
    return undefined;
  }
  return trimTraceDetail(text);
}

function readToolErrorDetail(error: unknown): string {
  return normalizeResultText(error) || "工具执行失败";
}

function buildToolExecutionError(
  toolName: string,
  error: unknown,
): ApiHttpError {
  const detail = trimTraceDetail(readToolErrorDetail(error), 1200);

  return new ApiHttpError({
    statusCode: 422,
    code: "TOOL_EXECUTION_FAILED",
    message: `${toolName} failed: ${detail}`,
    cause: error,
  });
}

function buildUsageSummary(output: FullOutput<undefined>) {
  return {
    completionTokens: output.totalUsage.outputTokens ?? 0,
    promptTokens: output.totalUsage.inputTokens ?? 0,
    totalTokens: output.totalUsage.totalTokens ?? 0,
  };
}

async function buildKnowledgeExecutionContext(params: {
  collectionId: string;
  limit?: number;
  question: string;
  resourceId?: string;
  threadId?: string;
  userId: string;
}) {
  await requireKnowledgeCollection(params.userId, params.collectionId);
  requireChatModelProvider();

  const workspace = await getKnowledgeWorkspace({
    userId: params.userId,
    collectionId: params.collectionId,
  });
  const agent = createKnowledgeAgent({
    collectionId: params.collectionId,
    workspace,
  });

  return {
    agent,
    options: {
      maxSteps: MAX_AGENT_STEPS,
      memory:
        params.threadId && params.resourceId
          ? {
              thread: params.threadId,
              resource: params.resourceId,
            }
          : undefined,
      temperature: 0,
    },
  };
}

export async function runKnowledgeAgentQuestion(params: {
  limit?: number;
  question: string;
  collectionId: string;
  userId: string;
  threadId?: string;
  resourceId?: string;
}): Promise<{
  answer: string;
  question: string;
  collectionId: string;
  trace: ChatTraceEvent[];
}> {
  const trace = createTraceStore();

  await trace.upsert({
    id: "status:reply",
    kind: "status",
    state: "running",
    title: "智能体正在处理提问",
  });

  try {
    const context = await buildKnowledgeExecutionContext(params);
    const output = await withTimeout(
      context.agent.generate(params.question, context.options),
      AGENT_EXECUTION_TIMEOUT_MS,
      "知识库回答超时，请重试。",
    );

    for (const toolCall of output.toolCalls) {
      await trace.upsert({
        id: `tool:${toolCall.payload.toolCallId}`,
        kind: getToolTraceKind(toolCall.payload.toolName),
        state: "completed",
        title: toolCall.payload.toolName,
        detail: summarizeToolArgs(toolCall.payload.args),
        toolCallId: toolCall.payload.toolCallId,
        toolName: toolCall.payload.toolName,
      });
    }

    for (const toolResult of output.toolResults) {
      await trace.upsert({
        id: `tool:${toolResult.payload.toolCallId}`,
        kind: getToolTraceKind(toolResult.payload.toolName),
        state: toolResult.payload.isError ? "failed" : "completed",
        title: toolResult.payload.toolName,
        detail: summarizeToolResult(toolResult.payload.result),
        toolCallId: toolResult.payload.toolCallId,
        toolName: toolResult.payload.toolName,
      });

      if (toolResult.payload.isError) {
        throw buildToolExecutionError(
          toolResult.payload.toolName,
          toolResult.payload.result,
        );
      }
    }

    await trace.upsert({
      id: "status:reply",
      kind: "status",
      state: "completed",
      title: "回答生成完成",
    });

    return {
      answer:
        output.text.trim() ||
        "没有在当前资料文件夹中找到能直接回答该问题的证据。你可以换个问法，或者先导入更相关的资料。",
      question: params.question,
      collectionId: params.collectionId,
      trace: trace.list(),
    };
  } catch (error) {
    const message =
      error instanceof AgentPhaseTimeoutError
        ? error.message
        : error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "模型执行失败";

    await trace.upsert({
      id: "status:reply",
      kind: "status",
      state: "failed",
      title: "回答生成失败",
      detail: message,
    });

    if (
      error instanceof AgentPhaseTimeoutError ||
      error instanceof ApiHttpError
    ) {
      throw error;
    }

    throw mapModelProviderError(error, "AI 对话");
  }
}

export async function streamKnowledgeAgentQuestion(params: {
  limit?: number;
  question: string;
  collectionId: string;
  userId: string;
  threadId?: string;
  resourceId?: string;
  onStreamPart?: (part: StreamPart) => Promise<void> | void;
  onTraceEvent?: (event: ChatTraceEvent) => Promise<void> | void;
}): Promise<{
  answer: string;
  finishReason: string;
  question: string;
  collectionId: string;
  trace: ChatTraceEvent[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}> {
  const trace = createTraceStore(params.onTraceEvent);

  await trace.upsert({
    id: "status:reply",
    kind: "status",
    state: "running",
    title: "智能体正在处理提问",
  });

  try {
    const context = await buildKnowledgeExecutionContext(params);
    const stream = await withTimeout(
      context.agent.stream(params.question, context.options),
      AGENT_EXECUTION_TIMEOUT_MS,
      "知识库回答超时，请重试。",
    );
    const output = await withTimeout(
      (async () => {
        for await (const chunk of stream.fullStream as AsyncIterable<
          ChunkType<undefined>
        >) {
          switch (chunk.type) {
            case "text-delta":
              await params.onStreamPart?.({
                type: "text-delta",
                textDelta: chunk.payload.text,
              });
              break;
            case "tool-call":
              await trace.upsert({
                id: `tool:${chunk.payload.toolCallId}`,
                kind: getToolTraceKind(chunk.payload.toolName),
                state: "running",
                title: chunk.payload.toolName,
                detail: summarizeToolArgs(chunk.payload.args),
                toolCallId: chunk.payload.toolCallId,
                toolName: chunk.payload.toolName,
              });
              break;
            case "tool-result":
              await trace.upsert({
                id: `tool:${chunk.payload.toolCallId}`,
                kind: getToolTraceKind(chunk.payload.toolName),
                state: chunk.payload.isError ? "failed" : "completed",
                title: chunk.payload.toolName,
                detail: summarizeToolResult(chunk.payload.result),
                toolCallId: chunk.payload.toolCallId,
                toolName: chunk.payload.toolName,
              });

              if (chunk.payload.isError) {
                throw buildToolExecutionError(
                  chunk.payload.toolName,
                  chunk.payload.result,
                );
              }

              break;
            case "tool-error":
              await trace.upsert({
                id: `tool:${chunk.payload.toolCallId}`,
                kind: getToolTraceKind(chunk.payload.toolName),
                state: "failed",
                title: chunk.payload.toolName,
                detail: readToolErrorDetail(chunk.payload.error),
                toolCallId: chunk.payload.toolCallId,
                toolName: chunk.payload.toolName,
              });

              throw buildToolExecutionError(
                chunk.payload.toolName,
                chunk.payload.error,
              );
            default:
              break;
          }
        }

        return stream.getFullOutput();
      })(),
      AGENT_EXECUTION_TIMEOUT_MS,
      "知识库回答超时，请重试。",
    );

    await trace.upsert({
      id: "status:reply",
      kind: "status",
      state: "completed",
      title: "回答生成完成",
    });

    return {
      answer:
        output.text.trim() ||
        "没有在当前资料文件夹中找到能直接回答该问题的证据。你可以换个问法，或者先导入更相关的资料。",
      finishReason: output.finishReason || "stop",
      question: params.question,
      collectionId: params.collectionId,
      trace: trace.list(),
      usage: buildUsageSummary(output),
    };
  } catch (error) {
    const message =
      error instanceof AgentPhaseTimeoutError
        ? error.message
        : error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "模型执行失败";

    await trace.upsert({
      id: "status:reply",
      kind: "status",
      state: "failed",
      title: "回答生成失败",
      detail: message,
    });

    if (
      error instanceof AgentPhaseTimeoutError ||
      error instanceof ApiHttpError
    ) {
      throw error;
    }

    throw mapModelProviderError(error, "AI 对话");
  }
}

export async function answerKnowledgeQuestion(
  input: { question: string; collectionId: string; limit?: number },
  options: {
    userId: string;
  },
): Promise<{ question: string; answer: string; mode: "model" }> {
  const resourceId = buildKnowledgeMemoryResourceId(
    options.userId,
    input.collectionId,
  );
  const answer = await runKnowledgeAgentQuestion({
    question: input.question,
    collectionId: input.collectionId,
    limit: input.limit,
    userId: options.userId,
    threadId: `ask:${crypto.randomUUID()}`,
    resourceId,
  });

  return {
    question: input.question,
    answer: answer.answer,
    mode: "model",
  };
}
