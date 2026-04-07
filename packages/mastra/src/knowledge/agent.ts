import type { ChunkType, FullOutput } from "@mastra/core/stream";
import { createKnowledgeAgent } from "../agents";
import { buildKnowledgeMemoryResourceId } from "../memory";
import { getRuntimeModelLabel } from "./config";
import {
  mapModelProviderError,
  requireChatModelProvider,
} from "./model-provider";
import { requireKnowledgeCollection } from "./repository";
import { getKnowledgeWorkspace } from "./runtime";

const AGENT_EXECUTION_TIMEOUT_MS = 20_000;
const MAX_AGENT_STEPS = 6;
const KNOWLEDGE_EMPTY_EVIDENCE_ANSWER =
  "没有在当前资料文件夹中找到能直接回答该问题的证据。你可以换个问法，或者先导入更相关的资料。";

class AgentPhaseTimeoutError extends Error {}

type StreamPart = {
  type: string;
  [key: string]: unknown;
};

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

function buildUsageSummary(output: FullOutput<undefined>) {
  return {
    completionTokens: output.totalUsage.outputTokens ?? 0,
    promptTokens: output.totalUsage.inputTokens ?? 0,
    totalTokens: output.totalUsage.totalTokens ?? 0,
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function collectToolSignals(value: unknown, bucket: Set<string>) {
  const record = readRecord(value);

  if (!record) {
    return;
  }

  const toolName = readString(record.toolName) ?? readString(record.name);

  if (toolName && /workspace|tool|search|files|function/i.test(toolName)) {
    bucket.add(toolName);
  }

  const role = readString(record.role);

  if (role === "tool") {
    bucket.add("role:tool");
  }

  const type = readString(record.type);

  if (type && /tool|function_call/i.test(type)) {
    bucket.add(`type:${type}`);
  }

  for (const nested of [record.steps, record.toolCalls, record.toolResults]) {
    for (const item of readArray(nested)) {
      collectToolSignals(item, bucket);
    }
  }
}

function buildFallbackDiagnostics(output: unknown) {
  const record = readRecord(output);
  const toolSignals = new Set<string>();
  collectToolSignals(output, toolSignals);

  return {
    finishReason: readString(record?.finishReason),
    stepCount: readArray(record?.steps).length || undefined,
    toolSignals: [...toolSignals],
  };
}

function logFallbackAnswer(params: {
  collectionId: string;
  output: unknown;
  question: string;
}) {
  const diagnostics = buildFallbackDiagnostics(params.output);

  console.error("[knowledge-agent] empty-evidence fallback", {
    collectionId: params.collectionId,
    question: params.question,
    runtimeModel: getRuntimeModelLabel(),
    finishReason: diagnostics.finishReason,
    stepCount: diagnostics.stepCount,
    toolSignals: diagnostics.toolSignals,
  });
}

async function buildKnowledgeExecutionContext(params: {
  collectionId: string;
  resourceId?: string;
  threadId?: string;
  userId: string;
}) {
  // 对话和 ask 接口共用同一套执行上下文：校验资料库、获取 workspace、
  // 绑定智能体，并附上 Mastra 记忆所需的标识。
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
              // sessionId 作为 thread 传入，这样观察记忆只会作用在当前会话内。
              // resourceId 保持在用户+资料库维度稳定，是当前 Mastra 记忆运行时
              // 的调用要求。
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
}> {
  try {
    const context = await buildKnowledgeExecutionContext(params);
    const output = await withTimeout(
      context.agent.generate(params.question, context.options),
      AGENT_EXECUTION_TIMEOUT_MS,
      "知识库回答超时，请重试。",
    );
    const answer = output.text.trim() || KNOWLEDGE_EMPTY_EVIDENCE_ANSWER;

    if (answer === KNOWLEDGE_EMPTY_EVIDENCE_ANSWER) {
      logFallbackAnswer({
        collectionId: params.collectionId,
        output,
        question: params.question,
      });
    }

    return {
      answer,
      question: params.question,
      collectionId: params.collectionId,
    };
  } catch (error) {
    if (error instanceof AgentPhaseTimeoutError) {
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
}): Promise<{
  answer: string;
  finishReason: string;
  question: string;
  collectionId: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}> {
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
          if (chunk.type === "text-delta") {
            await params.onStreamPart?.({
              type: "text-delta",
              textDelta: chunk.payload.text,
            });
          }
        }

        return stream.getFullOutput();
      })(),
      AGENT_EXECUTION_TIMEOUT_MS,
      "知识库回答超时，请重试。",
    );
    const answer = output.text.trim() || KNOWLEDGE_EMPTY_EVIDENCE_ANSWER;

    if (answer === KNOWLEDGE_EMPTY_EVIDENCE_ANSWER) {
      logFallbackAnswer({
        collectionId: params.collectionId,
        output,
        question: params.question,
      });
    }

    return {
      answer,
      finishReason: output.finishReason || "stop",
      question: params.question,
      collectionId: params.collectionId,
      usage: buildUsageSummary(output),
    };
  } catch (error) {
    if (error instanceof AgentPhaseTimeoutError) {
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
  // 非聊天的 ask 接口仍然走同一条智能体链路，但会使用临时 threadId，
  // 避免挂到持久化 chat session 上。
  const answer = await runKnowledgeAgentQuestion({
    question: input.question,
    collectionId: input.collectionId,
    limit: input.limit,
    userId: options.userId,
    threadId: `ask:${crypto.randomUUID()}`,
    resourceId: buildKnowledgeMemoryResourceId(
      options.userId,
      input.collectionId,
    ),
  });

  return {
    question: input.question,
    answer: answer.answer,
    mode: "model",
  };
}
