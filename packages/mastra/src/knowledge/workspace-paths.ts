import type { KnowledgeSource } from "@atlas-kb/schema";

export function normalizeWorkspaceDisplayPath(path: string): string {
  const normalized = path
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");

  return normalized ? `/${normalized}` : "/";
}

export function resolveKnowledgeSourceWorkspacePath(
  source: Pick<KnowledgeSource, "documentId" | "sourceFilename">,
): string | undefined {
  const candidate =
    source.documentId?.trim() || source.sourceFilename?.trim() || undefined;

  return candidate ? normalizeWorkspaceDisplayPath(candidate) : undefined;
}
