import { createHash } from "node:crypto";
import type { KnowledgeSource } from "@atlas-kb/schema";
import {
  createContentProxy,
  createTenantIndexService,
  parseOpsAgentKitConfig,
  type TenantIndexService,
} from "@cnpap/ops-agent-kit";
import type { AnyWorkspace, WorkspaceFilesystem } from "@mastra/core/workspace";
import type { QdrantVector } from "@mastra/qdrant";
import { S3Filesystem } from "@mastra/s3";
import {
  deriveKnowledgeSourceTitleFromFileName,
  isDoclingManagedFile,
} from "./document-file-types";
import { normalizeWhitespace } from "./search-utils";

const DEFAULT_DOCLING_CONVERT_PATH = "/v1/convert/file";
const DEFAULT_EMBED_CONCURRENCY = 2;

let cachedOpsAgentKitConfig:
  | ReturnType<typeof parseOpsAgentKitConfig>
  | undefined;

function trimEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildOpsAgentKitEnv(): Record<string, string | undefined> {
  return {
    DOCLING_BASE_URL: trimEnvValue(process.env.DOCLING_BASE_URL),
    DOCLING_CONVERT_PATH:
      trimEnvValue(process.env.DOCLING_CONVERT_PATH) ??
      DEFAULT_DOCLING_CONVERT_PATH,
    VISION_BASE_URL: trimEnvValue(process.env.VISION_BASE_URL),
    VISION_API_KEY: trimEnvValue(process.env.VISION_API_KEY),
    VISION_MODEL: trimEnvValue(process.env.VISION_MODEL),
    QDRANT_URL: trimEnvValue(process.env.QDRANT_URL),
    QDRANT_API_KEY: trimEnvValue(process.env.QDRANT_API_KEY),
  };
}

function getOpsAgentKitEmbedConcurrency(): number {
  return parsePositiveIntegerEnv(
    process.env.EMBEDDING_MAX_CONCURRENCY,
    DEFAULT_EMBED_CONCURRENCY,
  );
}

function decodeFilesystemContent(
  content: Awaited<ReturnType<WorkspaceFilesystem["readFile"]>>,
): string {
  if (typeof content === "string") {
    return normalizeWhitespace(content.replace(/^\uFEFF/, ""));
  }

  const decoded = new TextDecoder("utf-8").decode(
    content instanceof Uint8Array ? content : new Uint8Array(content),
  );

  return normalizeWhitespace(decoded.replace(/^\uFEFF/, ""));
}

export function getOpsAgentKitConfig() {
  if (cachedOpsAgentKitConfig !== undefined) {
    return cachedOpsAgentKitConfig;
  }

  cachedOpsAgentKitConfig = parseOpsAgentKitConfig(buildOpsAgentKitEnv());
  return cachedOpsAgentKitConfig;
}

export function wrapKnowledgeFilesystemForReading(
  filesystem: WorkspaceFilesystem,
): WorkspaceFilesystem {
  if (!(filesystem instanceof S3Filesystem)) {
    return filesystem;
  }

  const config = getOpsAgentKitConfig();

  return createContentProxy("docling", {
    docling: config.docling,
    vision: config.vision,
    visionMode: "off",
  }).wrap(filesystem);
}

export function createKnowledgeTenantIndexService(args: {
  embedder: (text: string) => Promise<number[]>;
  workspace: AnyWorkspace;
  vectorStore?: QdrantVector;
}): TenantIndexService | undefined {
  if (!args.vectorStore) {
    return undefined;
  }

  if (!(args.workspace.filesystem instanceof S3Filesystem)) {
    return undefined;
  }

  const config = getOpsAgentKitConfig();

  return createTenantIndexService({
    workspace: args.workspace,
    docling: config.docling,
    vision: config.vision,
    vectorStore: args.vectorStore,
    vectorBackend: "qdrant",
    embedder: args.embedder,
    embedConcurrency: getOpsAgentKitEmbedConcurrency(),
  });
}

export function readKnowledgeWorkspaceTextFile(
  filesystem: WorkspaceFilesystem,
  path: string,
): Promise<string> {
  return filesystem
    .readFile(path)
    .then((content) => decodeFilesystemContent(content));
}

export function buildKnowledgeTenantId(args: {
  collectionId: string;
  userId: string;
}): string {
  return `atlas_${createHash("sha256")
    .update(`${args.userId}:${args.collectionId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

export function shouldSyncTenantIndex(args: {
  fileName?: string;
  mimeType?: string;
  sourceType: KnowledgeSource["sourceType"];
}): boolean {
  if (args.sourceType === "text") {
    return true;
  }

  if (args.sourceType !== "file") {
    return false;
  }

  return isDoclingManagedFile({
    fileName: args.fileName,
    mimeType: args.mimeType,
  });
}

export function deriveUploadTitle(args: {
  fileName: string;
  providedTitle?: string;
}): string {
  return (
    args.providedTitle?.trim() ||
    deriveKnowledgeSourceTitleFromFileName(args.fileName)
  );
}

export function resetOpsAgentKitConfigCache(): void {
  cachedOpsAgentKitConfig = undefined;
}
