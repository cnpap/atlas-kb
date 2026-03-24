import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATA_DIR_NAME = ".atlas-kb";
const DEFAULT_DATABASE_FILE = "atlas-kb.db";
const DEFAULT_UPLOADS_DIR = "uploads";
const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";
const DEFAULT_QDRANT_COLLECTION = "atlas_kb_chunks";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-large";
const DEFAULT_DASHSCOPE_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_DASHSCOPE_EMBEDDING_MODEL = "text-embedding-v4";
const DEFAULT_JINA_BASE_URL = "https://api.jina.ai/v1";

function getProjectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

function normalizeOpenAIBaseUrl(baseUrl?: string): string {
  const configuredBaseUrl = baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL;
  const normalizedBaseUrl = configuredBaseUrl.replace(/\/+$/g, "");

  return normalizedBaseUrl.endsWith("/v1")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/v1`;
}

export function getKnowledgeDataDir(): string {
  const customDir = process.env.ATLAS_KB_DATA_DIR?.trim();
  if (customDir) {
    return resolve(customDir);
  }

  return resolve(getProjectRoot(), DEFAULT_DATA_DIR_NAME);
}

export function getKnowledgeDatabasePath(): string {
  return resolve(getKnowledgeDataDir(), DEFAULT_DATABASE_FILE);
}

export function getKnowledgeUploadsDir(): string {
  return resolve(getKnowledgeDataDir(), DEFAULT_UPLOADS_DIR);
}

export function getQdrantUrl(): string {
  return process.env.QDRANT_URL?.trim() || DEFAULT_QDRANT_URL;
}

export function getQdrantApiKey(): string | undefined {
  const apiKey = process.env.QDRANT_API_KEY?.trim();
  return apiKey ? apiKey : undefined;
}

export function getQdrantCollectionName(): string {
  return process.env.QDRANT_COLLECTION?.trim() || DEFAULT_QDRANT_COLLECTION;
}

export function getOpenAIApiKey(): string | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey ? apiKey : undefined;
}

export function getDashScopeApiKey(): string | undefined {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  return apiKey ? apiKey : undefined;
}

export function getOpenAIBaseUrl(): string {
  return normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL);
}

export function getOpenAIUrl(path: string, baseUrl?: string): string {
  const normalizedPath = path.replace(/^\/+/g, "");
  return `${normalizeOpenAIBaseUrl(baseUrl)}/${normalizedPath}`;
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export function getEmbeddingApiKey(): string | undefined {
  return getDashScopeApiKey() ?? getOpenAIApiKey();
}

export function getEmbeddingBaseUrl(): string {
  if (getDashScopeApiKey()) {
    return normalizeOpenAIBaseUrl(
      process.env.DASHSCOPE_BASE_URL || DEFAULT_DASHSCOPE_BASE_URL,
    );
  }

  return getOpenAIBaseUrl();
}

export function getEmbeddingModel(): string {
  if (getDashScopeApiKey()) {
    return (
      process.env.DASHSCOPE_EMBEDDING_MODEL?.trim() ||
      DEFAULT_DASHSCOPE_EMBEDDING_MODEL
    );
  }

  return (
    process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_OPENAI_EMBEDDING_MODEL
  );
}

export function getEmbeddingUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/g, "");
  return `${getEmbeddingBaseUrl()}/${normalizedPath}`;
}

export function getJinaApiKey(): string | undefined {
  const apiKey = process.env.JINA_API_KEY?.trim();
  return apiKey ? apiKey : undefined;
}

export function getJinaBaseUrl(): string {
  return (process.env.JINA_BASE_URL?.trim() || DEFAULT_JINA_BASE_URL).replace(
    /\/+$/g,
    "",
  );
}

export function getJinaUrl(path: string): string {
  return `${getJinaBaseUrl()}/${path.replace(/^\/+/g, "")}`;
}
