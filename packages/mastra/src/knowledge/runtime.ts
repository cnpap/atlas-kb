import { UpstreamServiceError } from "@atlas-kb/errors";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  type BucketLocationConstraint,
} from "@aws-sdk/client-s3";
import {
  LocalFilesystem,
  Workspace,
  type WorkspaceFilesystem,
} from "@mastra/core/workspace";
import { QdrantVector } from "@mastra/qdrant";
import { S3Filesystem } from "@mastra/s3";
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
  resetKnowledgeConfigCache,
  validateKnowledgeStorageConfig,
} from "./config";
import {
  acquireEmbeddingThrottleLease,
  releaseEmbeddingThrottleLease,
} from "./embedding-throttle";
import { wrapKnowledgeFilesystemForReading } from "./content-proxy";
import { buildKnowledgeSourceObjectPrefix } from "./object-storage";
import { synchronizeKnowledgeSourcePaths } from "./source-path-sync";

type WorkspaceEntry = {
  indexName: string;
  vectorStore: QdrantVector;
  workspace: Workspace<WorkspaceFilesystem>;
};

type KnowledgeFilesystemFactory = (args: {
  collectionId: string;
  userId: string;
}) => WorkspaceFilesystem;

type KnowledgeStoragePrefixFilesystemFactory = (args: {
  storagePrefix: string;
  userId: string;
}) => WorkspaceFilesystem;

interface EmbeddingResponse {
  data?: Array<{
    embedding?: number[];
  }>;
}

const DEFAULT_EMBEDDING_MAX_RETRIES = 4;
const DEFAULT_EMBEDDING_RETRY_BASE_MS = 500;
const RETRIABLE_EMBEDDING_STATUSES = new Set([408, 409, 425, 429]);

function summarizeProviderError(payload: string): string | undefined {
  const normalized = payload.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 280);
}

const workspaceCache = new Map<string, Promise<WorkspaceEntry>>();
const embeddingDimensionPromises = new Map<string, Promise<number>>();
let filesystemFactoryOverride: KnowledgeFilesystemFactory | undefined;
let storagePrefixFilesystemFactoryOverride:
  | KnowledgeStoragePrefixFilesystemFactory
  | undefined;

class EmbeddingRequestError extends UpstreamServiceError {
  readonly details?: string;
  readonly retriable: boolean;
  readonly status?: number;

  constructor(args: {
    cause?: unknown;
    details?: string;
    retriable: boolean;
    status?: number;
  }) {
    super("向量索引创建失败，请检查嵌入模型配置后重试。", args.cause);
    this.details = args.details;
    this.retriable = args.retriable;
    this.status = args.status;
  }
}

function getCacheKey(userId: string, collectionId: string): string {
  return `${userId}:${collectionId}`;
}

function sanitizeSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_]+/g, "_");
  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `_${sanitized || "item"}`;
}

function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getEmbeddingMaxRetries(): number {
  return parsePositiveIntegerEnv(
    process.env.EMBEDDING_RETRY_MAX_ATTEMPTS,
    parsePositiveIntegerEnv(
      process.env.EMBEDDING_MAX_RETRIES,
      DEFAULT_EMBEDDING_MAX_RETRIES,
    ),
  );
}

function getEmbeddingRetryBaseDelayMs(): number {
  return parsePositiveIntegerEnv(
    process.env.EMBEDDING_RETRY_BASE_MS,
    DEFAULT_EMBEDDING_RETRY_BASE_MS,
  );
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function isRetriableEmbeddingFailure(args: {
  details?: string;
  error?: unknown;
  status?: number;
}): boolean {
  if (
    typeof args.status === "number" &&
    (RETRIABLE_EMBEDDING_STATUSES.has(args.status) || args.status >= 500)
  ) {
    return true;
  }

  const normalizedDetails = args.details?.toLowerCase();

  if (
    normalizedDetails &&
    (normalizedDetails.includes("limit_requests") ||
      normalizedDetails.includes("rate limit") ||
      normalizedDetails.includes("too many requests") ||
      normalizedDetails.includes("temporarily unavailable") ||
      normalizedDetails.includes("timeout"))
  ) {
    return true;
  }

  return args.error instanceof TypeError;
}

function getEmbeddingRetryDelayMs(attempt: number): number {
  const baseDelayMs = getEmbeddingRetryBaseDelayMs();
  const jitterMs = Math.floor(Math.random() * 100);
  return baseDelayMs * 2 ** attempt + jitterMs;
}

function getWorkspaceIndexName(userId: string, collectionId: string): string {
  return [
    getQdrantCollectionPrefix(),
    sanitizeSegment(userId),
    sanitizeSegment(collectionId),
  ].join("_");
}

class KnowledgeWorkspaceS3Filesystem extends S3Filesystem {
  private readonly workspaceBucket: string;
  private readonly workspaceRegion: string;

  constructor(options: ConstructorParameters<typeof S3Filesystem>[0]) {
    super(options);
    this.workspaceBucket = options.bucket;
    this.workspaceRegion = options.region;
  }

  private normalizeWorkspacePath(path: string): string {
    return path.trim() === "." ? "" : path;
  }

  override async init(): Promise<void> {
    const client = this.client;

    try {
      await client.send(
        new HeadBucketCommand({
          Bucket: this.workspaceBucket,
        }),
      );
    } catch (error) {
      const statusCode =
        error &&
        typeof error === "object" &&
        "$metadata" in error &&
        error.$metadata &&
        typeof error.$metadata === "object" &&
        "httpStatusCode" in error.$metadata
          ? Number(error.$metadata.httpStatusCode)
          : undefined;

      if (statusCode === 404) {
        await client.send(
          new CreateBucketCommand({
            Bucket: this.workspaceBucket,
            ...(this.workspaceRegion === "us-east-1"
              ? {}
              : {
                  CreateBucketConfiguration: {
                    LocationConstraint: this
                      .workspaceRegion as BucketLocationConstraint,
                  },
                }),
          }),
        );

        await client.send(
          new HeadBucketCommand({
            Bucket: this.workspaceBucket,
          }),
        );
        return;
      }

      throw error;
    }
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

function createMountedS3Filesystem(args: {
  description: string;
  displayName: string;
  filesystemId: string;
  prefix: string;
  readOnly?: boolean;
}): WorkspaceFilesystem {
  validateKnowledgeStorageConfig();

  return new KnowledgeWorkspaceS3Filesystem({
    id: args.filesystemId,
    bucket: getKnowledgeS3Bucket()!,
    region: getKnowledgeS3Region()!,
    accessKeyId: getKnowledgeS3AccessKeyId()!,
    secretAccessKey: getKnowledgeS3SecretAccessKey()!,
    endpoint: getKnowledgeS3Endpoint()!,
    forcePathStyle: getKnowledgeS3ForcePathStyle(),
    prefix: args.prefix,
    displayName: args.displayName,
    description: args.description,
    readOnly: args.readOnly,
  });
}

async function requestEmbeddingVector(text: string): Promise<number[]> {
  const apiKey = getEmbeddingApiKey();

  if (!apiKey) {
    throw new Error("缺少 EMBEDDING_API_KEY，无法创建向量索引");
  }

  let response: Response;

  try {
    response = await fetch(getEmbeddingUrl("embeddings"), {
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
  } catch (error) {
    throw new EmbeddingRequestError({
      cause: error,
      details: error instanceof Error ? error.message : undefined,
      retriable: isRetriableEmbeddingFailure({ error }),
    });
  }

  if (!response.ok) {
    const details = summarizeProviderError(await response.text());
    const retriable = isRetriableEmbeddingFailure({
      status: response.status,
      details,
    });

    console.error("[runtime] embedding request failed", {
      status: response.status,
      details,
      model: getEmbeddingModel(),
    });

    throw new EmbeddingRequestError({
      details,
      retriable,
      status: response.status,
    });
  }

  const payload = (await response.json()) as EmbeddingResponse;
  const vector = payload.data?.[0]?.embedding;

  if (!Array.isArray(vector) || vector.length === 0) {
    console.error("[runtime] embedding provider returned an empty vector", {
      model: getEmbeddingModel(),
    });
    throw new EmbeddingRequestError({
      details: "empty embedding vector",
      retriable: false,
    });
  }

  return vector;
}

export async function fetchKnowledgeEmbeddingVector(
  text: string,
  options: {
    userId?: string;
  } = {},
): Promise<number[]> {
  let attempt = 0;

  while (true) {
    let retryDelayMs: number | undefined;
    const throttleLease = await acquireEmbeddingThrottleLease(options.userId);

    try {
      return await requestEmbeddingVector(text);
    } catch (error) {
      if (
        !(error instanceof EmbeddingRequestError) ||
        !error.retriable ||
        attempt >= getEmbeddingMaxRetries()
      ) {
        throw error;
      }

      retryDelayMs = getEmbeddingRetryDelayMs(attempt);

      console.warn("[runtime] embedding request retrying", {
        attempt: attempt + 1,
        delayMs: retryDelayMs,
        status: error.status,
        details: error.details,
        model: getEmbeddingModel(),
      });
    } finally {
      await releaseEmbeddingThrottleLease(throttleLease).catch(() => undefined);
    }

    if (retryDelayMs === undefined) {
      throw new UpstreamServiceError(
        "向量索引创建失败，请检查嵌入模型配置后重试。",
      );
    }

    await sleep(retryDelayMs);
    attempt += 1;
  }
}

async function resolveEmbeddingDimension(userId: string): Promise<number> {
  const configured = getEmbeddingDimensions();

  if (configured) {
    return configured;
  }

  if (!embeddingDimensionPromises.has(userId)) {
    embeddingDimensionPromises.set(
      userId,
      fetchKnowledgeEmbeddingVector("atlas kb workspace", {
        userId,
      })
        .then((vector) => vector.length)
        .catch((error) => {
          embeddingDimensionPromises.delete(userId);
          throw error;
        }),
    );
  }

  return embeddingDimensionPromises.get(userId)!;
}

function createVectorStore(): QdrantVector {
  return new QdrantVector({
    id: "workspace-qdrant",
    url: getQdrantUrl(),
    apiKey: getQdrantApiKey(),
    checkCompatibility: false,
  });
}

async function ensureVectorIndex(
  vectorStore: QdrantVector,
  indexName: string,
  userId: string,
): Promise<number> {
  const dimension = await resolveEmbeddingDimension(userId);

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

export function createKnowledgeCollectionFilesystem(args: {
  collectionId: string;
  userId: string;
  readOnly?: boolean;
}): WorkspaceFilesystem {
  const rawFilesystem =
    filesystemFactoryOverride?.({
      userId: args.userId,
      collectionId: args.collectionId,
    }) ??
    createMountedS3Filesystem({
      filesystemId: `knowledge-s3:${args.userId}:${args.collectionId}`,
      prefix: buildKnowledgeSourceObjectPrefix(args),
      displayName: "知识库 S3",
      description: "知识库 知识库资料文件存储。",
      readOnly: args.readOnly,
    });

  return wrapKnowledgeFilesystemForReading(rawFilesystem);
}

export function createKnowledgeStoragePrefixFilesystem(args: {
  storagePrefix: string;
  userId: string;
  readOnly?: boolean;
}): WorkspaceFilesystem {
  const rawFilesystem =
    storagePrefixFilesystemFactoryOverride?.({
      userId: args.userId,
      storagePrefix: args.storagePrefix,
    }) ??
    createMountedS3Filesystem({
      filesystemId: `knowledge-s3:${args.userId}:prefix:${sanitizeSegment(
        args.storagePrefix,
      )}`,
      prefix: args.storagePrefix,
      displayName: "知识库 Reference Library",
      description: "知识库 模板资料库文件存储。",
      readOnly: args.readOnly,
    });

  return wrapKnowledgeFilesystemForReading(rawFilesystem);
}

export async function createKnowledgeSearchWorkspaceConfig(args: {
  indexName: string;
  userId: string;
}): Promise<{
  bm25: true;
  embedder: (text: string) => Promise<number[]>;
  searchIndexName: string;
  vectorStore: QdrantVector;
}> {
  const vectorStore = createVectorStore();

  await ensureVectorIndex(vectorStore, args.indexName, args.userId);

  return {
    bm25: true,
    vectorStore,
    embedder: (text: string) =>
      fetchKnowledgeEmbeddingVector(text, {
        userId: args.userId,
      }),
    searchIndexName: args.indexName,
  };
}

export async function deleteKnowledgeSearchIndex(indexName: string) {
  await createVectorStore()
    .deleteIndex({
      indexName,
    })
    .catch(() => undefined);
}

async function createWorkspaceEntry(
  userId: string,
  collectionId: string,
): Promise<WorkspaceEntry> {
  const indexName = getWorkspaceIndexName(userId, collectionId);
  const rawFilesystem =
    filesystemFactoryOverride?.({
      userId,
      collectionId,
    }) ??
    createMountedS3Filesystem({
      filesystemId: `knowledge-s3:${userId}:${collectionId}`,
      prefix: buildKnowledgeSourceObjectPrefix({
        userId,
        collectionId,
      }),
      displayName: "知识库 S3",
      description: "知识库 知识库资料文件存储。",
    });
  const filesystem = wrapKnowledgeFilesystemForReading(rawFilesystem);
  const searchConfig = await createKnowledgeSearchWorkspaceConfig({
    userId,
    indexName,
  });
  const workspace = new Workspace({
    id: `workspace:${userId}:${collectionId}`,
    name: `${collectionId} Workspace`,
    filesystem,
    ...searchConfig,
  });

  await workspace.init();
  await synchronizeKnowledgeSourcePaths({
    userId,
    collectionId,
    rawFilesystem,
    workspace,
  });

  return {
    indexName,
    workspace,
    vectorStore: searchConfig.vectorStore,
  };
}

async function getKnowledgeWorkspaceEntry(params: {
  collectionId: string;
  userId: string;
}): Promise<WorkspaceEntry> {
  const key = getCacheKey(params.userId, params.collectionId);
  const cached = workspaceCache.get(key);

  if (cached) {
    return cached;
  }

  const pendingEntry = createWorkspaceEntry(
    params.userId,
    params.collectionId,
  ).catch((error) => {
    workspaceCache.delete(key);
    throw error;
  });

  workspaceCache.set(key, pendingEntry);
  return pendingEntry;
}

export async function getKnowledgeWorkspace(params: {
  collectionId: string;
  userId: string;
}): Promise<Workspace<WorkspaceFilesystem>> {
  return (await getKnowledgeWorkspaceEntry(params)).workspace;
}

export async function getKnowledgeWorkspaceSearchState(params: {
  collectionId: string;
  userId: string;
}): Promise<Pick<WorkspaceEntry, "indexName" | "vectorStore" | "workspace">> {
  const entry = await getKnowledgeWorkspaceEntry(params);

  return {
    indexName: entry.indexName,
    vectorStore: entry.vectorStore,
    workspace: entry.workspace,
  };
}

export async function invalidateKnowledgeWorkspace(params: {
  collectionId: string;
  userId: string;
}): Promise<void> {
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

  await entry.workspace.destroy().catch(() => undefined);
}

export function resetKnowledgeRuntimeCache(): void {
  for (const pendingEntry of workspaceCache.values()) {
    void pendingEntry
      .then(async (entry) => {
        await entry.workspace.destroy();
      })
      .catch(() => undefined);
  }

  embeddingDimensionPromises.clear();
  workspaceCache.clear();
  resetKnowledgeConfigCache();
}

export function setKnowledgeFilesystemFactoryForTests(
  factory?: KnowledgeFilesystemFactory,
): void {
  filesystemFactoryOverride = factory;
}

export function setKnowledgeStoragePrefixFilesystemFactoryForTests(
  factory?: KnowledgeStoragePrefixFilesystemFactory,
): void {
  storagePrefixFilesystemFactoryOverride = factory;
}

export { LocalFilesystem };
