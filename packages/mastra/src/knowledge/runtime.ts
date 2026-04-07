import { QdrantVector } from "@mastra/qdrant";
import { Workspace } from "@mastra/core/workspace";
import { UpstreamServiceError } from "@atlas-kb/errors";
import { createHash } from "node:crypto";
import {
  getEmbeddingApiKey,
  getEmbeddingDimensions,
  getEmbeddingModel,
  getEmbeddingUrl,
  getQdrantApiKey,
  getQdrantCollectionPrefix,
  getQdrantUrl,
  hasEmbeddingConfig,
  resetKnowledgeConfigCache,
} from "./config";
import { S3Filesystem } from "./s3-filesystem";

type WorkspaceEntry = {
  indexName: string;
  vectorStore?: QdrantVector;
  workspace: Workspace<S3Filesystem>;
};

interface EmbeddingResponse {
  data?: Array<{
    embedding?: number[];
  }>;
}

function summarizeProviderError(payload: string): string | undefined {
  const normalized = payload.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 280);
}

const workspaceCache = new Map<string, Promise<WorkspaceEntry>>();
let embeddingDimensionPromise: Promise<number | undefined> | undefined;

function getCacheKey(userId: string, collectionId: string): string {
  return `${userId}:${collectionId}`;
}

function sanitizeSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_]+/g, "_");
  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `_${sanitized || "item"}`;
}

function getWorkspaceIndexName(userId: string, collectionId: string): string {
  return [
    getQdrantCollectionPrefix(),
    sanitizeSegment(userId),
    sanitizeSegment(collectionId),
  ].join("_");
}

function formatUuidFromHex(hex: string): string {
  const normalized = hex.slice(0, 32).padEnd(32, "0").split("");
  normalized[12] = "4";
  normalized[16] = (
    (Number.parseInt(normalized[16] || "0", 16) & 0x3) |
    0x8
  ).toString(16);
  const value = normalized.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

export function toVectorPointId(documentId: string): string {
  return formatUuidFromHex(
    createHash("sha256").update(documentId).digest("hex"),
  );
}

class WorkspaceQdrantVector extends QdrantVector {
  override async upsert(args: Parameters<QdrantVector["upsert"]>[0]) {
    const mappedIds = args.ids?.map((id) => toVectorPointId(String(id)));

    return super.upsert({
      ...args,
      ids: mappedIds,
    });
  }
}

async function fetchEmbeddingVector(text: string): Promise<number[]> {
  const apiKey = getEmbeddingApiKey();

  if (!apiKey) {
    throw new Error("缺少 EMBEDDING_API_KEY，无法创建向量索引");
  }

  const response = await fetch(getEmbeddingUrl("embeddings"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: [text],
      model: getEmbeddingModel(),
    }),
  });

  if (!response.ok) {
    const details = summarizeProviderError(await response.text());

    console.error("[runtime] embedding request failed", {
      status: response.status,
      details,
      model: getEmbeddingModel(),
    });

    throw new UpstreamServiceError(
      "向量索引创建失败，请检查嵌入模型配置后重试。",
    );
  }

  const payload = (await response.json()) as EmbeddingResponse;
  const vector = payload.data?.[0]?.embedding;

  if (!Array.isArray(vector) || vector.length === 0) {
    console.error("[runtime] embedding provider returned an empty vector", {
      model: getEmbeddingModel(),
    });
    throw new UpstreamServiceError(
      "向量索引创建失败，请检查嵌入模型配置后重试。",
    );
  }

  return vector;
}

async function resolveEmbeddingDimension(): Promise<number | undefined> {
  const configured = getEmbeddingDimensions();

  if (configured) {
    return configured;
  }

  if (!hasEmbeddingConfig()) {
    return undefined;
  }

  if (!embeddingDimensionPromise) {
    embeddingDimensionPromise = fetchEmbeddingVector("atlas kb workspace")
      .then((vector) => vector.length)
      .catch((error) => {
        embeddingDimensionPromise = undefined;
        throw error;
      });
  }

  return embeddingDimensionPromise;
}

function createVectorStore(): QdrantVector | undefined {
  if (!hasEmbeddingConfig()) {
    return undefined;
  }

  return new WorkspaceQdrantVector({
    id: "workspace-qdrant",
    url: getQdrantUrl(),
    apiKey: getQdrantApiKey(),
    checkCompatibility: false,
  });
}

async function deleteVectorIndex(indexName: string): Promise<void> {
  const vectorStore = createVectorStore();

  if (!vectorStore) {
    return;
  }

  try {
    await vectorStore.deleteIndex({ indexName });
  } catch {
    return;
  }
}

async function prepareVectorIndex(
  vectorStore: QdrantVector,
  indexName: string,
): Promise<number> {
  const dimension = await resolveEmbeddingDimension();

  if (!dimension) {
    throw new Error("未能解析 embedding 维度");
  }

  await deleteVectorIndex(indexName);
  await vectorStore.createIndex({
    indexName,
    dimension,
    metric: "cosine",
  });

  return dimension;
}

async function createWorkspaceEntry(
  userId: string,
  collectionId: string,
): Promise<WorkspaceEntry> {
  const indexName = getWorkspaceIndexName(userId, collectionId);
  const filesystem = new S3Filesystem({
    userId,
    collectionId,
  });

  const vectorStore = createVectorStore();
  const workspace = new Workspace({
    id: `workspace:${userId}:${collectionId}`,
    name: `${collectionId} Workspace`,
    filesystem,
    bm25: true,
    ...(vectorStore
      ? {
          vectorStore,
          embedder: fetchEmbeddingVector,
          searchIndexName: indexName,
        }
      : {}),
  });

  if (vectorStore) {
    await prepareVectorIndex(vectorStore, indexName);
  }

  await workspace.init();

  return {
    indexName,
    vectorStore,
    workspace,
  };
}

export async function getKnowledgeWorkspace(params: {
  collectionId: string;
  userId: string;
}): Promise<Workspace<S3Filesystem>> {
  const key = getCacheKey(params.userId, params.collectionId);
  const cached = workspaceCache.get(key);

  if (cached) {
    return (await cached).workspace;
  }

  const pendingEntry = createWorkspaceEntry(
    params.userId,
    params.collectionId,
  ).catch((error) => {
    workspaceCache.delete(key);
    throw error;
  });

  workspaceCache.set(key, pendingEntry);
  return (await pendingEntry).workspace;
}

export async function invalidateKnowledgeWorkspace(params: {
  collectionId: string;
  userId: string;
}): Promise<void> {
  const key = getCacheKey(params.userId, params.collectionId);
  const existing = workspaceCache.get(key);
  workspaceCache.delete(key);

  if (!existing) {
    await deleteVectorIndex(
      getWorkspaceIndexName(params.userId, params.collectionId),
    );
    return;
  }

  const entry = await existing.catch(() => undefined);

  if (!entry) {
    await deleteVectorIndex(
      getWorkspaceIndexName(params.userId, params.collectionId),
    );
    return;
  }

  try {
    await entry.workspace.destroy();
  } catch {
    return;
  } finally {
    await deleteVectorIndex(entry.indexName);
  }
}

export function resetKnowledgeRuntimeCache(): void {
  for (const pendingEntry of workspaceCache.values()) {
    void pendingEntry
      .then((entry) => entry.workspace.destroy())
      .catch(() => undefined);
  }

  embeddingDimensionPromise = undefined;
  workspaceCache.clear();
  resetKnowledgeConfigCache();
}
