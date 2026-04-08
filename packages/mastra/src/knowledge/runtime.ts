import { QdrantVector } from "@mastra/qdrant";
import {
  LocalFilesystem,
  type WorkspaceFilesystem,
  Workspace,
} from "@mastra/core/workspace";
import { S3Filesystem } from "@mastra/s3";
import { UpstreamServiceError } from "@atlas-kb/errors";
import { createHash } from "node:crypto";
import {
  getEmbeddingApiKey,
  getEmbeddingDimensions,
  getEmbeddingModel,
  getEmbeddingUrl,
  getKnowledgeS3AccessKeyId,
  getKnowledgeS3Bucket,
  getKnowledgeS3Endpoint,
  getKnowledgeS3ForcePathStyle,
  getKnowledgeS3Region,
  getKnowledgeS3SecretAccessKey,
  getQdrantApiKey,
  getQdrantCollectionPrefix,
  getQdrantUrl,
  hasEmbeddingConfig,
  resetKnowledgeConfigCache,
  validateKnowledgeStorageConfig,
} from "./config";
import { buildKnowledgeSourceObjectPrefix } from "./object-storage";
import type { SearchEngine } from "@mastra/core/workspace/search";

type WorkspaceEntry = {
  indexName: string;
  vectorStore?: QdrantVector;
  workspace: Workspace<WorkspaceFilesystem>;
};

type KnowledgeFilesystemFactory = (args: {
  collectionId: string;
  userId: string;
}) => WorkspaceFilesystem;

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
let filesystemFactoryOverride: KnowledgeFilesystemFactory | undefined;

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
  // 本项目在删除资料和覆盖资料时，都是按单文档粒度清理索引。
  // 这里保证 documentId 能稳定映射成同一个向量点标识，方便精确删除。
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

class KnowledgeWorkspaceS3Filesystem extends S3Filesystem {
  private normalizeWorkspacePath(path: string): string {
    return path.trim() === "." ? "" : path;
  }

  override readdir(
    path: string,
    options?: Parameters<S3Filesystem["readdir"]>[1],
  ) {
    return super.readdir(this.normalizeWorkspacePath(path), options);
  }

  override stat(path: string) {
    return super.stat(this.normalizeWorkspacePath(path));
  }

  override exists(path: string) {
    return super.exists(this.normalizeWorkspacePath(path));
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

async function ensureVectorIndex(
  vectorStore: QdrantVector,
  indexName: string,
): Promise<number> {
  // workspace 初始化时只负责确保索引存在。这里必须是幂等的，不能在正常
  // 读写或聊天流量下重建、清空现有索引。
  const dimension = await resolveEmbeddingDimension();

  if (!dimension) {
    throw new Error("未能解析 embedding 维度");
  }

  const existingIndexes = await vectorStore
    .listIndexes()
    .catch((): string[] => []);

  if (!existingIndexes.includes(indexName)) {
    await vectorStore.createIndex({
      indexName,
      dimension,
      metric: "cosine",
    });
  }

  return dimension;
}

async function createWorkspaceEntry(
  userId: string,
  collectionId: string,
): Promise<WorkspaceEntry> {
  const indexName = getWorkspaceIndexName(userId, collectionId);
  const filesystem =
    filesystemFactoryOverride?.({
      userId,
      collectionId,
    }) ??
    createKnowledgeWorkspaceFilesystem({
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
    await ensureVectorIndex(vectorStore, indexName);
  }

  await workspace.init();

  return {
    indexName,
    vectorStore,
    workspace,
  };
}

function createKnowledgeWorkspaceFilesystem(args: {
  collectionId: string;
  userId: string;
}): WorkspaceFilesystem {
  validateKnowledgeStorageConfig();

  // Mastra 的 list_files 工具默认会以 "." 表示 workspace 根目录，但官方
  // S3Filesystem 不会把 "." 归一化为空路径，最终会把它拼进 S3 key，
  // 导致“列当前有哪些文件”在 S3 workspace 下返回空结果。
  // 这里保留官方 S3Filesystem 作为主体，只补一个最小兼容层来对齐根路径语义。
  return new KnowledgeWorkspaceS3Filesystem({
    id: `knowledge-s3:${args.userId}:${args.collectionId}`,
    bucket: getKnowledgeS3Bucket()!,
    region: getKnowledgeS3Region()!,
    accessKeyId: getKnowledgeS3AccessKeyId()!,
    secretAccessKey: getKnowledgeS3SecretAccessKey()!,
    endpoint: getKnowledgeS3Endpoint()!,
    forcePathStyle: getKnowledgeS3ForcePathStyle(),
    prefix: buildKnowledgeSourceObjectPrefix(args),
    displayName: "Atlas KB S3",
    description: "Atlas KB 知识库资料文件存储。",
  });
}

export async function getKnowledgeWorkspace(params: {
  collectionId: string;
  userId: string;
}): Promise<Workspace<WorkspaceFilesystem>> {
  // 上传、编辑、删除、搜索、对话都会通过这里拿到同一个资料库
  // 级别的 workspace。这里是业务链路绑定 Mastra 原生 workspace 的唯一入口。
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
  // 这里只清理进程内缓存的 workspace 实例，不能删除数据库记录、S3 对象
  // 或 Qdrant collection。
  const key = getCacheKey(params.userId, params.collectionId);
  const existing = workspaceCache.get(key);
  workspaceCache.delete(key);

  if (!existing) {
    return;
  }

  const entry = await existing.catch(() => undefined);

  if (!entry) {
    return;
  }

  try {
    await entry.workspace.destroy();
  } catch {
    return;
  }
}

export async function removeDocumentFromKnowledgeWorkspace(params: {
  collectionId: string;
  documentId: string;
  userId: string;
}): Promise<void> {
  // 资料删除和资料覆盖前，都要先移除该文档对应的旧索引记录，避免搜索结果
  // 继续命中已删除或已过期内容。
  //
  // 当前 Mastra 没有暴露稳定的公开单文档删除接口，所以这里把内部
  // _searchEngine.remove 封装在 runtime 层，业务层禁止直接访问内部字段。
  const workspace = await getKnowledgeWorkspace({
    userId: params.userId,
    collectionId: params.collectionId,
  });
  const searchEngine = (
    workspace as unknown as { _searchEngine?: SearchEngine }
  )._searchEngine;

  await searchEngine?.remove?.(params.documentId);
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

export function setKnowledgeFilesystemFactoryForTests(
  factory?: KnowledgeFilesystemFactory,
): void {
  filesystemFactoryOverride = factory;
}

export { LocalFilesystem };
