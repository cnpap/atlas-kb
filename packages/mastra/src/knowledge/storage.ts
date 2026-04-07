import { basename, extname } from "node:path";
import type { KnowledgeSource } from "@atlas-kb/schema";
import {
  deleteKnowledgeCollectionObjects,
  deleteKnowledgeSourceObject,
  putKnowledgeSourceObject,
} from "./object-storage";
import {
  buildContentPreview,
  buildSummary,
  normalizeWhitespace,
} from "./search-utils";

export type ManagedSourcePaths = {
  absoluteDocumentPath: string;
  directory: string;
  documentPath: string;
  indexPath: string;
  originalPath: string;
};

export type ExtractedSourceContent = {
  content: string;
  contentPreview: string;
  excerpt: string;
  mimeType: string;
  title: string;
};

const MIME_BY_EXTENSION = new Map<string, string>([
  [".cjs", "text/javascript"],
  [".css", "text/css"],
  [".csv", "text/csv"],
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".jsx", "text/javascript"],
  [".md", "text/markdown"],
  [".mjs", "text/javascript"],
  [".py", "text/x-python"],
  [".sh", "text/x-shellscript"],
  [".sql", "text/plain"],
  [".ts", "text/plain"],
  [".tsx", "text/plain"],
  [".txt", "text/plain"],
  [".vue", "text/plain"],
  [".xml", "application/xml"],
  [".yaml", "application/yaml"],
  [".yml", "application/yaml"],
]);

const DEFAULT_EXTENSION_BY_MIME = new Map<string, string>([
  ["application/json", ".json"],
  ["application/xml", ".xml"],
  ["text/csv", ".csv"],
  ["text/html", ".html"],
  ["text/markdown", ".md"],
  ["text/plain", ".txt"],
  ["application/yaml", ".yaml"],
]);

function stripControlCharacters(value: string) {
  return Array.from(value)
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint >= 0x20 && codePoint !== 0x7f;
    })
    .join("");
}

export function sanitizeManagedFileName(fileName: string): string {
  const normalized = basename(fileName.replaceAll("\\", "/"))
    .normalize("NFC")
    .replaceAll("/", " ");
  const cleaned = stripControlCharacters(normalized)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/g, "")
    .replace(/[. ]+$/g, "");

  return cleaned || "source";
}

function normalizeExtension(extension: string): string {
  if (!extension.trim()) {
    return "";
  }

  return extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
}

function getFallbackExtension(args: {
  mimeType?: string;
  sourceType: KnowledgeSource["sourceType"];
}) {
  const mimeType = args.mimeType?.split(";", 1)[0]?.trim().toLowerCase();

  if (mimeType) {
    const matchedExtension = DEFAULT_EXTENSION_BY_MIME.get(mimeType);

    if (matchedExtension) {
      return matchedExtension;
    }
  }

  switch (args.sourceType) {
    case "url":
      return ".html";
    default:
      return ".txt";
  }
}

function ensureManagedFileExtension(args: {
  fileName: string;
  sourceType: KnowledgeSource["sourceType"];
  mimeType?: string;
}) {
  const extension = normalizeExtension(extname(args.fileName));

  if (extension) {
    return args.fileName;
  }

  return `${args.fileName}${getFallbackExtension(args)}`;
}

export function buildManagedSourceFileName(args: {
  mimeType?: string;
  sourceFilename?: string;
  sourceType: KnowledgeSource["sourceType"];
  sourceUrl?: string;
  title: string;
}) {
  const preferredName =
    args.sourceType === "file" || args.sourceType === "seed"
      ? args.sourceFilename?.trim() || args.title.trim()
      : args.sourceType === "url"
        ? `${args.title.trim()}.html`
        : `${args.title.trim()}.txt`;

  return ensureManagedFileExtension({
    fileName: sanitizeManagedFileName(preferredName || "source"),
    sourceType: args.sourceType,
    mimeType: args.mimeType,
  });
}

export function allocateManagedSourceFileName(
  preferredFileName: string,
  usedFileNames: ReadonlySet<string>,
) {
  const normalizedFileName = sanitizeManagedFileName(preferredFileName);
  const extension = extname(normalizedFileName);
  const stem = extension
    ? normalizedFileName.slice(0, -extension.length)
    : normalizedFileName;

  let nextFileName = normalizedFileName;
  let suffix = 2;

  while (usedFileNames.has(nextFileName)) {
    nextFileName = `${stem} (${suffix})${extension}`;
    suffix += 1;
  }

  return nextFileName;
}

function deriveTextTitle(fileName: string, content: string): string {
  const firstLine = normalizeWhitespace(content).split("\n")[0]?.trim();

  if (firstLine) {
    return firstLine.replace(/^#{1,6}\s+/, "").slice(0, 160);
  }

  return basename(fileName, extname(fileName)) || "Untitled Source";
}

function detectMimeType(fileName: string, mimeType?: string): string {
  if (mimeType?.trim()) {
    return mimeType.trim();
  }

  return MIME_BY_EXTENSION.get(extname(fileName).toLowerCase()) || "text/plain";
}

function decodeTextContent(bytes: Uint8Array): string {
  const decoded = new TextDecoder("utf-8").decode(bytes);

  if (decoded.includes("\u0000")) {
    throw new Error("当前文件包含二进制内容，暂不支持直接导入");
  }

  const normalized = normalizeWhitespace(decoded.replace(/^\uFEFF/, ""));

  if (!normalized) {
    throw new Error("当前文件没有可索引的文本内容");
  }

  return normalized;
}

export function getManagedSourcePaths(args: {
  collectionId: string;
  fileName: string;
  userId: string;
}): ManagedSourcePaths {
  const documentPath = sanitizeManagedFileName(args.fileName).replaceAll(
    "\\",
    "/",
  );

  return {
    absoluteDocumentPath: documentPath,
    directory: "",
    documentPath,
    indexPath: documentPath,
    originalPath: documentPath,
  };
}

export async function storeUploadedSourceFile(args: {
  collectionId: string;
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string;
  userId: string;
}) {
  const paths = getManagedSourcePaths(args);

  await putKnowledgeSourceObject({
    userId: args.userId,
    collectionId: args.collectionId,
    relativePath: paths.documentPath,
    body: args.bytes,
    contentType: args.mimeType,
  });

  return paths;
}

export async function storeTextSourceFile(args: {
  collectionId: string;
  content: string;
  fileName: string;
  mimeType?: string;
  userId: string;
}) {
  const paths = getManagedSourcePaths(args);

  await putKnowledgeSourceObject({
    userId: args.userId,
    collectionId: args.collectionId,
    relativePath: paths.documentPath,
    body: normalizeWhitespace(args.content),
    contentType: args.mimeType ?? "text/plain; charset=utf-8",
  });

  return paths;
}

export async function overwriteStoredSourceFile(args: {
  collectionId: string;
  content: string;
  mimeType?: string;
  originalPath: string;
  userId: string;
}) {
  await putKnowledgeSourceObject({
    userId: args.userId,
    collectionId: args.collectionId,
    relativePath: args.originalPath,
    body: normalizeWhitespace(args.content),
    contentType: args.mimeType,
  });
}

export async function deleteManagedSourceFiles(args: {
  collectionId: string;
  originalPath?: string | null;
  userId: string;
}) {
  if (!args.originalPath) {
    return;
  }

  await deleteKnowledgeSourceObject({
    userId: args.userId,
    collectionId: args.collectionId,
    relativePath: args.originalPath,
  });
}

export async function deleteManagedCollectionFiles(args: {
  collectionId: string;
  userId: string;
}) {
  await deleteKnowledgeCollectionObjects(args);
}

export async function extractFileContent(args: {
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string;
}) {
  const content = decodeTextContent(args.bytes);

  return {
    content,
    contentPreview: buildContentPreview(content),
    excerpt: buildSummary(content, 160),
    mimeType: detectMimeType(args.fileName, args.mimeType),
    title: deriveTextTitle(args.fileName, content),
  } satisfies ExtractedSourceContent;
}

export function buildTextSourceContent(args: {
  content: string;
  fileName: string;
  title?: string;
}) {
  const content = normalizeWhitespace(args.content);

  return {
    content,
    contentPreview: buildContentPreview(content),
    excerpt: buildSummary(content, 160),
    mimeType: detectMimeType(args.fileName),
    title: args.title?.trim() || deriveTextTitle(args.fileName, content),
  } satisfies ExtractedSourceContent;
}
