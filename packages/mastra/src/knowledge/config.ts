import {
  parseMastraConfig,
  resetMastraConfigCache,
  type MastraConfig,
} from "@cnpap/ops-agent-kit";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATA_DIR_NAME = ".atlas-kb";
const DEFAULT_RUNTIME_DIR = "runtime";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_DATABASE_URL =
  "postgresql://ops_agent_kit:OpsAgentKit_TSDB_2026!x7Q2mP9r@127.0.0.1:15432/ops_agent_kit";

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

function trimEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getKnowledgeDataDir(): string {
  const customDir = trimEnvValue(process.env.ATLAS_KB_DATA_DIR);

  if (customDir) {
    return resolve(customDir);
  }

  return resolve(getProjectRoot(), DEFAULT_DATA_DIR_NAME);
}

export function getKnowledgeRuntimeDir(): string {
  const customDir = trimEnvValue(process.env.ATLAS_KB_RUNTIME_DIR);

  if (customDir) {
    return resolve(customDir);
  }

  return resolve(getKnowledgeDataDir(), DEFAULT_RUNTIME_DIR);
}

export function getKnowledgeUploadsDir(): string {
  return resolve(getKnowledgeRuntimeDir(), "uploads");
}

export function getKnowledgeSourcesDir(): string {
  return resolve(getKnowledgeRuntimeDir(), "sources");
}

export function getKnowledgeExportsDir(): string {
  return resolve(getKnowledgeRuntimeDir(), "exports");
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

let opsMastraConfigCache: MastraConfig | undefined;

export function resetKnowledgeConfigCache(): void {
  opsMastraConfigCache = undefined;
  resetMastraConfigCache();
}

export function getOpsMastraConfig(): MastraConfig {
  if (!opsMastraConfigCache) {
    const knowledgeTenantId =
      trimEnvValue(process.env.KNOWLEDGE_TENANT_ID) ?? "atlas-kb-runtime";
    const knowledgeBlobPrefix =
      trimEnvValue(process.env.KNOWLEDGE_BLOB_PREFIX) ??
      `knowledge-source/${knowledgeTenantId}`;

    opsMastraConfigCache = parseMastraConfig({
      ...process.env,
      KNOWLEDGE_TENANT_ID: knowledgeTenantId,
      KNOWLEDGE_BLOB_PREFIX: knowledgeBlobPrefix,
    } as Record<string, string | undefined>);
  }

  return opsMastraConfigCache;
}

export function parseKnowledgeBlobBucket(lanceUri: string): string {
  return new URL(lanceUri).hostname;
}
