const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_MAX_CONCURRENCY = 5;
const DEFAULT_EMBEDDING_MIN_INTERVAL_MS = 1_000;
const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";
const DEFAULT_KNOWLEDGE_S3_PREFIX = "knowledge-sources";
const DEFAULT_ADMIN_API_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_DATABASE_URL =
  "postgresql://ops_agent_kit:OpsAgentKit_TSDB_2026!x7Q2mP9r@127.0.0.1:15432/ops_agent_kit";

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

export function getAdminApiBaseUrl(): string {
  return (
    trimEnvValue(process.env.ATLAS_KB_ADMIN_API_BASE_URL) ??
    DEFAULT_ADMIN_API_BASE_URL
  ).replace(/\/+$/g, "");
}

export function getInternalSecret(): string | undefined {
  return trimEnvValue(process.env.ATLAS_KB_INTERNAL_SECRET);
}

export function validateKnowledgeStorageConfig(): void {
  const missing = [
    ["ATLAS_KB_S3_ENDPOINT", getKnowledgeS3Endpoint()],
    ["ATLAS_KB_S3_REGION", getKnowledgeS3Region()],
    ["ATLAS_KB_S3_BUCKET", getKnowledgeS3Bucket()],
    ["ATLAS_KB_S3_ACCESS_KEY_ID", getKnowledgeS3AccessKeyId()],
    ["ATLAS_KB_S3_SECRET_ACCESS_KEY", getKnowledgeS3SecretAccessKey()],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required S3 configuration: ${missing.join(", ")}`);
  }

  if (!getInternalSecret()) {
    throw new Error(
      "Missing required internal configuration: ATLAS_KB_INTERNAL_SECRET",
    );
  }
}

export function resetKnowledgeConfigCache(): void {
  return;
}
