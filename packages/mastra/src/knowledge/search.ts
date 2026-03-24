import { UpstreamServiceError } from "@atlas-kb/errors";
import type {
  AskKnowledgeCitation,
  AskKnowledgeRequest,
  AskKnowledgeResult,
  KnowledgeRetrievalEngine,
  SearchKnowledgeHit,
  SearchKnowledgeRequest,
  SearchKnowledgeResult,
} from "@atlas-kb/schema";
import {
  AskKnowledgeRequestSchema,
  SearchKnowledgeRequestSchema,
} from "@atlas-kb/schema";
import {
  getJinaApiKey,
  getJinaUrl,
  getOpenAIApiKey,
  getOpenAIModel,
  getOpenAIUrl,
} from "./config";
import { getKnowledgeDatabase } from "./db";
import { searchKnowledgeVectors } from "./qdrant";
import {
  buildLexicalSearchQuery,
  buildSearchSnippet,
  normalizeSearchTokens,
} from "./search-utils";

const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_ASK_LIMIT = 5;

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

interface JinaRerankResponse {
  results?: Array<{
    index?: number;
    relevance_score?: number;
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

function coerceCollectionId(input: SearchKnowledgeRequest): string | undefined {
  return input.collectionId?.trim() || input.spaceId?.trim() || undefined;
}

function filterClause(input: SearchKnowledgeRequest): {
  clause: string;
  params: unknown[];
} {
  const clauses = ["s.status = 'ready'"];
  const params: unknown[] = [];
  const collectionId = coerceCollectionId(input);

  if (collectionId) {
    clauses.push("s.collection_id = ?");
    params.push(collectionId);
  }

  if (input.sourceTypes?.length) {
    clauses.push(
      `s.source_type IN (${input.sourceTypes.map(() => "?").join(", ")})`,
    );
    params.push(...input.sourceTypes);
  }

  if (!input.includeArchived) {
    clauses.push("s.status <> 'archived'");
  }

  if (input.tags?.length) {
    for (const tag of input.tags) {
      clauses.push("s.tags_json LIKE ?");
      params.push(`%${tag}%`);
    }
  }

  return {
    clause: clauses.join(" AND "),
    params,
  };
}

function lexicalSearchSingle(
  query: string,
  input: SearchKnowledgeRequest,
): SearchKnowledgeHit[] {
  const searchQuery = buildLexicalSearchQuery(query);

  if (!searchQuery) {
    return [];
  }

  const database = getKnowledgeDatabase();
  const filter = filterClause(input);
  const limit = Math.max(input.limit ?? DEFAULT_SEARCH_LIMIT, 12);
  const rows = database
    .query(
      `
        SELECT
          c.chunk_id,
          c.section_path,
          c.title AS chunk_title,
          c.text,
          s.id AS source_id,
          s.collection_id,
          s.title AS source_title,
          s.summary,
          s.source_filename,
          s.source_url,
          s.source_type,
          s.tags_json,
          bm25(source_chunks_fts, 3.5, 1.5) AS rank
        FROM source_chunks_fts
        JOIN source_chunks c ON c.id = source_chunks_fts.rowid
        JOIN sources s ON s.id = c.source_id
        WHERE source_chunks_fts MATCH ?
          AND ${filter.clause}
        ORDER BY rank ASC
        LIMIT ?
      `,
    )
    .all(searchQuery, ...filter.params, limit) as Array<{
    chunk_id: string;
    section_path: string | null;
    chunk_title: string;
    text: string;
    source_id: string;
    collection_id: string;
    source_title: string;
    summary: string;
    source_filename: string | null;
    source_url: string | null;
    source_type: SearchKnowledgeHit["sourceType"];
    tags_json: string;
    rank: number;
  }>;

  return rows.map((row) => {
    const score = row.rank <= 0 ? 1 : 1 / row.rank;
    return {
      sourceId: row.source_id,
      documentId: row.source_id,
      collectionId: row.collection_id,
      spaceId: row.collection_id,
      chunkId: row.chunk_id,
      title: row.source_title,
      summary: row.summary,
      snippet: buildSearchSnippet(
        row.text,
        input.query,
        row.text.slice(0, 220),
      ),
      sectionPath: row.section_path ?? undefined,
      sourceFilename: row.source_filename ?? undefined,
      sourceUrl: row.source_url ?? undefined,
      downloadUrl:
        row.source_type === "file" || row.source_type === "seed"
          ? `/api/kb/sources/${encodeURIComponent(row.source_id)}/download`
          : undefined,
      sourceType: row.source_type,
      tags: JSON.parse(row.tags_json) as string[],
      score,
      strategy: "lexical",
      usedInAnswer: false,
      recallPaths: ["关键词召回"],
    };
  });
}

function mergeRecallPaths(
  left: SearchKnowledgeHit["recallPaths"],
  right: SearchKnowledgeHit["recallPaths"],
): SearchKnowledgeHit["recallPaths"] {
  return Array.from(
    new Set([...left, ...right]),
  ) as SearchKnowledgeHit["recallPaths"];
}

function annotateRecallPaths(
  hits: SearchKnowledgeHit[],
  path: SearchKnowledgeHit["recallPaths"][number],
): SearchKnowledgeHit[] {
  return hits.map((hit) => ({
    ...hit,
    recallPaths: hit.recallPaths.includes(path)
      ? hit.recallPaths
      : ([...hit.recallPaths, path] as SearchKnowledgeHit["recallPaths"]),
  }));
}

function reciprocalRankFusion(
  groups: Array<{
    hits: SearchKnowledgeHit[];
    weight: number;
  }>,
  limit: number,
): SearchKnowledgeHit[] {
  const scores = new Map<string, SearchKnowledgeHit & { fusedScore: number }>();

  for (const group of groups) {
    group.hits.forEach((hit, index) => {
      const existing = scores.get(hit.chunkId);
      const contribution = group.weight * (1 / (index + 1 + 60));

      if (existing) {
        existing.fusedScore += contribution;
        existing.score = Math.max(existing.score, hit.score);
        existing.recallPaths = mergeRecallPaths(
          existing.recallPaths,
          hit.recallPaths,
        );
        if (existing.strategy !== "rerank") {
          existing.strategy = "fusion";
        }
        return;
      }

      scores.set(hit.chunkId, {
        ...hit,
        fusedScore: contribution,
        strategy: hit.strategy === "lexical" ? "fusion" : hit.strategy,
      });
    });
  }

  return [...scores.values()]
    .sort((left, right) => right.fusedScore - left.fusedScore)
    .slice(0, limit);
}

function localRerank(
  query: string,
  hits: SearchKnowledgeHit[],
  limit: number,
): SearchKnowledgeHit[] {
  const tokens = normalizeSearchTokens(query);

  return hits
    .map((hit) => {
      const haystack =
        `${hit.title}\n${hit.summary}\n${hit.snippet}`.toLowerCase();
      const overlap = tokens.reduce(
        (total, token) => total + (haystack.includes(token) ? 1 : 0),
        0,
      );

      return {
        ...hit,
        score: hit.score + overlap * 0.35,
        strategy: "rerank" as const,
        recallPaths: hit.recallPaths.includes("重排")
          ? hit.recallPaths
          : ([...hit.recallPaths, "重排"] as SearchKnowledgeHit["recallPaths"]),
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

async function rerankCandidates(
  query: string,
  hits: SearchKnowledgeHit[],
  limit: number,
): Promise<SearchKnowledgeHit[]> {
  const apiKey = getJinaApiKey();

  if (!apiKey || hits.length === 0) {
    return localRerank(query, hits, limit);
  }

  try {
    const response = await fetch(getJinaUrl("rerank"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "jina-reranker-m0",
        query,
        documents: hits.map((hit) => ({
          text: `${hit.title}\n${hit.sectionPath ? `${hit.sectionPath}\n` : ""}${hit.snippet}`,
        })),
        top_n: limit,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return localRerank(query, hits, limit);
    }

    const payload = (await response.json()) as JinaRerankResponse;
    const byIndex = new Map<number, number>();

    for (const item of payload.results ?? []) {
      if (
        typeof item.index === "number" &&
        typeof item.relevance_score === "number"
      ) {
        byIndex.set(item.index, item.relevance_score);
      }
    }

    return hits
      .map((hit, index) => ({
        ...hit,
        score: byIndex.get(index) ?? hit.score,
        strategy: "rerank" as const,
        recallPaths: hit.recallPaths.includes("重排")
          ? hit.recallPaths
          : ([...hit.recallPaths, "重排"] as SearchKnowledgeHit["recallPaths"]),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  } catch {
    return localRerank(query, hits, limit);
  }
}

async function rewriteSearchQueries(
  query: string,
  options: {
    apiKey?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    model?: string;
  } = {},
): Promise<string[]> {
  const normalized = query.trim();

  if (!normalized) {
    return [];
  }

  const heuristic = Array.from(
    new Set([normalized, normalizeSearchTokens(normalized).join(" ")]),
  ).filter(Boolean);

  const apiKey = options.apiKey ?? getOpenAIApiKey();

  if (!apiKey) {
    return heuristic;
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(
      getOpenAIUrl("chat/completions", options.baseUrl),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model ?? getOpenAIModel(),
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                'Rewrite the search query into at most 3 complementary retrieval queries. Return strict JSON: {"queries":["..."]}. Keep the original intent and expand synonyms where useful.',
            },
            {
              role: "user",
              content: normalized,
            },
          ],
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );

    if (!response.ok) {
      return heuristic;
    }

    const payload = (await response.json()) as OpenAIChatCompletionResponse;
    const message = getMessageText(payload);
    if (!message) {
      return heuristic;
    }

    const parsed = JSON.parse(message) as { queries?: unknown };
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    return Array.from(new Set([normalized, ...queries])).slice(0, 3);
  } catch {
    return heuristic;
  }
}

function toCitation(hit: SearchKnowledgeHit): AskKnowledgeCitation {
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

function buildMockAnswer(
  question: string,
  citations: AskKnowledgeCitation[],
): string {
  if (citations.length === 0) {
    return `没有在知识库中找到能直接回答“${question}”的证据。你可以换个问法，或者先导入更相关的资料。`;
  }

  const lead = citations
    .slice(0, 3)
    .map(
      (citation) =>
        `${citation.title}${citation.sectionPath ? ` / ${citation.sectionPath}` : ""}：${citation.snippet}`,
    )
    .join(" ");

  return `我找到了 ${citations.length} 条相关证据。${lead}`;
}

async function tryGenerateModelAnswer(params: {
  question: string;
  citations: AskKnowledgeCitation[];
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<string | undefined> {
  const apiKey = params.apiKey ?? getOpenAIApiKey();

  if (!apiKey || params.citations.length === 0) {
    return undefined;
  }

  const context = params.citations
    .map(
      (citation, index) =>
        `${index + 1}. ${citation.title}${citation.sectionPath ? ` / ${citation.sectionPath}` : ""}\n${citation.snippet}`,
    )
    .join("\n\n");
  const fetchImpl = params.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(
      getOpenAIUrl("chat/completions", params.baseUrl),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.model ?? getOpenAIModel(),
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are Atlas KB. Answer only from the supplied evidence. Be concise, say when evidence is insufficient, and mention supporting source titles naturally in the answer.",
            },
            {
              role: "user",
              content: `Question: ${params.question}\n\nEvidence:\n${context}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      throw new UpstreamServiceError(
        `Configured OpenAI provider rejected the ask request with status ${response.status}`,
      );
    }

    const payload = (await response.json()) as OpenAIChatCompletionResponse;
    const answer = getMessageText(payload);

    if (!answer) {
      throw new UpstreamServiceError(
        "Configured OpenAI provider returned an empty ask response",
      );
    }

    return answer;
  } catch (error) {
    if (error instanceof UpstreamServiceError) {
      throw error;
    }

    throw new UpstreamServiceError(
      "Configured OpenAI provider request failed",
      error,
    );
  }
}

export async function searchKnowledge(
  input: SearchKnowledgeRequest,
  options: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<SearchKnowledgeResult> {
  const parsedInput = SearchKnowledgeRequestSchema.parse(input);
  const collectionId = coerceCollectionId(parsedInput);
  const effectiveInput = {
    ...parsedInput,
    collectionId,
  };
  const limit = effectiveInput.limit ?? DEFAULT_SEARCH_LIMIT;
  const rewrittenQueries = await rewriteSearchQueries(
    parsedInput.query,
    options,
  );

  const lexicalGroups = rewrittenQueries.map((query) => ({
    hits:
      query === parsedInput.query
        ? lexicalSearchSingle(query, effectiveInput)
        : annotateRecallPaths(
            lexicalSearchSingle(query, effectiveInput),
            "查询改写",
          ),
    weight: query === parsedInput.query ? 1.15 : 1,
  }));
  const vectorGroups = await Promise.all(
    rewrittenQueries.map(async (query) => {
      const result = await searchKnowledgeVectors({
        ...effectiveInput,
        query,
      });

      return {
        hits:
          query === parsedInput.query
            ? (result?.hits ?? [])
            : annotateRecallPaths(result?.hits ?? [], "查询改写"),
        weight: query === parsedInput.query ? 1.2 : 1.05,
      };
    }),
  );
  const fused = reciprocalRankFusion(
    [...lexicalGroups, ...vectorGroups],
    Math.max(limit * 3, 18),
  );
  const hits = await rerankCandidates(parsedInput.query, fused, limit);
  const hasVectorHits = vectorGroups.some((group) => group.hits.length > 0);
  const hasLexicalHits = lexicalGroups.some((group) => group.hits.length > 0);
  const engine: KnowledgeRetrievalEngine =
    hasVectorHits && hasLexicalHits
      ? "hybrid"
      : hasVectorHits
        ? "vector"
        : "lexical";

  return {
    query: parsedInput.query,
    rewrittenQueries,
    queryVariants: rewrittenQueries,
    engine,
    total: hits.length,
    usedHitIds: [],
    hits,
  };
}

export async function answerKnowledgeQuestion(
  input: AskKnowledgeRequest,
  options: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<AskKnowledgeResult> {
  const parsedInput = AskKnowledgeRequestSchema.parse(input);
  const limit = parsedInput.limit ?? DEFAULT_ASK_LIMIT;
  const search = await searchKnowledge(
    {
      query: parsedInput.question,
      collectionId: parsedInput.collectionId,
      spaceId: parsedInput.spaceId,
      limit,
    },
    options,
  );
  const citations = search.hits.slice(0, limit).map(toCitation);
  const modelAnswer = await tryGenerateModelAnswer({
    question: parsedInput.question,
    citations,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    fetchImpl: options.fetchImpl,
  });

  return {
    question: parsedInput.question,
    answer: modelAnswer ?? buildMockAnswer(parsedInput.question, citations),
    mode: modelAnswer ? "model" : "mock",
    engine: search.engine,
    citations,
  };
}

export async function generateGroundedAnswer(params: {
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
  const search = await searchKnowledge(
    {
      query: params.query,
      collectionId: params.collectionId,
      limit: params.limit,
    },
    {
      fetchImpl: params.fetchImpl,
    },
  );
  const citations = search.hits
    .slice(0, params.limit ?? DEFAULT_ASK_LIMIT)
    .map(toCitation);
  const usedHitIds = new Set(
    search.hits
      .slice(0, params.limit ?? DEFAULT_ASK_LIMIT)
      .map((hit) => hit.chunkId),
  );
  const retrieval: SearchKnowledgeResult = {
    ...search,
    usedHitIds: [...usedHitIds],
    hits: search.hits.map((hit) => ({
      ...hit,
      usedInAnswer: usedHitIds.has(hit.chunkId),
    })),
  };
  const answer = await tryGenerateModelAnswer({
    question: params.query,
    citations,
    fetchImpl: params.fetchImpl,
  });

  return {
    answer: answer ?? buildMockAnswer(params.query, citations),
    citations,
    mode: answer ? "model" : "mock",
    search: retrieval,
  };
}
