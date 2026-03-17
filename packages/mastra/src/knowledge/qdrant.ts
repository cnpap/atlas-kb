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
import {
  getDocumentsPendingVectorIndex,
  listStoredKnowledgeDocuments,
  markDocumentVectorIndexed,
  type StoredKnowledgeDocument,
} from "./repository";

const CHUNK_OVERLAP = 160;
const CHUNK_SIZE = 900;

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
  documentId: string;
  order: number;
  spaceId: string;
  summary: string;
  tags: string[];
  text: string;
  title: string;
}

let collectionDimension: number | undefined;
let syncPromise: Promise<boolean> | undefined;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

function normalizeTokens(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildSnippet(
  content: string,
  query: string,
  fallback: string,
): string {
  const tokens = normalizeTokens(query);
  const normalizedContent = content.toLowerCase();

  for (const token of tokens) {
    const index = normalizedContent.indexOf(token);
    if (index < 0) {
      continue;
    }

    const start = Math.max(0, index - 72);
    const end = Math.min(content.length, index + token.length + 148);
    return content.slice(start, end).trim();
  }

  return fallback;
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function chunkContent(content: string): string[] {
  const normalized = normalizeWhitespace(content);

  if (normalized.length <= CHUNK_SIZE) {
    return [normalized];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + CHUNK_SIZE);

    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(" ", end);
      if (boundary > start + CHUNK_SIZE / 2) {
        end = boundary;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}

function createPointId(input: string): string {
  const hash = createHash("sha256").update(input).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  const byte6 = bytes[6];
  const byte8 = bytes[8];

  if (byte6 === undefined || byte8 === undefined) {
    throw new Error("Failed to generate a stable point id");
  }

  bytes[6] = (byte6 & 0x0f) | 0x40;
  bytes[8] = (byte8 & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
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

  if (response.status === 409) {
    collectionDimension = dimension;
    return;
  }

  if (!response.ok) {
    throw new Error(`Qdrant collection setup failed with ${response.status}`);
  }

  collectionDimension = dimension;
}

async function upsertChunks(params: {
  chunks: string[];
  document: StoredKnowledgeDocument;
  vectors: number[][];
}): Promise<void> {
  const points = params.chunks.map((chunk, index) => ({
    id: createPointId(`${params.document.id}:${index}`),
    payload: {
      documentId: params.document.id,
      order: index,
      spaceId: params.document.spaceId,
      summary: params.document.summary,
      tags: params.document.tags,
      text: chunk,
      title: params.document.title,
    } satisfies KnowledgeChunkPayload,
    vector: params.vectors[index],
  }));

  const response = await fetch(
    `${getQdrantUrl()}/collections/${getQdrantCollectionName()}/points?wait=true`,
    {
      method: "PUT",
      headers: getQdrantHeaders(),
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Qdrant upsert failed with ${response.status}`);
  }
}

function toSearchHit(params: {
  payload: KnowledgeChunkPayload;
  query: string;
  score: number;
}): SearchKnowledgeHit {
  return {
    documentId: params.payload.documentId,
    spaceId: params.payload.spaceId,
    title: params.payload.title,
    summary: params.payload.summary,
    snippet: buildSnippet(
      params.payload.text,
      params.query,
      params.payload.text.slice(0, 220),
    ),
    tags: [...params.payload.tags],
    score: params.score,
  };
}

function dedupeHits(
  hits: SearchKnowledgeHit[],
  limit: number,
): SearchKnowledgeHit[] {
  const byDocument = new Map<string, SearchKnowledgeHit>();

  for (const hit of hits) {
    const existing = byDocument.get(hit.documentId);
    if (!existing || existing.score < hit.score) {
      byDocument.set(hit.documentId, hit);
    }
  }

  return [...byDocument.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function vectorResult(
  query: string,
  hits: SearchKnowledgeHit[],
): SearchKnowledgeResult {
  return {
    query,
    engine: "vector",
    total: hits.length,
    hits,
  };
}

export async function indexKnowledgeDocument(
  document: StoredKnowledgeDocument,
): Promise<boolean> {
  if (!canUseVectorSearch()) {
    return false;
  }

  const chunks = chunkContent(document.content);
  if (chunks.length === 0) {
    return false;
  }

  const vectors = await createEmbeddings(chunks);
  const firstVector = vectors[0];

  if (!firstVector || firstVector.length === 0) {
    return false;
  }

  await ensureCollection(firstVector.length);
  await upsertChunks({
    chunks,
    document,
    vectors,
  });
  await markDocumentVectorIndexed({
    chunkCount: chunks.length,
    documentId: document.id,
  });

  return true;
}

export async function syncKnowledgeVectorIndex(): Promise<boolean> {
  if (!canUseVectorSearch()) {
    return false;
  }

  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = (async () => {
    try {
      const pendingDocuments = await getDocumentsPendingVectorIndex();

      for (const document of pendingDocuments) {
        await indexKnowledgeDocument(document);
      }

      return true;
    } catch (error) {
      console.warn(
        `[atlas-kb/mastra] vector indexing disabled: ${getErrorMessage(error)}`,
      );
      return false;
    }
  })();

  try {
    return await syncPromise;
  } finally {
    syncPromise = undefined;
  }
}

export async function searchKnowledgeVectors(
  input: SearchKnowledgeRequest,
): Promise<SearchKnowledgeResult | undefined> {
  if (!canUseVectorSearch()) {
    return undefined;
  }

  const vectorSyncReady = await syncKnowledgeVectorIndex();
  if (!vectorSyncReady) {
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
          limit: Math.max(input.limit ?? 5, 10),
          with_payload: true,
          with_vector: false,
          filter: input.spaceId
            ? {
                must: [
                  {
                    key: "spaceId",
                    match: {
                      value: input.spaceId,
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
    const hits = dedupeHits(
      (payload.result?.points ?? [])
        .map((point) => {
          const chunkPayload = point.payload as
            | KnowledgeChunkPayload
            | undefined;
          const score = point.score ?? 0;

          if (!chunkPayload || score <= 0) {
            return undefined;
          }

          return toSearchHit({
            payload: chunkPayload,
            query: input.query,
            score,
          });
        })
        .filter((hit): hit is SearchKnowledgeHit => Boolean(hit)),
      input.limit ?? 5,
    );

    if (hits.length === 0) {
      return undefined;
    }

    return vectorResult(input.query, hits);
  } catch (error) {
    console.error("[atlas-kb/mastra] vector search failed", error);
    return undefined;
  }
}

export async function detectPreferredRetrievalEngine(): Promise<KnowledgeRetrievalEngine> {
  const documents = await listStoredKnowledgeDocuments();

  return documents.some((document) => document.vectorIndexedAt)
    ? "vector"
    : "lexical";
}

export function resetKnowledgeVectorState(): void {
  collectionDimension = undefined;
  syncPromise = undefined;
}
