import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import {
  buildContentPreview,
  buildSummary,
  normalizeWhitespace,
} from "./search-utils";
import {
  getKnowledgeExportsDir,
  getKnowledgeSourcesDir,
  getOpsMastraConfig,
} from "./config";

export type ManagedSourcePaths = {
  directory: string;
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

function sanitizeFileStem(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized || "source";
}

function deriveTextTitle(fileName: string, content: string): string {
  const firstLine = normalizeWhitespace(content).split("\n")[0]?.trim();

  if (firstLine) {
    return firstLine.replace(/^#{1,6}\s+/, "").slice(0, 160);
  }

  return basename(fileName, extname(fileName)) || "Untitled Source";
}

function deriveOriginalFileName(fileName?: string): string {
  return sanitizeFileStem(fileName || "source.txt");
}

function buildTikaContentDisposition(fileName: string) {
  const safeFileName = basename(fileName || "source");
  const asciiFilename =
    safeFileName
      .normalize("NFKD")
      .replaceAll(/[^\x20-\x7E]/g, "_")
      .replaceAll(/["\\]/g, "_") || "source";

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(safeFileName)}`;
}

export function getManagedSourcePaths(
  sourceId: string,
  originalFileName?: string,
): ManagedSourcePaths {
  const directory = resolve(getKnowledgeSourcesDir(), sourceId);
  const originalExtension = extname(originalFileName || "").trim() || ".bin";

  return {
    directory,
    originalPath: join(directory, `original${originalExtension}`),
    indexPath: join(directory, "index.txt"),
  };
}

export async function ensureManagedSourceDirectory(sourceId: string) {
  const directory = resolve(getKnowledgeSourcesDir(), sourceId);
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function storeUploadedSourceFile(args: {
  sourceId: string;
  bytes: Uint8Array;
  fileName: string;
}) {
  const paths = getManagedSourcePaths(args.sourceId, args.fileName);
  await mkdir(paths.directory, { recursive: true });
  await writeFile(paths.originalPath, args.bytes);
  return paths;
}

export async function storeTextSourceFile(args: {
  sourceId: string;
  content: string;
  fileName?: string;
}) {
  const fileName = deriveOriginalFileName(args.fileName);
  const paths = getManagedSourcePaths(args.sourceId, fileName);
  await mkdir(paths.directory, { recursive: true });
  await writeFile(
    paths.originalPath,
    normalizeWhitespace(args.content),
    "utf8",
  );
  return paths;
}

export async function writeSourceIndexText(sourceId: string, content: string) {
  const paths = getManagedSourcePaths(sourceId);
  await mkdir(paths.directory, { recursive: true });
  const normalized = normalizeWhitespace(content);
  await writeFile(paths.indexPath, normalized, "utf8");
  return {
    content: normalized,
    indexPath: paths.indexPath,
  };
}

export async function readStoredOriginalFile(originalPath: string) {
  return new Uint8Array(await readFile(originalPath));
}

export async function readStoredIndexText(indexPath: string) {
  return normalizeWhitespace(await readFile(indexPath, "utf8"));
}

export async function deleteManagedSourceFiles(sourceId: string) {
  await rm(resolve(getKnowledgeSourcesDir(), sourceId), {
    recursive: true,
    force: true,
  });
}

export async function extractFileContent(args: {
  bytes: Uint8Array;
  fileName: string;
}) {
  const config = getOpsMastraConfig();
  const response = await fetch(`${config.tikaBaseUrl}/rmeta/text`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/octet-stream",
      "Content-Disposition": buildTikaContentDisposition(args.fileName),
    },
    body: args.bytes,
  });

  if (!response.ok) {
    throw new Error(`Tika 解析失败: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as Array<Record<string, unknown>>;
  const metadata = payload[0] ?? {};
  const content = normalizeWhitespace(String(metadata["X-TIKA:content"] ?? ""));

  if (!content) {
    throw new Error("当前文件无法提取出可用文本内容");
  }

  return {
    content,
    contentPreview: buildContentPreview(content),
    excerpt: buildSummary(content, 160),
    mimeType: String(
      metadata["Content-Type"] ?? "application/octet-stream",
    ).split(";")[0]!,
    title:
      String(metadata["dc:title"] ?? metadata.resourceName ?? "").trim() ||
      basename(args.fileName, extname(args.fileName)) ||
      "Untitled Source",
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
    mimeType: "text/plain",
    title: args.title?.trim() || deriveTextTitle(args.fileName, content),
  } satisfies ExtractedSourceContent;
}

export async function ensureKnowledgeExportDirectory() {
  const directory = getKnowledgeExportsDir();
  await mkdir(directory, { recursive: true });
  return directory;
}
