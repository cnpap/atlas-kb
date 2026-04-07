import { basename } from "node:path";
import { BadRequestError } from "@atlas-kb/errors";
import type {
  KnowledgeBatchFileImportRequest,
  KnowledgeBatchImportData,
  KnowledgeCollection,
  KnowledgeImportData,
  KnowledgeSource,
  KnowledgeSourceUpdateRequest,
  KnowledgeTextImportRequest,
  KnowledgeUrlImportRequest,
} from "@atlas-kb/schema";
import { hasEmbeddingConfig } from "./config";
import {
  allocateManagedSourceFileName,
  buildManagedSourceFileName,
  buildTextSourceContent,
  deleteManagedSourceFiles,
  extractFileContent,
  overwriteStoredSourceFile,
  storeTextSourceFile,
  storeUploadedSourceFile,
} from "./storage";
import { getKnowledgeWorkspace, invalidateKnowledgeWorkspace } from "./runtime";
import {
  createKnowledgeSourceRecord,
  getStoredSourceRecord,
  listKnowledgeSources,
  replaceSourceContent,
  requireKnowledgeCollection,
  requireKnowledgeSource,
} from "./repository";
import {
  buildContentPreview,
  buildSummary,
  normalizeWhitespace,
} from "./search-utils";

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

function resolveTitle(input: {
  explicitTitle?: string;
  extractedTitle: string;
}) {
  return input.explicitTitle?.trim() || input.extractedTitle;
}

function buildIndexMetadata(args: {
  collectionId: string;
  source: Pick<
    KnowledgeSource,
    "id" | "sourceType" | "sourceFilename" | "sourceUrl" | "status"
  >;
  summary: string;
  tags: string[];
  title: string;
}) {
  return {
    collectionId: args.collectionId,
    sourceFilename: args.source.sourceFilename,
    sourceId: args.source.id,
    sourceType: args.source.sourceType,
    sourceUrl: args.source.sourceUrl,
    status: args.source.status,
    summary: args.summary,
    tags: args.tags,
    title: args.title,
  };
}

async function resolveManagedImportFileName(args: {
  collectionId: string;
  mimeType?: string;
  sourceFilename?: string;
  sourceId?: string;
  sourceType: KnowledgeSource["sourceType"];
  sourceUrl?: string;
  title: string;
  userId: string;
}) {
  const sources = await listKnowledgeSources(args.userId, args.collectionId);
  const usedNames = new Set(
    sources
      .filter((source) => source.id !== args.sourceId)
      .map(
        (source) => source.sourceFilename?.trim() || source.documentId?.trim(),
      )
      .filter((value): value is string => Boolean(value)),
  );

  return allocateManagedSourceFileName(
    buildManagedSourceFileName({
      mimeType: args.mimeType,
      sourceFilename: args.sourceFilename,
      sourceType: args.sourceType,
      sourceUrl: args.sourceUrl,
      title: args.title,
    }),
    usedNames,
  );
}

async function indexSourceDocument(args: {
  collectionId: string;
  content: string;
  documentId: string;
  mimeType?: string;
  source: Pick<
    KnowledgeSource,
    "id" | "sourceType" | "sourceFilename" | "sourceUrl" | "status"
  >;
  summary: string;
  tags: string[];
  title: string;
  userId: string;
}) {
  const workspace = await getKnowledgeWorkspace({
    userId: args.userId,
    collectionId: args.collectionId,
  });

  await workspace.index(args.documentId, args.content, {
    mimeType: args.mimeType,
    metadata: buildIndexMetadata(args),
  });
}

async function createSuccessfulImport(args: {
  byteSize?: number;
  collectionId: string;
  content: string;
  documentId: string;
  mimeType?: string;
  originalPath?: string | null;
  sourceFilename?: string;
  sourceId: string;
  sourceType: KnowledgeSource["sourceType"];
  sourceUrl?: string;
  summary?: string;
  tags: string[];
  title: string;
  userId: string;
}): Promise<KnowledgeImportData> {
  await indexSourceDocument({
    userId: args.userId,
    collectionId: args.collectionId,
    content: args.content,
    documentId: args.documentId,
    mimeType: args.mimeType,
    source: {
      id: args.sourceId,
      sourceFilename: args.sourceFilename,
      sourceType: args.sourceType,
      sourceUrl: args.sourceUrl,
      status: "ready",
    },
    summary: args.summary?.trim() || buildSummary(args.content),
    tags: args.tags,
    title: args.title,
  });

  const source = await createKnowledgeSourceRecord({
    sourceId: args.sourceId,
    userId: args.userId,
    collectionId: args.collectionId,
    documentId: args.documentId,
    sourceType: args.sourceType,
    title: args.title,
    summary: args.summary,
    content: args.content,
    tags: args.tags,
    sourceFilename: args.sourceFilename,
    sourceUrl: args.sourceUrl,
    mimeType: args.mimeType,
    byteSize: args.byteSize,
    status: "ready",
    originalPath: args.originalPath,
    indexPath: args.documentId,
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

async function createFailedImport(args: {
  byteSize?: number;
  collectionId: string;
  content?: string;
  documentId: string;
  error: unknown;
  mimeType?: string;
  sourceFilename?: string;
  sourceId: string;
  sourceType: KnowledgeSource["sourceType"];
  sourceUrl?: string;
  summary?: string;
  tags: string[];
  title: string;
  userId: string;
}): Promise<KnowledgeImportData> {
  const message = args.error instanceof Error ? args.error.message : "导入失败";
  const fallbackContent = normalizeWhitespace(
    args.content ||
      `资料导入失败\n标题：${args.title.trim()}\n原因：${message}`,
  );
  const fallbackSummary = args.summary?.trim() || buildSummary(fallbackContent);
  const fallbackPreview = buildContentPreview(fallbackContent);

  const source = await createKnowledgeSourceRecord({
    sourceId: args.sourceId,
    userId: args.userId,
    collectionId: args.collectionId,
    documentId: args.documentId,
    sourceType: args.sourceType,
    title: args.title,
    summary: fallbackSummary,
    content: fallbackPreview ? fallbackContent : message,
    tags: args.tags,
    sourceFilename: args.sourceFilename,
    sourceUrl: args.sourceUrl,
    mimeType: args.mimeType,
    byteSize: args.byteSize,
    status: "failed",
    failureMessage: message,
    originalPath: null,
    indexPath: args.documentId,
  });

  return {
    collection: await requireKnowledgeCollection(
      args.userId,
      args.collectionId,
    ),
    source,
    engine: getImportEngine(),
    indexed: false,
  };
}

export async function importKnowledgeFile(args: {
  userId: string;
  collectionId: string;
  file: File;
  input: SingleFileImportInput;
}): Promise<KnowledgeImportData> {
  await requireKnowledgeCollection(args.userId, args.collectionId);

  const sourceId = crypto.randomUUID();
  const fileName = args.file.name || `upload-${sourceId}.txt`;
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  let managedFileName = fileName;
  let stored: Awaited<ReturnType<typeof storeUploadedSourceFile>> | undefined;

  try {
    const extracted = await extractFileContent({
      bytes,
      fileName,
      mimeType: args.file.type || undefined,
    });
    const title = resolveTitle({
      explicitTitle: args.input.title,
      extractedTitle: extracted.title,
    });
    const tags = parseTags(args.input.tags);
    const resolvedFileName = await resolveManagedImportFileName({
      userId: args.userId,
      collectionId: args.collectionId,
      sourceType: "file",
      title,
      sourceFilename: fileName,
      mimeType: extracted.mimeType,
    });
    managedFileName = resolvedFileName;
    stored = await storeUploadedSourceFile({
      userId: args.userId,
      collectionId: args.collectionId,
      bytes,
      fileName: resolvedFileName,
      mimeType: extracted.mimeType,
    });

    return await createSuccessfulImport({
      userId: args.userId,
      collectionId: args.collectionId,
      sourceId,
      sourceType: "file",
      documentId: stored.documentPath,
      content: extracted.content,
      title,
      summary: args.input.summary?.trim() || buildSummary(extracted.content),
      tags,
      mimeType: extracted.mimeType,
      byteSize: args.file.size,
      sourceFilename: resolvedFileName,
      originalPath: stored.originalPath,
    });
  } catch (error) {
    await deleteManagedSourceFiles({
      userId: args.userId,
      collectionId: args.collectionId,
      originalPath: stored?.originalPath,
    });
    await invalidateKnowledgeWorkspace({
      userId: args.userId,
      collectionId: args.collectionId,
    });

    return createFailedImport({
      userId: args.userId,
      collectionId: args.collectionId,
      sourceId,
      sourceType: "file",
      documentId: stored?.documentPath ?? managedFileName,
      title: args.input.title?.trim() || basename(fileName),
      summary: args.input.summary,
      tags: parseTags(args.input.tags),
      mimeType: args.file.type || undefined,
      byteSize: args.file.size,
      sourceFilename: managedFileName,
      error,
    });
  }
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

      if (result.indexed && result.source.status === "ready") {
        results.push({
          accepted: true,
          fileName: file.name,
          mimeType: file.type || undefined,
          byteSize: file.size,
          source: result.source,
        });
      } else {
        results.push({
          accepted: false,
          fileName: file.name,
          mimeType: file.type || undefined,
          byteSize: file.size,
          errorMessage: result.source.failureMessage || "导入失败",
        });
      }
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

  const content = normalizeWhitespace(args.input.content);

  if (!content) {
    throw new BadRequestError("文本资料不能为空");
  }

  const sourceId = crypto.randomUUID();
  const tags = parseTags(args.input.tags);
  const title =
    args.input.title?.trim() ||
    buildTextSourceContent({
      content,
      fileName: `${sourceId}.txt`,
    }).title;
  const managedFileName = await resolveManagedImportFileName({
    userId: args.userId,
    collectionId: args.collectionId,
    sourceType: "text",
    title,
    mimeType: "text/plain",
  });
  const stored = await storeTextSourceFile({
    userId: args.userId,
    collectionId: args.collectionId,
    content,
    fileName: managedFileName,
    mimeType: "text/plain; charset=utf-8",
  });

  try {
    return await createSuccessfulImport({
      userId: args.userId,
      collectionId: args.collectionId,
      sourceId,
      sourceType: "text",
      documentId: stored.documentPath,
      content,
      title,
      summary: args.input.summary?.trim() || buildSummary(content),
      tags,
      mimeType: "text/plain",
      byteSize: content.length,
      sourceFilename: managedFileName,
      originalPath: stored.originalPath,
    });
  } catch (error) {
    await deleteManagedSourceFiles({
      userId: args.userId,
      collectionId: args.collectionId,
      originalPath: stored.originalPath,
    });
    await invalidateKnowledgeWorkspace({
      userId: args.userId,
      collectionId: args.collectionId,
    });

    return createFailedImport({
      userId: args.userId,
      collectionId: args.collectionId,
      sourceId,
      sourceType: "text",
      documentId: stored.documentPath,
      title,
      summary: args.input.summary?.trim() || buildSummary(content),
      tags,
      mimeType: "text/plain",
      byteSize: content.length,
      sourceFilename: managedFileName,
      error,
      content,
    });
  }
}

export async function importKnowledgeUrl(args: {
  userId: string;
  collectionId: string;
  input: KnowledgeUrlImportRequest;
}): Promise<KnowledgeImportData> {
  const response = await fetch(args.input.url, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new BadRequestError(`URL 拉取失败: ${response.status}`);
  }

  const content = normalizeWhitespace(await response.text());

  if (!content) {
    throw new BadRequestError("URL 内容为空，无法导入");
  }

  const sourceId = crypto.randomUUID();
  const title = args.input.title?.trim() || args.input.url;
  const tags = parseTags(args.input.tags);
  const managedFileName = await resolveManagedImportFileName({
    userId: args.userId,
    collectionId: args.collectionId,
    sourceType: "url",
    title,
    sourceUrl: args.input.url,
    mimeType: "text/html",
  });
  const stored = await storeTextSourceFile({
    userId: args.userId,
    collectionId: args.collectionId,
    content,
    fileName: managedFileName,
    mimeType: "text/html; charset=utf-8",
  });

  try {
    return await createSuccessfulImport({
      userId: args.userId,
      collectionId: args.collectionId,
      sourceId,
      sourceType: "url",
      documentId: stored.documentPath,
      content,
      title,
      summary: args.input.summary?.trim() || buildSummary(content),
      tags,
      mimeType: "text/html",
      byteSize: content.length,
      sourceFilename: managedFileName,
      originalPath: stored.originalPath,
      sourceUrl: args.input.url,
    });
  } catch (error) {
    await deleteManagedSourceFiles({
      userId: args.userId,
      collectionId: args.collectionId,
      originalPath: stored.originalPath,
    });
    await invalidateKnowledgeWorkspace({
      userId: args.userId,
      collectionId: args.collectionId,
    });

    return createFailedImport({
      userId: args.userId,
      collectionId: args.collectionId,
      sourceId,
      sourceType: "url",
      documentId: stored.documentPath,
      title,
      summary: args.input.summary?.trim() || buildSummary(content),
      tags,
      mimeType: "text/html",
      byteSize: content.length,
      sourceFilename: managedFileName,
      sourceUrl: args.input.url,
      error,
      content,
    });
  }
}

export async function updateKnowledgeSource(
  userId: string,
  sourceId: string,
  input: KnowledgeSourceUpdateRequest,
): Promise<KnowledgeSource> {
  const source = await requireKnowledgeSource(userId, sourceId);
  const stored = await getStoredSourceRecord(userId, sourceId);

  if (!stored) {
    throw new BadRequestError(`资料 "${sourceId}" 不存在`);
  }

  const nextContent = normalizeWhitespace(input.content ?? source.content);
  const nextTitle = input.title?.trim() || source.title;
  const nextSummary = input.summary?.trim() || source.summary;
  const nextTags = parseTags(input.tags ?? source.tags);
  const contentChanged = nextContent !== source.content;
  const nextSourceFilename = await resolveManagedImportFileName({
    userId,
    collectionId: source.collectionId,
    sourceId: source.id,
    sourceType: source.sourceType,
    title: nextTitle,
    sourceFilename: source.sourceFilename,
    sourceUrl: source.sourceUrl,
    mimeType: source.mimeType,
  });
  const currentDocumentId = stored.documentId || stored.indexPath;
  const pathChanged = currentDocumentId !== nextSourceFilename;

  if (!contentChanged && !pathChanged) {
    return replaceSourceContent({
      userId,
      sourceId,
      documentId: currentDocumentId,
      title: nextTitle,
      summary: nextSummary,
      content: nextContent,
      tags: nextTags,
      mimeType: source.mimeType,
      byteSize: source.byteSize,
      sourceFilename: nextSourceFilename,
      sourceUrl: source.sourceUrl,
      status: source.status,
      failureMessage: undefined,
      originalPath: stored.originalPath,
      indexPath: stored.indexPath,
    });
  }

  const nextPaths =
    stored.originalPath && stored.indexPath && !pathChanged
      ? {
          documentId: currentDocumentId,
          indexPath: stored.indexPath,
          originalPath: stored.originalPath,
        }
      : (() => undefined)();

  const resolvedPaths =
    nextPaths ??
    (await storeTextSourceFile({
      userId,
      collectionId: source.collectionId,
      content: nextContent,
      fileName: nextSourceFilename,
      mimeType: source.mimeType,
    }).then((paths) => ({
      documentId: paths.documentPath,
      indexPath: paths.indexPath,
      originalPath: paths.originalPath,
    })));

  try {
    await overwriteStoredSourceFile({
      userId,
      collectionId: source.collectionId,
      originalPath: resolvedPaths.originalPath,
      content: nextContent,
      mimeType: source.mimeType,
    });

    if (
      pathChanged &&
      stored.originalPath &&
      stored.originalPath !== resolvedPaths.originalPath
    ) {
      await deleteManagedSourceFiles({
        userId,
        collectionId: source.collectionId,
        originalPath: stored.originalPath,
      });
      await invalidateKnowledgeWorkspace({
        userId,
        collectionId: source.collectionId,
      });
    }

    await indexSourceDocument({
      userId,
      collectionId: source.collectionId,
      content: nextContent,
      documentId: resolvedPaths.documentId,
      mimeType: source.mimeType,
      source: {
        id: source.id,
        sourceFilename: nextSourceFilename,
        sourceType: source.sourceType,
        sourceUrl: source.sourceUrl,
        status: "ready",
      },
      summary: nextSummary,
      tags: nextTags,
      title: nextTitle,
    });

    return replaceSourceContent({
      userId,
      sourceId,
      documentId: resolvedPaths.documentId,
      title: nextTitle,
      summary: nextSummary,
      content: nextContent,
      tags: nextTags,
      mimeType: source.mimeType,
      byteSize: source.byteSize,
      sourceFilename: nextSourceFilename,
      sourceUrl: source.sourceUrl,
      status: "ready",
      failureMessage: undefined,
      originalPath: resolvedPaths.originalPath,
      indexPath: resolvedPaths.indexPath,
    });
  } catch (error) {
    await overwriteStoredSourceFile({
      userId,
      collectionId: source.collectionId,
      originalPath: resolvedPaths.originalPath,
      content: source.content,
      mimeType: source.mimeType,
    }).catch(() => undefined);
    await invalidateKnowledgeWorkspace({
      userId,
      collectionId: source.collectionId,
    });

    throw error;
  }
}

export async function waitForPendingKnowledgeImports(): Promise<void> {
  return;
}
