import { basename, extname } from "node:path";
import type { KnowledgeSource } from "@atlas-kb/schema";

const MIME_BY_EXTENSION = new Map<string, string>([
  [".cjs", "text/javascript"],
  [".css", "text/css"],
  [".csv", "text/csv"],
  [
    ".docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".jsx", "text/javascript"],
  [".md", "text/markdown"],
  [".mjs", "text/javascript"],
  [".pdf", "application/pdf"],
  [".py", "text/x-python"],
  [".sh", "text/x-shellscript"],
  [".sql", "text/plain"],
  [".ts", "text/plain"],
  [".tsx", "text/plain"],
  [".txt", "text/plain"],
  [".vue", "text/plain"],
  [
    ".xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  [".xml", "application/xml"],
  [".yaml", "application/yaml"],
  [".yml", "application/yaml"],
]);

const DEFAULT_EXTENSION_BY_MIME = new Map<string, string>([
  ["application/json", ".json"],
  ["application/pdf", ".pdf"],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xlsx",
  ],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".docx",
  ],
  ["application/xml", ".xml"],
  ["application/yaml", ".yaml"],
  ["text/csv", ".csv"],
  ["text/html", ".html"],
  ["text/markdown", ".md"],
  ["text/plain", ".txt"],
]);

const DOCLING_MANAGED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function normalizeMimeType(value?: string): string | undefined {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  return normalized || undefined;
}

function normalizeExtension(extension: string): string {
  if (!extension.trim()) {
    return "";
  }

  return extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
}

export function getFileExtension(fileName?: string): string {
  if (!fileName?.trim()) {
    return "";
  }

  return normalizeExtension(extname(fileName.trim()));
}

export function detectKnowledgeMimeType(
  fileName: string,
  mimeType?: string,
): string {
  return (
    normalizeMimeType(mimeType) ??
    MIME_BY_EXTENSION.get(getFileExtension(fileName)) ??
    "text/plain"
  );
}

export function getDefaultExtensionForMimeType(mimeType?: string): string {
  return (
    DEFAULT_EXTENSION_BY_MIME.get(normalizeMimeType(mimeType) || "") ?? ".txt"
  );
}

export function isDoclingManagedFile(args: {
  fileName?: string;
  mimeType?: string;
}): boolean {
  const normalizedMimeType = normalizeMimeType(args.mimeType);

  if (
    normalizedMimeType &&
    DOCLING_MANAGED_MIME_TYPES.has(normalizedMimeType)
  ) {
    return true;
  }

  return DOCLING_MANAGED_MIME_TYPES.has(
    detectKnowledgeMimeType(args.fileName || "document", args.mimeType),
  );
}

export function deriveKnowledgeSourceTitleFromFileName(
  fileName: string,
): string {
  return basename(fileName, extname(fileName)) || "Untitled Source";
}

export function isKnowledgeSourceContentEditable(
  source: Pick<KnowledgeSource, "documentId" | "mimeType" | "sourceFilename">,
): boolean {
  return !isDoclingManagedFile({
    fileName: source.sourceFilename ?? source.documentId,
    mimeType: source.mimeType ?? undefined,
  });
}
