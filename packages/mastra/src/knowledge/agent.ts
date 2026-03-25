import type {
  AskKnowledgeCitation,
  ChatTraceEvent,
  SearchKnowledgeResult,
} from "@atlas-kb/schema";
import {
  mapModelProviderError,
  requireChatModelProvider,
} from "./model-provider";
import { requireKnowledgeSpace } from "./repository";
import {
  annotateAnswerUsage,
  generateModelAnswerFromCitations,
  searchKnowledge,
  streamModelAnswerFromCitations,
  toCitation,
} from "./search";

const AGENT_EXECUTION_TIMEOUT_MS = 20_000;

class AgentPhaseTimeoutError extends Error {}

type StreamPart = {
  type: string;
  [key: string]: unknown;
};

type UsageSummary = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
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

function trimTraceDetail(detail: string, max = 600): string {
  const normalized = detail.trim();

  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max - 1)}…`;
}

function buildNoEvidenceAnswer(question: string): string {
  return `没有在知识库中找到能直接回答“${question}”的证据。你可以换个问法，或者先导入更相关的资料。`;
}

type TraceUpdater = {
  id: string;
  kind: ChatTraceEvent["kind"];
  state: ChatTraceEvent["state"];
  title: string;
  detail?: string;
  toolCallId?: string;
  toolName?: string;
};

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

export async function runKnowledgeAgentQuestion(params: {
  limit?: number;
  question: string;
  spaceId: string;
}): Promise<{
  answer: string;
  citations: AskKnowledgeCitation[];
  question: string;
  spaceId: string;
  search: SearchKnowledgeResult;
  toolCalls: number;
}> {
  const limit = params.limit ?? 3;

  await requireKnowledgeSpace(params.spaceId);
  requireChatModelProvider();

  const search = annotateAnswerUsage(
    await withTimeout(
      searchKnowledge(
        {
          query: params.question,
          spaceId: params.spaceId,
          limit,
        },
        {
          apiKey: "",
        },
      ),
      AGENT_EXECUTION_TIMEOUT_MS,
      "知识库检索超时，请重试。",
    ),
    limit,
  );
  const citations = search.hits.slice(0, limit).map(toCitation);
  const answer =
    citations.length === 0
      ? buildNoEvidenceAnswer(params.question)
      : (await generateModelAnswerFromCitations({
          question: params.question,
          citations,
        })) || "";

  if (!answer) {
    throw new Error("模型服务返回了空回答，请重试。");
  }

  return {
    answer,
    citations,
    question: params.question,
    search,
    spaceId: params.spaceId,
    toolCalls: citations.length > 0 ? 1 : 0,
  };
}

export async function streamKnowledgeAgentQuestion(params: {
  limit?: number;
  question: string;
  spaceId: string;
  onStreamPart?: (part: StreamPart) => Promise<void> | void;
  onTraceEvent?: (event: ChatTraceEvent) => Promise<void> | void;
}): Promise<{
  answer: string;
  citations: AskKnowledgeCitation[];
  finishReason: string;
  question: string;
  search: SearchKnowledgeResult;
  spaceId: string;
  toolCalls: number;
  trace: ChatTraceEvent[];
  usage?: UsageSummary;
}> {
  const trace = createTraceStore(params.onTraceEvent);

  await trace.upsert({
    id: "status:reply",
    kind: "status",
    state: "running",
    title: "智能体正在检索资料并组织回答",
  });

  try {
    await requireKnowledgeSpace(params.spaceId);
    requireChatModelProvider();

    const limit = params.limit ?? 3;
    const search = annotateAnswerUsage(
      await withTimeout(
        searchKnowledge(
          {
            query: params.question,
            spaceId: params.spaceId,
            limit,
          },
          {
            // Keep the retrieval path short. Skip the model-based query rewrite.
            apiKey: "",
          },
        ),
        AGENT_EXECUTION_TIMEOUT_MS,
        "知识库检索超时，请重试。",
      ),
      limit,
    );
    const citations = search.hits.slice(0, limit).map(toCitation);

    await trace.upsert({
      id: "status:search",
      kind: "search",
      state: "completed",
      title: `命中 ${search.total} 条资料`,
      detail: `查询变体 ${search.queryVariants.length} 个。`,
    });

    const fallbackAnswer =
      citations.length === 0
        ? buildNoEvidenceAnswer(params.question)
        : undefined;

    const streamResult = fallbackAnswer
      ? {
          answer: fallbackAnswer,
          finishReason: "stop",
        }
      : await streamModelAnswerFromCitations({
          question: params.question,
          citations,
          onTextDelta: async (delta) => {
            await params.onStreamPart?.({
              type: "text-delta",
              textDelta: delta,
            });
          },
        });

    const answer = streamResult.answer.trim() || fallbackAnswer || "";

    if (!answer) {
      const generatedAnswer =
        (await generateModelAnswerFromCitations({
          question: params.question,
          citations,
        })) || "";

      if (!generatedAnswer) {
        throw new Error("模型服务返回了空回答，请重试。");
      }

      await params.onStreamPart?.({
        type: "text-delta",
        textDelta: generatedAnswer,
      });

      await trace.upsert({
        id: "status:reply",
        kind: "status",
        state: "completed",
        title: "回答生成完成",
      });

      return {
        answer: generatedAnswer,
        citations,
        finishReason: "stop",
        question: params.question,
        search,
        spaceId: params.spaceId,
        toolCalls: 0,
        trace: trace.list(),
      };
    }

    await trace.upsert({
      id: "status:reply",
      kind: "status",
      state: "completed",
      title: "回答生成完成",
    });

    return {
      answer,
      citations,
      finishReason: streamResult.finishReason,
      question: params.question,
      search,
      spaceId: params.spaceId,
      toolCalls: 0,
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
    await trace.upsert({
      id: "status:error",
      kind: "error",
      state: "failed",
      title: "回答生成失败",
      detail: message,
    });

    if (error instanceof AgentPhaseTimeoutError) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.message.includes("模型服务返回了空回答")
    ) {
      throw error;
    }

    throw mapModelProviderError(error, "AI 对话");
  }
}
