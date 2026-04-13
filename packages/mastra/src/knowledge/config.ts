const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_RUNTIME_PROVIDER = "openai";
const DEFAULT_DASHSCOPE_COMPATIBLE_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_MAX_CONCURRENCY = 5;
const DEFAULT_EMBEDDING_MIN_INTERVAL_MS = 1_000;
const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";
const DEFAULT_KNOWLEDGE_S3_PREFIX = "knowledge-sources";
const DEFAULT_TIKA_BASE_URL = "http://127.0.0.1:9998";
const DEFAULT_ADMIN_API_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_DATABASE_URL =
  "postgresql://ops_agent_kit:OpsAgentKit_TSDB_2026!x7Q2mP9r@127.0.0.1:15432/ops_agent_kit";
const DEFAULT_TEMPLATE_EXPORT_TIMEOUT_MS = 900_000;

function trimEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOpenAIBaseUrl(baseUrl?: string): string {
  const configuredBaseUrl = baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL;
  const normalizedBaseUrl = configuredBaseUrl.replace(/\/+$/g, "");

  return normalizedBaseUrl.endsWith("/v1")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/v1`;
}

function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  const normalized = trimEnvValue(value)?.toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(normalized);
}

function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDatabaseUrl(): string {
  return (
    trimEnvValue(process.env.DATABASE_URL) ??
    trimEnvValue(process.env.TIMESCALEDB_URL) ??
    DEFAULT_DATABASE_URL
  );
}

export function getOpenAIApiKey(): string | undefined {
  return trimEnvValue(process.env.OPENAI_API_KEY);
}

export function getOpenAIBaseUrl(): string {
  return normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL);
}

export function getOpenAIUrl(path: string, baseUrl?: string): string {
  const normalizedPath = path.replace(/^\/+/g, "");

  return `${baseUrl ? normalizeOpenAIBaseUrl(baseUrl) : getOpenAIBaseUrl()}/${normalizedPath}`;
}

export function getOpenAIModel(): string {
  return trimEnvValue(process.env.OPENAI_MODEL) ?? DEFAULT_OPENAI_MODEL;
}

export function getRuntimeProvider(): string {
  return trimEnvValue(process.env.RUNTIME_PROVIDER) ?? DEFAULT_RUNTIME_PROVIDER;
}

export function getRuntimeModel(): string | undefined {
  return getRuntimeProvider() === "openai"
    ? getOpenAIModel()
    : trimEnvValue(process.env.RUNTIME_MODEL);
}

export function getDashScopeCompatibleBaseUrl(): string {
  return normalizeOpenAIBaseUrl(
    trimEnvValue(process.env.DASHSCOPE_BASE_URL) ??
      trimEnvValue(process.env.EMBEDDING_BASE_URL) ??
      DEFAULT_DASHSCOPE_COMPATIBLE_BASE_URL,
  );
}

export function getChatTitleModel(): string {
  return (
    trimEnvValue(process.env.ATLAS_KB_CHAT_TITLE_MODEL) ??
    getRuntimeModel() ??
    getOpenAIModel()
  );
}

export function getChatTitleApiKey(): string | undefined {
  return getRuntimeProvider() === "alibaba-cn"
    ? (trimEnvValue(process.env.DASHSCOPE_API_KEY) ?? getOpenAIApiKey())
    : getOpenAIApiKey();
}

export function getChatTitleBaseUrl(): string {
  return getRuntimeProvider() === "alibaba-cn"
    ? getDashScopeCompatibleBaseUrl()
    : getOpenAIBaseUrl();
}

export function getChatTitleUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/g, "");
  return `${getChatTitleBaseUrl()}/${normalizedPath}`;
}

export function getEmbeddingApiKey(): string | undefined {
  return trimEnvValue(process.env.EMBEDDING_API_KEY) ?? getOpenAIApiKey();
}

export function getEmbeddingBaseUrl(): string {
  return normalizeOpenAIBaseUrl(
    trimEnvValue(process.env.EMBEDDING_BASE_URL) ?? process.env.OPENAI_BASE_URL,
  );
}

export function getEmbeddingModel(): string {
  return (
    trimEnvValue(process.env.EMBEDDING_MODEL) ??
    trimEnvValue(process.env.OPENAI_EMBEDDING_MODEL) ??
    DEFAULT_EMBEDDING_MODEL
  );
}

export function getEmbeddingUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/g, "");
  return `${getEmbeddingBaseUrl()}/${normalizedPath}`;
}

export function getEmbeddingDimensions(): number | undefined {
  const rawValue =
    trimEnvValue(process.env.EMBEDDING_DIMENSIONS) ??
    trimEnvValue(process.env.OPENAI_EMBEDDING_DIMENSIONS);

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function getEmbeddingMaxConcurrency(): number {
  return parsePositiveIntegerEnv(
    process.env.EMBEDDING_MAX_CONCURRENCY,
    DEFAULT_EMBEDDING_MAX_CONCURRENCY,
  );
}

export function getEmbeddingMinIntervalMs(): number {
  return parsePositiveIntegerEnv(
    process.env.EMBEDDING_MIN_INTERVAL_MS,
    DEFAULT_EMBEDDING_MIN_INTERVAL_MS,
  );
}

export function getWorkspaceIndexMaxPagesPerRun(): number | undefined {
  const rawValue = trimEnvValue(
    process.env.ATLAS_KB_WORKSPACE_INDEX_MAX_PAGES_PER_RUN,
  );

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function hasEmbeddingConfig(): boolean {
  return Boolean(getEmbeddingApiKey() && getEmbeddingModel());
}

export function getQdrantUrl(): string {
  return trimEnvValue(process.env.QDRANT_URL) ?? DEFAULT_QDRANT_URL;
}

export function getQdrantApiKey(): string | undefined {
  return trimEnvValue(process.env.QDRANT_API_KEY);
}

export function getQdrantCollectionPrefix(): string {
  return trimEnvValue(process.env.QDRANT_COLLECTION_PREFIX) ?? "atlas_kb";
}

export function getKnowledgeS3Endpoint(): string | undefined {
  return trimEnvValue(process.env.ATLAS_KB_S3_ENDPOINT);
}

export function getKnowledgeS3PublicEndpoint(): string | undefined {
  return (
    trimEnvValue(process.env.ATLAS_KB_S3_PUBLIC_ENDPOINT) ??
    getKnowledgeS3Endpoint()
  );
}

export function getKnowledgeS3Region(): string | undefined {
  return trimEnvValue(process.env.ATLAS_KB_S3_REGION);
}

export function getKnowledgeS3Bucket(): string | undefined {
  return trimEnvValue(process.env.ATLAS_KB_S3_BUCKET);
}

export function getKnowledgeS3AccessKeyId(): string | undefined {
  return trimEnvValue(process.env.ATLAS_KB_S3_ACCESS_KEY_ID);
}

export function getKnowledgeS3SecretAccessKey(): string | undefined {
  return trimEnvValue(process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY);
}

export function getKnowledgeS3Prefix(): string {
  return (
    trimEnvValue(process.env.ATLAS_KB_S3_PREFIX) ?? DEFAULT_KNOWLEDGE_S3_PREFIX
  );
}

export function getKnowledgeS3ForcePathStyle(): boolean {
  return parseBooleanEnv(process.env.ATLAS_KB_S3_FORCE_PATH_STYLE, true);
}

export function getTikaBaseUrl(): string {
  return (
    trimEnvValue(process.env.ATLAS_KB_TIKA_BASE_URL) ?? DEFAULT_TIKA_BASE_URL
  ).replace(/\/+$/g, "");
}

export function getAdminApiBaseUrl(): string {
  return (
    trimEnvValue(process.env.ATLAS_KB_ADMIN_API_BASE_URL) ??
    DEFAULT_ADMIN_API_BASE_URL
  ).replace(/\/+$/g, "");
}

export function getInternalSecret(): string | undefined {
  return trimEnvValue(process.env.ATLAS_KB_INTERNAL_SECRET);
}

export function getTemplateExportTimeoutMs(): number {
  return parsePositiveIntegerEnv(
    process.env.ATLAS_KB_TEMPLATE_EXPORT_TIMEOUT_MS,
    DEFAULT_TEMPLATE_EXPORT_TIMEOUT_MS,
  );
}

export function validateKnowledgeStorageConfig(): void {
  const missingStorage = [
    ["ATLAS_KB_S3_ENDPOINT", getKnowledgeS3Endpoint()],
    ["ATLAS_KB_S3_REGION", getKnowledgeS3Region()],
    ["ATLAS_KB_S3_BUCKET", getKnowledgeS3Bucket()],
    ["ATLAS_KB_S3_ACCESS_KEY_ID", getKnowledgeS3AccessKeyId()],
    ["ATLAS_KB_S3_SECRET_ACCESS_KEY", getKnowledgeS3SecretAccessKey()],
    ["ATLAS_KB_TIKA_BASE_URL", getTikaBaseUrl()],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingStorage.length > 0) {
    throw new Error(
      `Missing required S3 configuration: ${missingStorage.join(", ")}`,
    );
  }

  if (!getInternalSecret()) {
    throw new Error(
      "Missing required internal configuration: ATLAS_KB_INTERNAL_SECRET",
    );
  }

  const missingHybrid = [
    ["QDRANT_URL", trimEnvValue(process.env.QDRANT_URL)],
    ["EMBEDDING_API_KEY", trimEnvValue(process.env.EMBEDDING_API_KEY)],
    ["EMBEDDING_MODEL", trimEnvValue(process.env.EMBEDDING_MODEL)],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingHybrid.length > 0) {
    throw new Error(
      `Atlas KB requires hybrid retrieval configuration: ${missingHybrid.join(", ")}`,
    );
  }
}

export function resetKnowledgeConfigCache(): void {
  return;
}
