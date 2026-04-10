import { createDatabaseWorkspaceIndexCheckpointStore } from "./workspace-index-checkpoints";
import {
  createContentProxy,
  createWorkspaceIndexer,
  parseOpsAgentKitConfig,
  type WorkspaceIndexer,
} from "@cnpap/ops-agent-kit";
import type { AnyWorkspace, WorkspaceFilesystem } from "@mastra/core/workspace";
import { S3Filesystem } from "@mastra/s3";
import { getEmbeddingMaxConcurrency } from "./config";
import { deriveKnowledgeSourceTitleFromFileName } from "./document-file-types";

let cachedOpsAgentKitConfig:
  | ReturnType<typeof parseOpsAgentKitConfig>
  | undefined;

function readOpsAgentKitEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

export function getOpsAgentKitConfig() {
  if (cachedOpsAgentKitConfig !== undefined) {
    return cachedOpsAgentKitConfig;
  }

  cachedOpsAgentKitConfig = parseOpsAgentKitConfig(readOpsAgentKitEnv());
  return cachedOpsAgentKitConfig;
}

export function wrapKnowledgeFilesystemForReading(
  filesystem: WorkspaceFilesystem,
): WorkspaceFilesystem {
  if (!(filesystem instanceof S3Filesystem)) {
    return filesystem;
  }

  const config = getOpsAgentKitConfig();

  return createContentProxy({
    docling: config.docling,
    vision: config.vision,
    visionMode: "off",
  }).wrap(filesystem);
}

export function createKnowledgeWorkspaceIndexer(args: {
  collectionId: string;
  userId: string;
  workspace: AnyWorkspace;
}): WorkspaceIndexer {
  const config = getOpsAgentKitConfig();

  return createWorkspaceIndexer({
    workspace: args.workspace,
    checkpointStore: createDatabaseWorkspaceIndexCheckpointStore({
      userId: args.userId,
      collectionId: args.collectionId,
    }),
    docling: config.docling,
    vision: config.vision,
    defaultVisionMode: "off",
    maxEmbeddingConcurrency: getEmbeddingMaxConcurrency(),
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
