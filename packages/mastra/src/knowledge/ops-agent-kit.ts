import {
  createContentProxy,
  createWorkspaceIndexer,
  parseOpsAgentKitConfig,
  type WorkspaceIndexer,
} from "@cnpap/ops-agent-kit";
import type { AnyWorkspace, WorkspaceFilesystem } from "@mastra/core/workspace";
import { S3Filesystem } from "@mastra/s3";
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
  workspace: AnyWorkspace;
}): WorkspaceIndexer {
  const config = getOpsAgentKitConfig();

  return createWorkspaceIndexer({
    workspace: args.workspace,
    docling: config.docling,
    vision: config.vision,
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
