import type {
  KnowledgeRetrievalEngine,
  SearchKnowledgeHit,
  SearchKnowledgeRequest,
  SearchKnowledgeResult,
} from "@atlas-kb/schema";
import { createHash } from "node:crypto";
import {
  getEmbeddingApiKey,
  getEmbeddingModel,
  getEmbeddingUrl,
  getQdrantApiKey,
  getQdrantCollectionName,
  getQdrantUrl,
} from "./config";
import { getKnowledgeDatabase } from "./db";
import { getDocumentById } from "./repository";
import { buildSearchSnippet, getKnowledgeSourceMetadata } from "./search-utils";

interface EmbeddingResponse {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
}

interface QdrantQueryResponse {
  result?: {
    points?: Array<{
      id?: string | number;
      payload?: Record<string, unknown>;
      score?: number;
    }>;
  };
}

interface KnowledgeChunkPayload {
  chunkId: string;
  sourceId: string;
  collectionId: string;
  chunkIndex: number;
  sectionPath?: string;
  title: string;
  text: string;
  tags: string[];
}

let collectionDimension: number | undefined;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

function createPointId(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

function getQdrantHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = getQdrantApiKey();

  if (apiKey) {
    headers["api-key"] = apiKey;
  }

  return headers;
}

function canUseVectorSearch(): boolean {
  return Boolean(getEmbeddingApiKey());
}

async function createEmbeddings(input: string[]): Promise<number[][]> {
  const apiKey = getEmbeddingApiKey();

  if (!apiKey || input.length === 0) {
    return [];
  }

  const response = await fetch(getEmbeddingUrl("embeddings"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input,
      model: getEmbeddingModel(),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with ${response.status}`);
  }

  const payload = (await response.json()) as EmbeddingResponse;
  const vectors = (payload.data ?? [])
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item) => item.embedding ?? []);

  if (vectors.some((vector) => vector.length === 0)) {
    throw new Error("Embedding response did not include vectors");
  }

  return vectors;
}

async function ensureCollection(dimension: number): Promise<void> {
  if (collectionDimension === dimension) {
    return;
  }

  const response = await fetch(
    `${getQdrantUrl()}/collections/${getQdrantCollectionName()}`,
    {
      method: "PUT",
      headers: getQdrantHeaders(),
      body: JSON.stringify({
        vectors: {
          distance: "Cosine",
          size: dimension,
        },
        on_disk_payload: true,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (response.status === 409 || response.ok) {
    collectionDimension = dimension;
    return;
  }

  throw new Error(`Qdrant collection setup failed with ${response.status}`);
}

async function deleteSourcePoints(sourceId: string): Promise<void> {
  const response = await fetch(
    `${getQdrantUrl()}/collections/${getQdrantCollectionName()}/points/delete?wait=true`,
    {
      method: "POST",
      headers: getQdrantHeaders(),
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: "sourceId",
              match: {
                value: sourceId,
              },
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Qdrant delete failed with ${response.status}`);
  }
}

function readSourceChunks(sourceId: string): KnowledgeChunkPayload[] {
  const database = getKnowledgeDatabase();
  const rows = database
    .query(
      `
        SELECT
          chunk_id,
          source_id,
          collection_id,
          chunk_index,
          section_path,
          title,
          text,
          tags_json
        FROM source_chunks
        WHERE source_id = ?
        ORDER BY chunk_index ASC
      `,
    )
    .all(sourceId) as Array<{
    chunk_id: string;
    source_id: string;
    collection_id: string;
    chunk_index: number;
    section_path: string | null;
    title: string;
    text: string;
    tags_json: string;
  }>;

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    collectionId: row.collection_id,
    chunkIndex: row.chunk_index,
    sectionPath: row.section_path ?? undefined,
    title: row.title,
    text: row.text,
    tags: JSON.parse(row.tags_json) as string[],
  }));
}

export async function replaceKnowledgeSourceVectorIndex(
  sourceId: string,
): Promise<boolean> {
  if (!canUseVectorSearch()) {
    return false;
  }

  const chunks = readSourceChunks(sourceId);
  if (chunks.length === 0) {
    return false;
  }

  const vectors = await createEmbeddings(chunks.map((chunk) => chunk.text));
  const firstVector = vectors[0];

  if (!firstVector || firstVector.length === 0) {
    return false;
  }

  await ensureCollection(firstVector.length);
  await deleteSourcePoints(sourceId);

  const response = await fetch(
    `${getQdrantUrl()}/collections/${getQdrantCollectionName()}/points?wait=true`,
    {
      method: "PUT",
      headers: getQdrantHeaders(),
      body: JSON.stringify({
        points: chunks.map((chunk, index) => ({
          id: createPointId(chunk.chunkId),
          payload: chunk,
          vector: vectors[index],
        })),
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Qdrant upsert failed with ${response.status}`);
  }

  return true;
}

function toVectorResult(
  query: string,
  hits: SearchKnowledgeHit[],
): SearchKnowledgeResult {
  return {
    query,
    rewrittenQueries: [query],
    queryVariants: [query],
    engine: "vector",
    total: hits.length,
    usedHitIds: [],
    hits,
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

export async function searchKnowledgeVectors(
  input: SearchKnowledgeRequest,
): Promise<SearchKnowledgeResult | undefined> {
  if (!canUseVectorSearch()) {
    return undefined;
  }

  try {
    const [queryVector] = await createEmbeddings([input.query]);
    if (!queryVector || queryVector.length === 0) {
      return undefined;
    }

    const response = await fetch(
      `${getQdrantUrl()}/collections/${getQdrantCollectionName()}/points/query`,
      {
        method: "POST",
        headers: getQdrantHeaders(),
        body: JSON.stringify({
          query: queryVector,
          limit: Math.max(input.limit ?? 5, 12),
          with_payload: true,
          with_vector: false,
          filter: input.collectionId
            ? {
                must: [
                  {
                    key: "collectionId",
                    match: {
                      value: input.collectionId,
                    },
                  },
                ],
              }
            : undefined,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as QdrantQueryResponse;
    const hits = await Promise.all(
      (payload.result?.points ?? [])
        .map(async (point) => {
          const chunk = point.payload as KnowledgeChunkPayload | undefined;
          if (!chunk || !point.score) {
            return undefined;
          }

          const source = await getDocumentById(chunk.sourceId);
          if (!source || source.status !== "ready") {
            return undefined;
          }

          return {
            sourceId: source.id,
            documentId: source.id,
            collectionId: source.collectionId,
            spaceId: source.collectionId,
            chunkId: chunk.chunkId,
            title: source.title,
            summary: source.summary,
            snippet: buildSearchSnippet(
              chunk.text,
              input.query,
              source.contentPreview,
            ),
            sectionPath: chunk.sectionPath,
            sourceFilename: source.sourceFilename,
            sourceUrl: source.sourceUrl,
            ...getKnowledgeSourceMetadata(source),
            sourceType: source.sourceType,
            tags: [...source.tags],
            score: Number(point.score),
            strategy: "vector" as const,
            usedInAnswer: false,
            recallPaths: ["语义召回"],
          } satisfies SearchKnowledgeHit;
        })
        .filter(Boolean),
    );

    const validHits = dedupeHits(
      hits.filter((hit): hit is SearchKnowledgeHit => Boolean(hit)),
      input.limit ?? 5,
    );

    if (validHits.length === 0) {
      return undefined;
    }

    return toVectorResult(input.query, validHits);
  } catch (error) {
    console.warn(
      `[atlas-kb/mastra] vector search disabled: ${getErrorMessage(error)}`,
    );
    return undefined;
  }
}

export async function detectPreferredRetrievalEngine(): Promise<KnowledgeRetrievalEngine> {
  return canUseVectorSearch() ? "hybrid" : "lexical";
}

export function resetKnowledgeVectorState(): void {
  collectionDimension = undefined;
}
