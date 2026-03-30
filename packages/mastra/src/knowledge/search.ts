import type {
  AskKnowledgeCitation,
  AskKnowledgeRequest,
  AskKnowledgeResult,
  SearchKnowledgeHit,
  SearchKnowledgeRequest,
  SearchKnowledgeResult,
} from "@atlas-kb/schema";
import {
  AskKnowledgeRequestSchema,
  SearchKnowledgeRequestSchema,
} from "@atlas-kb/schema";
import {
  ModelInvocationTimeoutError,
  throwMappedModelProviderError,
} from "./model-provider";
import { getOpenAIApiKey, getOpenAIModel, getOpenAIUrl } from "./config";
import { listKnowledgeSources, requireKnowledgeCollection } from "./repository";
import { buildSearchSnippet } from "./search-utils";
import { getKnowledgeServiceForUser } from "./runtime";

const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_ASK_LIMIT = 5;
const MODEL_REQUEST_TIMEOUT_MS = 30_000;
const MODEL_FIRST_TOKEN_TIMEOUT_MS = 45_000;
const MODEL_STREAM_IDLE_TIMEOUT_MS = 20_000;

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
}

interface OpenAIChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
    finish_reason?: string | null;
  }>;
}

function getMessageText(
  payload: OpenAIChatCompletionResponse,
): string | undefined {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim() || undefined;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  return (
    content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .trim() || undefined
  );
}

function getDeltaText(payload: OpenAIChatCompletionChunk): string | undefined {
  const content = payload.choices?.[0]?.delta?.content;

  if (typeof content === "string") {
    return content || undefined;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  return (
    content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text ?? "")
      .join("") || undefined
  );
}

function buildCitationContext(citations: AskKnowledgeCitation[]): string {
  return citations
    .map(
      (citation, index) =>
        `${index + 1}. ${citation.title}${citation.sectionPath ? ` / ${citation.sectionPath}` : ""}\n${citation.snippet}`,
    )
    .join("\n\n");
}

function buildAnswerMessages(params: {
  question: string;
  citations: AskKnowledgeCitation[];
}) {
  return [
    {
      role: "system",
      content:
        "You are Atlas KB. Answer only from the supplied evidence. Be concise, say when evidence is insufficient, and mention supporting source titles naturally in the answer.",
    },
    {
      role: "user",
      content: `Question: ${params.question}\n\nEvidence:\n${buildCitationContext(params.citations)}`,
    },
  ];
}

function withOperationTimeout<T>(params: {
  error: Error;
  onTimeout?: () => void;
  promise: Promise<T>;
  timeoutMs: number;
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      params.onTimeout?.();
      reject(params.error);
    }, params.timeoutMs);

    params.promise.then(
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

function coerceCollectionId(input: SearchKnowledgeRequest): string | undefined {
  return input.collectionId?.trim() || input.spaceId?.trim() || undefined;
}

function filterSources(
  sources: Awaited<ReturnType<typeof listKnowledgeSources>>,
  input: SearchKnowledgeRequest,
) {
  return sources.filter((source) => {
    if (source.status !== "ready") {
      return Boolean(input.includeArchived && source.status === "archived");
    }

    if (
      input.sourceTypes?.length &&
      !input.sourceTypes.includes(source.sourceType)
    ) {
      return false;
    }

    if (
      input.tags?.length &&
      !input.tags.every((tag) => source.tags.includes(tag))
    ) {
      return false;
    }

    return true;
  });
}

function toSearchHit(args: {
  query: string;
  source: Awaited<ReturnType<typeof listKnowledgeSources>>[number];
  segment: Awaited<
    ReturnType<
      Awaited<
        ReturnType<typeof getKnowledgeServiceForUser>
      >["searchKnowledgeSegments"]
    >
  >["segments"][number];
}): SearchKnowledgeHit {
  return {
    sourceId: args.source.id,
    documentId: args.source.documentId || args.segment.documentId,
    collectionId: args.source.collectionId,
    spaceId: args.source.collectionId,
    chunkId: args.segment.segmentId,
    title: args.source.title,
    summary: args.source.summary,
    snippet: buildSearchSnippet(
      args.segment.text,
      args.query,
      args.segment.excerpt,
    ),
    sectionPath:
      args.segment.sectionPath.length > 0
        ? args.segment.sectionPath.join(" / ")
        : undefined,
    sourceFilename: args.source.sourceFilename,
    sourceUrl: args.source.sourceUrl,
    downloadUrl:
      args.source.sourceType === "file" || args.source.sourceType === "seed"
        ? `/api/kb/sources/${encodeURIComponent(args.source.id)}/download`
        : undefined,
    sourceType: args.source.sourceType,
    tags: [...args.source.tags],
    score: args.segment.score,
    strategy: "rerank",
    usedInAnswer: false,
    recallPaths: ["关键词召回", "语义召回", "重排"],
  };
}

function dedupeHits(
  hits: SearchKnowledgeHit[],
  limit: number,
): SearchKnowledgeHit[] {
  const bestByChunk = new Map<string, SearchKnowledgeHit>();

  for (const hit of hits) {
    const existing = bestByChunk.get(hit.chunkId);

    if (!existing || existing.score < hit.score) {
      bestByChunk.set(hit.chunkId, hit);
    }
  }

  return [...bestByChunk.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function buildNoEvidenceAnswer(question: string) {
  return `没有在知识库中找到能直接回答“${question}”的证据。你可以换个问法，或者先导入更相关的资料。`;
}

export async function searchKnowledge(
  input: SearchKnowledgeRequest,
  options: {
    userId: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<SearchKnowledgeResult> {
  const parsedInput = SearchKnowledgeRequestSchema.parse(input);
  const collectionId = coerceCollectionId(parsedInput);

  if (collectionId) {
    await requireKnowledgeCollection(options.userId, collectionId);
  }

  const sources = filterSources(
    await listKnowledgeSources(options.userId, collectionId),
    parsedInput,
  );
  const limit = parsedInput.limit ?? DEFAULT_SEARCH_LIMIT;
  const knowledgeService = await getKnowledgeServiceForUser(options.userId);
  const perDocumentTopK = Math.min(Math.max(limit, 3), 5);

  const groups = await Promise.all(
    sources.map(async (source) => {
      if (!source.documentId) {
        return [] as SearchKnowledgeHit[];
      }

      try {
        const result = await knowledgeService.searchKnowledgeSegments({
          documentId: source.documentId,
          query: parsedInput.query,
          topK: perDocumentTopK,
        });

        return result.segments.map((segment) =>
          toSearchHit({
            query: parsedInput.query,
            source,
            segment,
          }),
        );
      } catch {
        return [] as SearchKnowledgeHit[];
      }
    }),
  );

  const hits = dedupeHits(groups.flat(), limit);

  return {
    query: parsedInput.query,
    rewrittenQueries: [parsedInput.query],
    queryVariants: [parsedInput.query],
    engine: "hybrid",
    total: hits.length,
    usedHitIds: [],
    hits,
  };
}

export function toCitation(hit: SearchKnowledgeHit): AskKnowledgeCitation {
  return {
    sourceId: hit.sourceId,
    documentId: hit.documentId,
    collectionId: hit.collectionId,
    spaceId: hit.spaceId,
    title: hit.title,
    sectionPath: hit.sectionPath,
    snippet: hit.snippet,
    sourceFilename: hit.sourceFilename,
    sourceUrl: hit.sourceUrl,
    downloadUrl: hit.downloadUrl,
    sourceType: hit.sourceType,
  };
}

export function annotateAnswerUsage(
  search: SearchKnowledgeResult,
  limit: number,
): SearchKnowledgeResult {
  const usedHitIds = new Set(
    search.hits.slice(0, limit).map((hit) => hit.chunkId),
  );

  return {
    ...search,
    usedHitIds: [...usedHitIds],
    hits: search.hits.map((hit) => ({
      ...hit,
      usedInAnswer: usedHitIds.has(hit.chunkId),
    })),
  };
}

export async function generateModelAnswerFromCitations(params: {
  question: string;
  citations: AskKnowledgeCitation[];
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}) {
  const apiKey = params.apiKey ?? getOpenAIApiKey();

  if (!apiKey || params.citations.length === 0) {
    return undefined;
  }

  const fetchImpl = params.fetchImpl ?? fetch;

  try {
    const response = await withOperationTimeout({
      error: new ModelInvocationTimeoutError("request"),
      promise: fetchImpl(getOpenAIUrl("chat/completions", params.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.model ?? getOpenAIModel(),
          temperature: 0,
          messages: buildAnswerMessages({
            question: params.question,
            citations: params.citations,
          }),
        }),
      }),
      timeoutMs: MODEL_REQUEST_TIMEOUT_MS,
    });

    if (!response.ok) {
      throw new Error(`Model answer request failed with ${response.status}`);
    }

    const payload = (await response.json()) as OpenAIChatCompletionResponse;
    return getMessageText(payload);
  } catch (error) {
    throwMappedModelProviderError(error, "知识库回答生成");
  }
}

export async function streamModelAnswerFromCitations(params: {
  question: string;
  citations: AskKnowledgeCitation[];
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  onTextDelta?: (delta: string) => Promise<void> | void;
}): Promise<{
  answer: string;
  finishReason: string;
}> {
  const apiKey = params.apiKey ?? getOpenAIApiKey();

  if (!apiKey || params.citations.length === 0) {
    return {
      answer: "",
      finishReason: "stop",
    };
  }

  const fetchImpl = params.fetchImpl ?? fetch;

  try {
    const response = await withOperationTimeout({
      error: new ModelInvocationTimeoutError("request"),
      promise: fetchImpl(getOpenAIUrl("chat/completions", params.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.model ?? getOpenAIModel(),
          temperature: 0,
          stream: true,
          messages: buildAnswerMessages({
            question: params.question,
            citations: params.citations,
          }),
        }),
      }),
      timeoutMs: MODEL_REQUEST_TIMEOUT_MS,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Model stream request failed with ${response.status}`);
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let answer = "";
    let finishReason = "stop";
    let firstTokenSeen = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let firstTokenTimer: ReturnType<typeof setTimeout> | undefined;

    const clearTimers = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (firstTokenTimer) clearTimeout(firstTokenTimer);
    };

    firstTokenTimer = setTimeout(() => {
      void reader.cancel(new ModelInvocationTimeoutError("first-token"));
    }, MODEL_FIRST_TOKEN_TIMEOUT_MS);

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        void reader.cancel(new ModelInvocationTimeoutError("stream-idle"));
      }, MODEL_STREAM_IDLE_TIMEOUT_MS);
    };

    resetIdleTimer();

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      resetIdleTimer();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const payloadText = trimmed.slice(5).trim();

        if (!payloadText || payloadText === "[DONE]") {
          continue;
        }

        const payload = JSON.parse(payloadText) as OpenAIChatCompletionChunk;
        const deltaText = getDeltaText(payload);

        if (deltaText) {
          firstTokenSeen = true;

          if (firstTokenTimer) {
            clearTimeout(firstTokenTimer);
            firstTokenTimer = undefined;
          }

          answer += deltaText;
          await params.onTextDelta?.(deltaText);
        }

        const nextFinishReason = payload.choices?.[0]?.finish_reason;

        if (typeof nextFinishReason === "string" && nextFinishReason) {
          finishReason = nextFinishReason;
        }
      }
    }

    clearTimers();

    return {
      answer: firstTokenSeen ? answer.trim() : "",
      finishReason,
    };
  } catch (error) {
    throwMappedModelProviderError(error, "知识库回答生成");
  }
}

export async function answerKnowledgeQuestion(
  input: AskKnowledgeRequest,
  options: {
    userId: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<AskKnowledgeResult> {
  const parsedInput = AskKnowledgeRequestSchema.parse(input);
  const limit = parsedInput.limit ?? DEFAULT_ASK_LIMIT;
  const search = annotateAnswerUsage(
    await searchKnowledge(
      {
        query: parsedInput.question,
        collectionId: parsedInput.collectionId,
        spaceId: parsedInput.spaceId,
        limit,
      },
      options,
    ),
    limit,
  );
  const citations = search.hits.slice(0, limit).map(toCitation);
  const modelAnswer = await generateModelAnswerFromCitations({
    question: parsedInput.question,
    citations,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    fetchImpl: options.fetchImpl,
  });

  return {
    question: parsedInput.question,
    answer: modelAnswer ?? buildNoEvidenceAnswer(parsedInput.question),
    mode: modelAnswer ? "model" : "mock",
    engine: search.engine,
    citations,
  };
}

export async function generateGroundedAnswer(params: {
  userId: string;
  query: string;
  collectionId?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
}): Promise<{
  answer: string;
  citations: AskKnowledgeCitation[];
  mode: AskKnowledgeResult["mode"];
  search: SearchKnowledgeResult;
}> {
  const limit = params.limit ?? DEFAULT_ASK_LIMIT;
  const search = annotateAnswerUsage(
    await searchKnowledge(
      {
        query: params.query,
        collectionId: params.collectionId,
        limit,
      },
      {
        userId: params.userId,
        fetchImpl: params.fetchImpl,
      },
    ),
    limit,
  );
  const citations = search.hits.slice(0, limit).map(toCitation);
  const answer =
    (await generateModelAnswerFromCitations({
      question: params.query,
      citations,
      fetchImpl: params.fetchImpl,
    })) ?? buildNoEvidenceAnswer(params.query);

  return {
    answer,
    citations,
    mode: citations.length > 0 ? "model" : "mock",
    search,
  };
}
