import { BadRequestError } from "@atlas-kb/errors";
import type {
  KnowledgeBatchFileImportRequest,
  KnowledgeBatchImportData,
  KnowledgeCollection,
  KnowledgeImportData,
  KnowledgeSource,
  KnowledgeSourceUpdateRequest,
  KnowledgeTextImportRequest,
} from "@atlas-kb/schema";
import { hasEmbeddingConfig } from "./config";
import {
  allocateManagedSourceFileName,
  buildManagedSourceFileName,
  buildTextSourceContent,
  extractFileContent,
} from "./storage";
import { buildSummary } from "./search-utils";
import {
  getKnowledgeWorkspace,
  removeDocumentFromKnowledgeWorkspace,
} from "./runtime";
import {
  createKnowledgeSourceRecord,
  listKnowledgeSources,
  replaceSourceContent,
  requireKnowledgeCollection,
  requireKnowledgeSource,
} from "./repository";

type ImportResult = {
  collection: KnowledgeCollection;
  source: KnowledgeSource;
  engine: "hybrid" | "lexical";
  indexed: boolean;
};

type SingleFileImportInput = {
  summary?: string;
  tags?: string[];
  title?: string;
};

function getImportEngine(): ImportResult["engine"] {
  return hasEmbeddingConfig() ? "hybrid" : "lexical";
}

function parseTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

async function resolveManagedImportFileName(args: {
  collectionId: string;
  mimeType?: string;
  sourceFilename?: string;
  sourceId?: string;
  sourceType: KnowledgeSource["sourceType"];
  title: string;
  userId: string;
}) {
  // 上传文件和文本导入共用同一个文件名分配器，保证每个资料最终都落成
  // 当前资料库内唯一的 workspace 相对路径。
  const sources = await listKnowledgeSources(args.userId, args.collectionId);
  const usedNames = new Set(
    sources
      .filter((source) => source.id !== args.sourceId)
      .map((source) => source.sourceFilename?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  return allocateManagedSourceFileName(
    buildManagedSourceFileName({
      mimeType: args.mimeType,
      sourceFilename: args.sourceFilename,
      sourceType: args.sourceType,
      title: args.title,
    }),
    usedNames,
  );
}

function buildIndexMetadata(args: {
  collectionId: string;
  sourceType: KnowledgeSource["sourceType"];
  sourceFilename?: string;
  summary: string;
  tags: string[];
  title: string;
}) {
  return {
    collectionId: args.collectionId,
    sourceFilename: args.sourceFilename,
    sourceType: args.sourceType,
    summary: args.summary,
    tags: args.tags,
    title: args.title,
  };
}

async function getMutableWorkspace(params: {
  collectionId: string;
  userId: string;
}) {
  const workspace = await getKnowledgeWorkspace(params);
  const filesystem = workspace.filesystem;

  if (!filesystem) {
    throw new Error("Knowledge workspace filesystem is not available");
  }

  return {
    filesystem,
    workspace,
  };
}

async function createFileBackedSource(args: {
  byteSize?: number;
  collectionId: string;
  content: string;
  fileBody: string | Uint8Array;
  mimeType?: string;
  sourceFilename: string;
  sourceId?: string;
  sourceType: KnowledgeSource["sourceType"];
  summary?: string;
  tags: string[];
  title: string;
  userId: string;
}): Promise<KnowledgeImportData> {
  // 这是本项目唯一的导入主链路：
  // 1. 先把文件写入当前资料库的 workspace
  // 2. 再对同一个相对路径执行手动索引
  // 3. 最后落一条指向同一路径的资料记录
  await requireKnowledgeCollection(args.userId, args.collectionId);

  const { filesystem, workspace } = await getMutableWorkspace({
    userId: args.userId,
    collectionId: args.collectionId,
  });
  const documentId = args.sourceFilename;
  const normalizedTags = parseTags(args.tags);
  const summary = args.summary?.trim();

  await filesystem.writeFile(documentId, args.fileBody, {
    mimeType: args.mimeType,
    overwrite: false,
  });
  await workspace.index(documentId, args.content, {
    mimeType: args.mimeType,
    metadata: buildIndexMetadata({
      collectionId: args.collectionId,
      sourceFilename: args.sourceFilename,
      sourceType: args.sourceType,
      summary: summary || "",
      tags: normalizedTags,
      title: args.title,
    }),
  });

  const source = await createKnowledgeSourceRecord({
    sourceId: args.sourceId,
    userId: args.userId,
    collectionId: args.collectionId,
    documentId,
    sourceType: args.sourceType,
    title: args.title,
    summary,
    content: args.content,
    tags: normalizedTags,
    sourceFilename: args.sourceFilename,
    mimeType: args.mimeType,
    byteSize: args.byteSize,
    status: "ready",
  });

  return {
    collection: await requireKnowledgeCollection(
      args.userId,
      args.collectionId,
    ),
    source,
    engine: getImportEngine(),
    indexed: true,
  };
}

export async function importKnowledgeFile(args: {
  userId: string;
  collectionId: string;
  file: File;
  input: SingleFileImportInput;
}): Promise<KnowledgeImportData> {
  await requireKnowledgeCollection(args.userId, args.collectionId);

  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const extracted = await extractFileContent({
    bytes,
    fileName: args.file.name,
    mimeType: args.file.type || undefined,
  });
  const title = args.input.title?.trim() || extracted.title;
  const sourceFilename = await resolveManagedImportFileName({
    userId: args.userId,
    collectionId: args.collectionId,
    sourceType: "file",
    title,
    sourceFilename: args.file.name,
    mimeType: extracted.mimeType,
  });

  return createFileBackedSource({
    userId: args.userId,
    collectionId: args.collectionId,
    content: extracted.content,
    fileBody: bytes,
    mimeType: extracted.mimeType,
    byteSize: args.file.size,
    sourceFilename,
    sourceType: "file",
    summary: args.input.summary?.trim() || buildSummary(extracted.content, 160),
    tags: parseTags(args.input.tags),
    title,
  });
}

export async function importKnowledgeFiles(args: {
  userId: string;
  collectionId: string;
  files: File[];
  input: KnowledgeBatchFileImportRequest;
}): Promise<KnowledgeBatchImportData> {
  await requireKnowledgeCollection(args.userId, args.collectionId);
  const results: KnowledgeBatchImportData["results"] = [];

  for (const file of args.files) {
    try {
      const result = await importKnowledgeFile({
        userId: args.userId,
        collectionId: args.collectionId,
        file,
        input: {
          summary: args.input.summary,
          tags: args.input.tags,
          title: undefined,
        },
      });

      results.push({
        accepted: true,
        fileName: file.name,
        mimeType: file.type || undefined,
        byteSize: file.size,
        source: result.source,
      });
    } catch (error) {
      results.push({
        accepted: false,
        fileName: file.name,
        mimeType: file.type || undefined,
        byteSize: file.size,
        errorMessage: error instanceof Error ? error.message : "导入失败",
      });
    }
  }

  return {
    collection: await requireKnowledgeCollection(
      args.userId,
      args.collectionId,
    ),
    results,
    totalCount: results.length,
    acceptedCount: results.filter((item) => item.accepted).length,
    rejectedCount: results.filter((item) => !item.accepted).length,
  };
}

export async function importKnowledgeText(args: {
  userId: string;
  collectionId: string;
  input: KnowledgeTextImportRequest;
}): Promise<KnowledgeImportData> {
  await requireKnowledgeCollection(args.userId, args.collectionId);

  const extracted = buildTextSourceContent({
    content: args.input.content,
    fileName: `${args.input.title?.trim() || "Untitled Source"}.txt`,
    title: args.input.title,
  });
  const sourceFilename = await resolveManagedImportFileName({
    userId: args.userId,
    collectionId: args.collectionId,
    sourceType: "text",
    title: extracted.title,
    sourceFilename: `${extracted.title}.txt`,
    mimeType: extracted.mimeType,
  });

  return createFileBackedSource({
    userId: args.userId,
    collectionId: args.collectionId,
    content: extracted.content,
    fileBody: extracted.content,
    mimeType: "text/plain; charset=utf-8",
    byteSize: new TextEncoder().encode(extracted.content).byteLength,
    sourceFilename,
    sourceType: "text",
    summary: args.input.summary?.trim() || buildSummary(extracted.content, 160),
    tags: parseTags(args.input.tags),
    title: extracted.title,
  });
}

export async function updateKnowledgeSource(
  userId: string,
  sourceId: string,
  input: KnowledgeSourceUpdateRequest,
): Promise<KnowledgeSource> {
  // 编辑资料时，只做三件事：覆盖原文件、移除旧索引、对同一路径重新索引。
  const source = await requireKnowledgeSource(userId, sourceId);
  const nextContent =
    input.content !== undefined ? input.content.trim() : source.content;

  if (!nextContent) {
    throw new BadRequestError("资料内容不能为空");
  }

  const nextTitle = input.title?.trim() || source.title;
  const nextSummary = input.summary?.trim() || source.summary;
  const nextTags = parseTags(input.tags ?? source.tags);
  const documentId = source.documentId;
  const sourceFilename = source.sourceFilename;

  if (!documentId || !sourceFilename) {
    throw new BadRequestError(`资料 "${sourceId}" 缺少必要文件信息`);
  }

  const { filesystem, workspace } = await getMutableWorkspace({
    userId,
    collectionId: source.collectionId,
  });

  await filesystem.writeFile(documentId, nextContent, {
    mimeType: source.mimeType,
    overwrite: true,
  });
  await removeDocumentFromKnowledgeWorkspace({
    userId,
    collectionId: source.collectionId,
    documentId,
  });
  await workspace.index(documentId, nextContent, {
    mimeType: source.mimeType,
    metadata: buildIndexMetadata({
      collectionId: source.collectionId,
      sourceFilename,
      sourceType: source.sourceType,
      summary: nextSummary,
      tags: nextTags,
      title: nextTitle,
    }),
  });

  return replaceSourceContent({
    userId,
    sourceId,
    documentId,
    title: nextTitle,
    summary: nextSummary,
    content: nextContent,
    tags: nextTags,
    mimeType: source.mimeType,
    byteSize: new TextEncoder().encode(nextContent).byteLength,
    sourceFilename,
    status: "ready",
    failureMessage: undefined,
  });
}

export async function waitForPendingKnowledgeImports(): Promise<void> {
  // 兼容历史调用点。当前本项目已经没有后台导入任务，因此这里没有
  // 任何需要等待的异步工作。
  return;
}
