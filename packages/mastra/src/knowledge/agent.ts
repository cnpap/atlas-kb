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

    return {
      answer:
        output.text.trim() ||
        "没有在当前资料文件夹中找到能直接回答该问题的证据。你可以换个问法，或者先导入更相关的资料。",
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

    return {
      answer:
        output.text.trim() ||
        "没有在当前资料文件夹中找到能直接回答该问题的证据。你可以换个问法，或者先导入更相关的资料。",
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
