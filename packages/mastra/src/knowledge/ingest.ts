import { BadRequestError } from "@atlas-kb/errors";
import type { KnowledgeSpace, KnowledgeUploadMetadata } from "@atlas-kb/schema";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { getKnowledgeUploadsDir } from "./config";
import { indexKnowledgeDocument } from "./qdrant";
import {
  createKnowledgeDocument,
  getDocumentById,
  requireKnowledgeSpace,
} from "./repository";

const SUPPORTED_EXTENSIONS = new Set([
  ".csv",
  ".html",
  ".json",
  ".md",
  ".markdown",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const SUPPORTED_MIME_TYPES = new Set([
  "application/json",
  "application/x-ndjson",
  "application/x-yaml",
  "application/xml",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/plain",
  "text/xml",
  "text/yaml",
]);

function sanitizeFilename(input: string): string {
  const trimmed = basename(input || "upload.txt").trim();
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return sanitized || "upload.txt";
}

function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSummary(content: string): string {
  const summary = content.replace(/\s+/g, " ").trim();
  return summary.length > 220 ? `${summary.slice(0, 217).trim()}...` : summary;
}

function buildExcerpt(content: string): string {
  const excerpt = content.replace(/\s+/g, " ").trim();
  return excerpt.length > 280 ? `${excerpt.slice(0, 277).trim()}...` : excerpt;
}

function resolveTitle(
  filename: string,
  metadata: KnowledgeUploadMetadata,
): string {
  if (metadata.title) {
    return metadata.title.trim();
  }

  const extension = extname(filename);
  return (
    basename(filename, extension).replace(/[-_]+/g, " ").trim() || filename
  );
}

function isTextUpload(file: File): boolean {
  if (
    file.type &&
    (file.type.startsWith("text/") || SUPPORTED_MIME_TYPES.has(file.type))
  ) {
    return true;
  }

  return SUPPORTED_EXTENSIONS.has(extname(file.name).toLowerCase());
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

export async function uploadKnowledgeDocument(params: {
  file: File;
  metadata?: KnowledgeUploadMetadata;
  spaceId: string;
}): Promise<{
  document: Awaited<ReturnType<typeof createKnowledgeDocument>>;
  space: KnowledgeSpace;
  engine: "lexical" | "vector";
  indexed: boolean;
}> {
  await requireKnowledgeSpace(params.spaceId);

  if (!isTextUpload(params.file)) {
    throw new BadRequestError(
      "Unsupported file type. Upload text, markdown, HTML, JSON, CSV, XML, or YAML files.",
    );
  }

  const metadata = params.metadata ?? {};
  const content = normalizeText(await params.file.text());

  if (!content) {
    throw new BadRequestError("Uploaded file is empty");
  }

  const uploadsDir = resolve(getKnowledgeUploadsDir(), params.spaceId);
  const safeFilename = sanitizeFilename(params.file.name);
  const storageName = `${Date.now()}-${safeFilename}`;
  const storagePath = resolve(uploadsDir, storageName);

  await mkdir(uploadsDir, { recursive: true });
  await writeFile(storagePath, new Uint8Array(await params.file.arrayBuffer()));

  const document = await createKnowledgeDocument({
    spaceId: params.spaceId,
    title: resolveTitle(safeFilename, metadata),
    summary: metadata.summary?.trim() || buildSummary(content),
    excerpt: buildExcerpt(content),
    content,
    tags: metadata.tags ?? [],
    source: "upload",
    sourceFilename: safeFilename,
    mimeType: params.file.type || undefined,
    byteSize: params.file.size,
    storagePath,
  });

  const storedDocument = await getDocumentById(document.id);
  const indexed = storedDocument
    ? await indexKnowledgeDocument(storedDocument).catch((error) => {
        console.warn(
          `[atlas-kb/mastra] upload indexed with lexical fallback: ${getErrorMessage(error)}`,
        );
        return false;
      })
    : false;
  const space = await requireKnowledgeSpace(params.spaceId);

  return {
    document,
    space,
    indexed,
    engine: indexed ? "vector" : "lexical",
  };
}
