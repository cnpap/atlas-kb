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
import { dispatchKnowledgeImportDrainInAdmin } from "./admin-client";
import { hasEmbeddingConfig } from "./config";
import { isKnowledgeSourceContentEditable } from "./document-file-types";
import { deriveUploadTitle } from "./ops-agent-kit";
import { waitForPendingKnowledgeImports } from "./import-jobs";
import {
  enqueueKnowledgeFileImport,
  requeueKnowledgeFileImport,
} from "./import-jobs-repository";
import {
  allocateManagedSourceFileName,
  buildManagedSourceFileName,
  buildTextSourceContent,
} from "./storage";
import { buildSummary } from "./search-utils";
import { getKnowledgeWorkspace, getKnowledgeWorkspaceIndexer } from "./runtime";
import {
  clearKnowledgeIndexState,
  createKnowledgeIndexNow,
  updateKnowledgeIndexNow,
} from "./workspace-indexing";
import {
  createKnowledgeSourceRecord,
  deleteKnowledgeSource,
  listKnowledgeSources,
  replaceSourceContent,
  requireKnowledgeCollection,
  requireKnowledgeSource,
} from "./repository";

type ImportResult = {
  collection: KnowledgeCollection;
  source: KnowledgeSource;
  engine: "hybrid" | "lexical";
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

async function getMutableWorkspace(params: {
  collectionId: string;
  userId: string;
}) {
  const [workspace, workspaceIndexer] = await Promise.all([
    getKnowledgeWorkspace(params),
    getKnowledgeWorkspaceIndexer(params),
  ]);
  const filesystem = workspace.filesystem;

  if (!filesystem) {
    throw new Error("Knowledge workspace filesystem is not available");
  }

  return {
    filesystem,
    workspace,
    workspaceIndexer,
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
  await requireKnowledgeCollection(args.userId, args.collectionId);

  const { filesystem, workspaceIndexer } = await getMutableWorkspace({
    userId: args.userId,
    collectionId: args.collectionId,
  });
  const documentId = args.sourceFilename;
  const normalizedTags = parseTags(args.tags);
  const content = args.content.trim();
  const summary = args.summary?.trim() || buildSummary(content, 160);

  await filesystem.writeFile(documentId, args.fileBody, {
    mimeType: args.mimeType,
    overwrite: false,
  });

  try {
    await createKnowledgeIndexNow({
      path: documentId,
      workspaceIndexer,
    });

    const source = await createKnowledgeSourceRecord({
      sourceId: args.sourceId,
      userId: args.userId,
      collectionId: args.collectionId,
      documentId,
      sourceType: args.sourceType,
      title: args.title,
      summary,
      content,
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
    };
  } catch (error) {
    await clearKnowledgeIndexState({
      userId: args.userId,
      collectionId: args.collectionId,
      path: documentId,
      workspaceIndexer,
    });
    await filesystem
      .deleteFile(documentId, { force: true })
      .catch(() => undefined);
    throw error;
  }
}

async function createQueuedFileSource(args: {
  byteSize?: number;
  collectionId: string;
  fileBody: Uint8Array;
  mimeType?: string;
  sourceFilename: string;
  summary?: string;
  tags: string[];
  title: string;
  userId: string;
}): Promise<KnowledgeImportData> {
  await requireKnowledgeCollection(args.userId, args.collectionId);

  const { filesystem } = await getMutableWorkspace({
    userId: args.userId,
    collectionId: args.collectionId,
  });
  const documentId = args.sourceFilename;
  const normalizedTags = parseTags(args.tags);
  let createdSourceId: string | undefined;

  await filesystem.writeFile(documentId, args.fileBody, {
    mimeType: args.mimeType,
    overwrite: false,
  });

  try {
    const source = await createKnowledgeSourceRecord({
      userId: args.userId,
      collectionId: args.collectionId,
      documentId,
      sourceType: "file",
      title: args.title,
      summary: args.summary?.trim(),
      content: undefined,
      tags: normalizedTags,
      sourceFilename: args.sourceFilename,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
      status: "processing",
      failureMessage: undefined,
    });
    createdSourceId = source.id;

    await enqueueKnowledgeFileImport({
      userId: args.userId,
      collectionId: args.collectionId,
      sourceId: source.id,
    });

    void dispatchKnowledgeImportDrainInAdmin().catch((error) => {
      console.error("[knowledge-import] failed to dispatch admin drain job", {
        collectionId: args.collectionId,
        sourceId: source.id,
        error:
          error instanceof Error
            ? error.message
            : "Unknown admin dispatch error",
      });
    });

    return {
      collection: await requireKnowledgeCollection(
        args.userId,
        args.collectionId,
      ),
      source,
      engine: getImportEngine(),
    };
  } catch (error) {
    if (createdSourceId) {
      await deleteKnowledgeSource(args.userId, createdSourceId).catch(
        () => undefined,
      );
    } else {
      await filesystem
        .deleteFile(documentId, { force: true })
        .catch(() => undefined);
    }

    throw error;
  }
}

export async function importKnowledgeFile(args: {
  userId: string;
  collectionId: string;
  file: File;
  input: SingleFileImportInput;
}): Promise<KnowledgeImportData> {
  await requireKnowledgeCollection(args.userId, args.collectionId);

  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const title = deriveUploadTitle({
    fileName: args.file.name,
    providedTitle: args.input.title,
  });
  const sourceFilename = await resolveManagedImportFileName({
    userId: args.userId,
    collectionId: args.collectionId,
    sourceType: "file",
    title,
    sourceFilename: args.file.name,
    mimeType: args.file.type || undefined,
  });

  return createQueuedFileSource({
    userId: args.userId,
    collectionId: args.collectionId,
    fileBody: bytes,
    mimeType: args.file.type || undefined,
    byteSize: args.file.size,
    sourceFilename,
    summary: args.input.summary?.trim(),
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
  const source = await requireKnowledgeSource(userId, sourceId);
  const requestedContent =
    input.content !== undefined
      ? input.content.trim()
      : source.content?.trim() || "";
  const nextTitle = input.title?.trim() || source.title;
  const nextSummary = input.summary?.trim() || source.summary?.trim();
  const nextTags = parseTags(input.tags ?? source.tags);
  const documentId = source.documentId;
  const sourceFilename = source.sourceFilename;

  if (!documentId || !sourceFilename) {
    throw new BadRequestError(`资料 "${sourceId}" 缺少必要文件信息`);
  }

  if (!isKnowledgeSourceContentEditable(source)) {
    if (
      input.content !== undefined &&
      input.content.trim() !== (source.content?.trim() || "")
    ) {
      throw new BadRequestError(
        "当前 PDF、Word、Excel 资料只支持更新标题、摘要和标签；如需替换正文，请重新上传文件。",
      );
    }

    return replaceSourceContent({
      userId,
      sourceId,
      documentId,
      title: nextTitle,
      summary: nextSummary,
      content: undefined,
      tags: nextTags,
      mimeType: source.mimeType,
      byteSize: source.byteSize ?? undefined,
      sourceFilename,
      status: source.status,
      failureMessage: source.failureMessage,
    });
  }

  if (!requestedContent) {
    throw new BadRequestError("资料内容不能为空");
  }

  const { filesystem, workspaceIndexer } = await getMutableWorkspace({
    userId,
    collectionId: source.collectionId,
  });

  await filesystem.writeFile(documentId, requestedContent, {
    mimeType: source.mimeType,
    overwrite: true,
  });
  await updateKnowledgeIndexNow({
    path: documentId,
    workspaceIndexer,
  });

  return replaceSourceContent({
    userId,
    sourceId,
    documentId,
    title: nextTitle,
    summary: nextSummary,
    content: requestedContent,
    tags: nextTags,
    mimeType: source.mimeType,
    byteSize: new TextEncoder().encode(requestedContent).byteLength,
    sourceFilename,
    status: "ready",
    failureMessage: undefined,
  });
}

export async function retryKnowledgeSourceImport(
  userId: string,
  sourceId: string,
): Promise<KnowledgeSource> {
  const source = await requireKnowledgeSource(userId, sourceId);

  if (source.sourceType !== "file") {
    throw new BadRequestError("只有文件资料支持重试导入。");
  }

  if (source.status !== "failed") {
    throw new BadRequestError("只有失败的文件资料才能重试导入。");
  }

  const documentId = source.documentId || source.sourceFilename;

  if (!documentId) {
    throw new BadRequestError(`资料 "${sourceId}" 缺少必要文件信息`);
  }

  const workspaceIndexer = await getKnowledgeWorkspaceIndexer({
    userId,
    collectionId: source.collectionId,
  }).catch(() => undefined);

  await clearKnowledgeIndexState({
    userId,
    collectionId: source.collectionId,
    path: documentId,
    workspaceIndexer,
  });

  await requeueKnowledgeFileImport({
    userId,
    collectionId: source.collectionId,
    sourceId: source.id,
  });

  const retriedSource = await replaceSourceContent({
    userId,
    sourceId: source.id,
    documentId,
    title: source.title,
    summary: source.summary,
    content: undefined,
    tags: source.tags,
    mimeType: source.mimeType,
    byteSize: source.byteSize,
    sourceFilename: source.sourceFilename ?? documentId,
    status: "processing",
    failureMessage: undefined,
  });

  void dispatchKnowledgeImportDrainInAdmin().catch((error) => {
    console.error("[knowledge-import] failed to dispatch retry drain job", {
      collectionId: source.collectionId,
      sourceId: source.id,
      error:
        error instanceof Error ? error.message : "Unknown admin dispatch error",
    });
  });

  return retriedSource;
}

export { waitForPendingKnowledgeImports };
