import { basename, extname } from "node:path";
import type { KnowledgeSource } from "@atlas-kb/schema";
import {
  detectKnowledgeMimeType,
  getDefaultExtensionForMimeType,
} from "./document-file-types";
import { normalizeWhitespace } from "./search-utils";

type ExtractedSourceContent = {
  content: string;
  mimeType: string;
  sourceFilename: string;
};

function stripControlCharacters(value: string) {
  return Array.from(value)
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint >= 0x20 && codePoint !== 0x7f;
    })
    .join("");
}

function sanitizeManagedFileName(fileName: string): string {
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
  const matchedExtension = getDefaultExtensionForMimeType(args.mimeType);

  if (matchedExtension) {
    return matchedExtension;
  }

  switch (args.sourceType) {
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
  fallbackName?: string;
}) {
  const preferredName = args.sourceFilename?.trim() || args.fallbackName?.trim();

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

function deriveTextFileStem(fileName: string, content: string): string {
  const firstLine = normalizeWhitespace(content).split("\n")[0]?.trim();

  if (firstLine) {
    return firstLine.replace(/^#{1,6}\s+/, "").slice(0, 160);
  }

  return basename(fileName, extname(fileName)) || "Untitled Source";
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

export async function extractFileContent(args: {
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string;
}) {
  const content = decodeTextContent(args.bytes);
  const mimeType = detectKnowledgeMimeType(args.fileName, args.mimeType);

  return {
    content,
    mimeType,
    sourceFilename: buildManagedSourceFileName({
      mimeType,
      sourceFilename: args.fileName,
      sourceType: "file",
      fallbackName: deriveTextFileStem(args.fileName, content),
    }),
  } satisfies ExtractedSourceContent;
}

export function buildTextSourceContent(args: {
  content: string;
  fileName: string;
  sourceFilename?: string;
}) {
  const content = normalizeWhitespace(args.content);
  const mimeType = detectKnowledgeMimeType(args.fileName);

  return {
    content,
    mimeType,
    sourceFilename: buildManagedSourceFileName({
      mimeType,
      sourceFilename: args.sourceFilename,
      sourceType: "text",
      fallbackName: deriveTextFileStem(args.fileName, content),
    }),
  } satisfies ExtractedSourceContent;
}
