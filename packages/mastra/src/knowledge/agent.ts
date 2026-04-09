import type { ChunkType, FullOutput } from "@mastra/core/stream";
import { ModelProviderUnavailableError } from "@atlas-kb/errors";
import { createKnowledgeAgent } from "../agents";
import { buildKnowledgeMemoryResourceId } from "../memory";
import {
  getRuntimeModelLabel,
  getRuntimeModelLogContext,
  mapRuntimeModelError,
} from "../models/runtime-model";
import { getActiveAssistantRolePromptConfig } from "./assistant-roles-repository";
import { requireKnowledgeCollection } from "./collections-repository";
import type { AssistantRolePromptConfig } from "./repository-shared";
import { getKnowledgeWorkspace } from "./runtime";

const AGENT_EXECUTION_TIMEOUT_MS = 60_000;
const MAX_AGENT_STEPS = 6;
const KNOWLEDGE_AGENT_TIMEOUT_MESSAGE = "知识库回答超时，请稍后重试。";
const KNOWLEDGE_EMPTY_EVIDENCE_ANSWER =
  "没有在当前资料文件夹中找到能直接回答该问题的证据。你可以换个问法，或者先导入更相关的资料。";

class KnowledgeAgentTimeoutError extends Error {
  constructor() {
    super(KNOWLEDGE_AGENT_TIMEOUT_MESSAGE);
    this.name = "KnowledgeAgentTimeoutError";
  }
}

type KnowledgeExecutionParams = {
  assistantRole?: AssistantRolePromptConfig;
  limit?: number;
  question: string;
  collectionId: string;
  userId: string;
  threadId?: string;
  resourceId?: string;
};

type KnowledgeAnswerResult = {
  answer: string;
  finishReason: string;
  question: string;
  collectionId: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

type KnowledgeAgentOutput = Pick<
  FullOutput<undefined>,
  "finishReason" | "text" | "totalUsage"
>;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new KnowledgeAgentTimeoutError());
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

function buildUsageSummary(output: KnowledgeAgentOutput) {
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
  assistantRole?: AssistantRolePromptConfig;
  collectionId: string;
  resourceId?: string;
  threadId?: string;
  userId: string;
}) {
  // 对话和 ask 接口共用同一套执行上下文：校验资料库、获取 workspace、
  // 绑定智能体，并附上 Mastra 记忆所需的标识。
  const [workspace, assistantRole] = await Promise.all([
    requireKnowledgeCollection(params.userId, params.collectionId).then(() =>
      getKnowledgeWorkspace({
        userId: params.userId,
        collectionId: params.collectionId,
      }),
    ),
    params.assistantRole
      ? Promise.resolve(params.assistantRole)
      : getActiveAssistantRolePromptConfig(params.userId),
  ]);
  const agent = createKnowledgeAgent({
    assistantRole,
    collectionId: params.collectionId,
    workspace,
  });

  return {
    agent,
    options: {
      maxSteps: MAX_AGENT_STEPS,
      memory: params.threadId
        ? {
            // sessionId 作为 thread 传入，这样观察记忆只会作用在当前会话内。
            // resourceId 保持在用户+资料库维度稳定，是当前 Mastra 记忆运行时
            // 的调用要求。
            thread: params.threadId,
            resource:
              params.resourceId ??
              buildKnowledgeMemoryResourceId(
                params.userId,
                params.collectionId,
              ),
          }
        : undefined,
      temperature: 0,
    },
  };
}

type KnowledgeExecutionContext = Awaited<
  ReturnType<typeof buildKnowledgeExecutionContext>
>;

function buildKnowledgeAnswerResult(params: {
  collectionId: string;
  output: KnowledgeAgentOutput;
  question: string;
}): KnowledgeAnswerResult {
  const answer = params.output.text.trim() || KNOWLEDGE_EMPTY_EVIDENCE_ANSWER;

  if (answer === KNOWLEDGE_EMPTY_EVIDENCE_ANSWER) {
    logFallbackAnswer({
      collectionId: params.collectionId,
      output: params.output,
      question: params.question,
    });
  }

  return {
    answer,
    finishReason: params.output.finishReason || "stop",
    question: params.question,
    collectionId: params.collectionId,
    usage: buildUsageSummary(params.output),
  };
}

function mapKnowledgeExecutionError(error: unknown) {
  if (error instanceof KnowledgeAgentTimeoutError) {
    console.error("[knowledge-agent] timeout", {
      errorMessage: error.message,
      errorName: error.name,
      ...getRuntimeModelLogContext(),
    });

    return new ModelProviderUnavailableError(
      KNOWLEDGE_AGENT_TIMEOUT_MESSAGE,
      error,
    );
  }

  return mapRuntimeModelError(error, "AI 对话");
}

async function streamKnowledgeExecutionOutput(
  context: KnowledgeExecutionContext,
  params: {
    onTextDelta: (delta: string) => Promise<void> | void;
    question: string;
  },
): Promise<KnowledgeAgentOutput> {
  const stream = await withTimeout(
    context.agent.stream(params.question, context.options),
    AGENT_EXECUTION_TIMEOUT_MS,
  );

  return withTimeout(
    (async () => {
      for await (const chunk of stream.fullStream as AsyncIterable<
        ChunkType<undefined>
      >) {
        if (chunk.type === "text-delta") {
          await params.onTextDelta(chunk.payload.text);
        }
      }

      return stream.getFullOutput();
    })(),
    AGENT_EXECUTION_TIMEOUT_MS,
  );
}

async function executeKnowledgeQuestion(
  params: KnowledgeExecutionParams & {
    onTextDelta?: (delta: string) => Promise<void> | void;
  },
): Promise<KnowledgeAnswerResult> {
  try {
    const context = await buildKnowledgeExecutionContext(params);
    const output = params.onTextDelta
      ? await streamKnowledgeExecutionOutput(context, {
          onTextDelta: params.onTextDelta,
          question: params.question,
        })
      : await withTimeout(
          context.agent.generate(params.question, context.options),
          AGENT_EXECUTION_TIMEOUT_MS,
        );

    return buildKnowledgeAnswerResult({
      collectionId: params.collectionId,
      output,
      question: params.question,
    });
  } catch (error) {
    throw mapKnowledgeExecutionError(error);
  }
}

export async function runKnowledgeAgentQuestion(
  params: KnowledgeExecutionParams,
): Promise<{
  answer: string;
  question: string;
  collectionId: string;
}> {
  const answer = await executeKnowledgeQuestion(params);

  return {
    answer: answer.answer,
    question: answer.question,
    collectionId: answer.collectionId,
  };
}

export async function streamKnowledgeAgentQuestion(
  params: KnowledgeExecutionParams & {
    onTextDelta?: (delta: string) => Promise<void> | void;
  },
): Promise<{
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
  return executeKnowledgeQuestion(params).then((answer) => ({
    answer: answer.answer,
    finishReason: answer.finishReason,
    question: answer.question,
    collectionId: answer.collectionId,
    usage: answer.usage,
  }));
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
  });

  return {
    question: input.question,
    answer: answer.answer,
    mode: "model",
  };
}
