import { BadRequestError } from "@atlas-kb/errors";
import type {
  KnowledgeBatchFileImportRequest,
  KnowledgeBatchImportData,
  KnowledgeCollection,
  KnowledgeFileImportRequest,
  KnowledgeImportData,
  KnowledgeImportJob,
  KnowledgeSource,
  KnowledgeSourceUpdateRequest,
  KnowledgeTextImportRequest,
  KnowledgeUploadMetadata,
  KnowledgeUrlImportRequest,
} from "@atlas-kb/schema";
import {
  buildTextSourceContent,
  extractFileContent,
  storeTextSourceFile,
  storeUploadedSourceFile,
  writeSourceIndexText,
} from "./storage";
import { getKnowledgeServiceForUser } from "./runtime";
import {
  createImportJob,
  createSourceDraft,
  getStoredSourceRecord,
  replaceSourceContent,
  requireKnowledgeCollection,
  requireKnowledgeSource,
  updateImportJob,
} from "./repository";
import { buildSummary, normalizeWhitespace } from "./search-utils";

type ImportResult = {
  collection: KnowledgeCollection;
  source: KnowledgeSource;
  job: KnowledgeImportJob;
  engine: "hybrid";
  indexed: boolean;
};

function parseTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

function resolveTitle(input: {
  explicitTitle?: string;
  extractedTitle: string;
}) {
  return input.explicitTitle?.trim() || input.extractedTitle;
}

async function indexSourceDocument(args: {
  userId: string;
  indexPath: string;
  title: string;
}) {
  const service = await getKnowledgeServiceForUser(args.userId);

  return service.indexKnowledgeDocument({
    target: args.indexPath,
    title: args.title,
  });
}

async function finalizeImport(args: {
  userId: string;
  collectionId: string;
  source: KnowledgeSource;
  job: KnowledgeImportJob;
  title: string;
  summary?: string;
  content: string;
  tags: string[];
  mimeType?: string;
  byteSize?: number;
  sourceFilename?: string;
  sourceUrl?: string;
  originalPath?: string | null;
  indexPath: string;
}) {
  await updateImportJob({
    userId: args.userId,
    jobId: args.job.id,
    stage: "embedding",
    status: "processing",
  });

  const indexed = await indexSourceDocument({
    userId: args.userId,
    indexPath: args.indexPath,
    title: args.title,
  });
  const source = await replaceSourceContent({
    userId: args.userId,
    sourceId: args.source.id,
    documentId: indexed.documentId,
    title: args.title,
    summary: args.summary,
    content: args.content,
    tags: args.tags,
    mimeType: args.mimeType,
    byteSize: args.byteSize,
    sourceFilename: args.sourceFilename,
    sourceUrl: args.sourceUrl,
    status: "ready",
    originalPath: args.originalPath,
    indexPath: args.indexPath,
  });
  const job = await updateImportJob({
    userId: args.userId,
    jobId: args.job.id,
    stage: "completed",
    status: "ready",
  });

  return {
    collection: await requireKnowledgeCollection(
      args.userId,
      args.collectionId,
    ),
    source,
    job,
    engine: "hybrid" as const,
    indexed: true,
  } satisfies ImportResult;
}

async function failImport(args: {
  userId: string;
  source: KnowledgeSource;
  job: KnowledgeImportJob;
  error: unknown;
  summary?: string;
  title: string;
  tags: string[];
  content?: string;
  originalPath?: string | null;
  indexPath: string;
}) {
  const message =
    args.error instanceof Error ? args.error.message : "Import failed";
  const source = await replaceSourceContent({
    userId: args.userId,
    sourceId: args.source.id,
    documentId: args.source.documentId || `failed:${args.source.id}`,
    title: args.title,
    summary: args.summary,
    content: args.content ?? args.source.content,
    tags: args.tags,
    status: "failed",
    failureMessage: message,
    sourceFilename: args.source.sourceFilename,
    sourceUrl: args.source.sourceUrl,
    mimeType: args.source.mimeType,
    byteSize: args.source.byteSize,
    originalPath: args.originalPath,
    indexPath: args.indexPath,
  });
  const job = await updateImportJob({
    userId: args.userId,
    jobId: args.job.id,
    stage: "completed",
    status: "failed",
    errorMessage: message,
  });

  return {
    collection: await requireKnowledgeCollection(
      args.userId,
      source.collectionId,
    ),
    source,
    job,
    engine: "hybrid" as const,
    indexed: false,
  } satisfies ImportResult;
}

async function createDraftSource(args: {
  userId: string;
  collectionId: string;
  sourceId: string;
  sourceType: KnowledgeSource["sourceType"];
  title: string;
  summary?: string;
  tags: string[];
  sourceFilename?: string;
  sourceUrl?: string;
  mimeType?: string;
  byteSize?: number;
  originalPath?: string | null;
  indexPath: string;
}) {
  const source = await createSourceDraft({
    sourceId: args.sourceId,
    userId: args.userId,
    collectionId: args.collectionId,
    sourceType: args.sourceType,
    title: args.title,
    summary: args.summary,
    tags: args.tags,
    sourceFilename: args.sourceFilename,
    sourceUrl: args.sourceUrl,
    mimeType: args.mimeType,
    byteSize: args.byteSize,
    originalPath: args.originalPath,
    indexPath: args.indexPath,
  });
  const job = await createImportJob({
    userId: args.userId,
    sourceId: source.id,
    collectionId: args.collectionId,
    sourceType: args.sourceType,
    stage: "chunking",
    status: "processing",
    attempt: 1,
  });

  return {
    source,
    job,
  };
}

export async function importKnowledgeFile(args: {
  userId: string;
  collectionId: string;
  file: File;
  input: KnowledgeFileImportRequest;
}): Promise<KnowledgeImportData> {
  await requireKnowledgeCollection(args.userId, args.collectionId);

  const sourceId = crypto.randomUUID();
  const fileName = args.file.name || `upload-${sourceId}`;
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const paths = await storeUploadedSourceFile({
    sourceId,
    bytes,
    fileName,
  });
  const extracted = await extractFileContent({
    bytes,
    fileName,
  });
  const indexedText = await writeSourceIndexText(sourceId, extracted.content);
  const title = resolveTitle({
    explicitTitle: args.input.title,
    extractedTitle: extracted.title,
  });
  const tags = parseTags(args.input.tags);
  const draft = await createDraftSource({
    userId: args.userId,
    collectionId: args.collectionId,
    sourceId,
    sourceType: "file",
    title,
    summary: args.input.summary?.trim() || buildSummary(extracted.content),
    tags,
    sourceFilename: fileName,
    mimeType: extracted.mimeType,
    byteSize: args.file.size,
    originalPath: paths.originalPath,
    indexPath: indexedText.indexPath,
  });

  try {
    return await finalizeImport({
      userId: args.userId,
      collectionId: args.collectionId,
      source: draft.source,
      job: draft.job,
      title,
      summary: args.input.summary?.trim() || buildSummary(extracted.content),
      content: extracted.content,
      tags,
      mimeType: extracted.mimeType,
      byteSize: args.file.size,
      sourceFilename: fileName,
      originalPath: paths.originalPath,
      indexPath: indexedText.indexPath,
    });
  } catch (error) {
    return failImport({
      userId: args.userId,
      source: draft.source,
      job: draft.job,
      error,
      summary: args.input.summary?.trim() || buildSummary(extracted.content),
      title,
      tags,
      content: extracted.content,
      originalPath: paths.originalPath,
      indexPath: indexedText.indexPath,
    });
  }
}

export async function importKnowledgeFiles(args: {
  userId: string;
  collectionId: string;
  files: File[];
  input: KnowledgeBatchFileImportRequest;
}): Promise<KnowledgeBatchImportData> {
  const collection = await requireKnowledgeCollection(
    args.userId,
    args.collectionId,
  );
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
        job: result.job,
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
    collection,
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
      fileName: `${sourceId}.md`,
    }).title;
  const original = await storeTextSourceFile({
    sourceId,
    content,
    fileName: `${title}.md`,
  });
  const indexedText = await writeSourceIndexText(sourceId, content);
  const draft = await createDraftSource({
    userId: args.userId,
    collectionId: args.collectionId,
    sourceId,
    sourceType: "text",
    title,
    summary: args.input.summary?.trim() || buildSummary(content),
    tags,
    sourceFilename: `${title}.md`,
    mimeType: "text/plain",
    byteSize: content.length,
    originalPath: original.originalPath,
    indexPath: indexedText.indexPath,
  });

  try {
    return await finalizeImport({
      userId: args.userId,
      collectionId: args.collectionId,
      source: draft.source,
      job: draft.job,
      title,
      summary: args.input.summary?.trim() || buildSummary(content),
      content,
      tags,
      mimeType: "text/plain",
      byteSize: content.length,
      sourceFilename: `${title}.md`,
      originalPath: original.originalPath,
      indexPath: indexedText.indexPath,
    });
  } catch (error) {
    return failImport({
      userId: args.userId,
      source: draft.source,
      job: draft.job,
      error,
      summary: args.input.summary?.trim() || buildSummary(content),
      title,
      tags,
      content,
      originalPath: original.originalPath,
      indexPath: indexedText.indexPath,
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

  const body = normalizeWhitespace(await response.text());

  return importKnowledgeText({
    userId: args.userId,
    collectionId: args.collectionId,
    input: {
      title: args.input.title || args.input.url,
      summary: args.input.summary,
      tags: args.input.tags,
      content: body,
    },
  });
}

async function reindexStoredSource(args: {
  userId: string;
  source: KnowledgeSource;
  nextContent: string;
  nextSummary?: string;
  nextTags: string[];
  nextTitle: string;
}) {
  const stored = await getStoredSourceRecord(args.userId, args.source.id);

  if (!stored) {
    throw new BadRequestError(`资料 "${args.source.id}" 不存在`);
  }

  const indexedText = await writeSourceIndexText(
    args.source.id,
    args.nextContent,
  );
  const indexed = await indexSourceDocument({
    userId: args.userId,
    indexPath: indexedText.indexPath,
    title: args.nextTitle,
  });

  return replaceSourceContent({
    userId: args.userId,
    sourceId: args.source.id,
    documentId: indexed.documentId,
    title: args.nextTitle,
    summary: args.nextSummary,
    content: args.nextContent,
    tags: args.nextTags,
    mimeType: args.source.mimeType,
    byteSize: args.source.byteSize,
    sourceFilename: args.source.sourceFilename,
    sourceUrl: args.source.sourceUrl,
    status: "ready",
    indexPath: indexedText.indexPath,
    originalPath: stored.original_path,
  });
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
  const titleChanged = nextTitle !== source.title;

  if (contentChanged || titleChanged) {
    return reindexStoredSource({
      userId,
      source,
      nextContent,
      nextSummary,
      nextTags,
      nextTitle,
    });
  }

  return replaceSourceContent({
    userId,
    sourceId,
    documentId: source.documentId || `draft:${source.id}`,
    title: nextTitle,
    summary: nextSummary,
    content: nextContent,
    tags: nextTags,
    mimeType: source.mimeType,
    byteSize: source.byteSize,
    sourceFilename: source.sourceFilename,
    sourceUrl: source.sourceUrl,
    status: input.status ?? source.status,
    indexPath: stored.index_path,
    originalPath: stored.original_path,
  });
}

export async function refreshKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<KnowledgeImportData> {
  const source = await requireKnowledgeSource(userId, sourceId);
  const stored = await getStoredSourceRecord(userId, sourceId);

  if (!stored) {
    throw new BadRequestError(`资料 "${sourceId}" 不存在`);
  }
  const job = await createImportJob({
    userId,
    sourceId,
    collectionId: source.collectionId,
    sourceType: source.sourceType,
    stage: "embedding",
    status: "processing",
    attempt: source.latestVersion + 1,
  });

  try {
    const refreshed = await reindexStoredSource({
      userId,
      source,
      nextContent: source.content,
      nextSummary: source.summary,
      nextTags: source.tags,
      nextTitle: source.title,
    });
    const completedJob = await updateImportJob({
      userId,
      jobId: job.id,
      stage: "completed",
      status: "ready",
    });

    return {
      collection: await requireKnowledgeCollection(userId, source.collectionId),
      source: refreshed,
      job: completedJob,
      engine: "hybrid",
      indexed: true,
    };
  } catch (error) {
    return failImport({
      userId,
      source,
      job,
      error,
      summary: source.summary,
      title: source.title,
      tags: source.tags,
      content: source.content,
      originalPath: stored.original_path,
      indexPath: stored.index_path,
    });
  }
}

export async function retryKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<KnowledgeImportData> {
  return refreshKnowledgeSource(userId, sourceId);
}

export async function uploadKnowledgeDocument(args: {
  userId: string;
  spaceId: string;
  file: File;
  metadata: KnowledgeUploadMetadata;
}) {
  const result = await importKnowledgeFile({
    userId: args.userId,
    collectionId: args.spaceId,
    file: args.file,
    input: {
      title: args.metadata.title,
      summary: args.metadata.summary,
      tags: args.metadata.tags,
      fileName: args.file.name,
    },
  });

  return {
    space: result.collection,
    document: result.source,
    indexed: result.indexed,
    engine: result.engine,
  };
}

export async function waitForPendingKnowledgeImports(): Promise<void> {
  return;
}
