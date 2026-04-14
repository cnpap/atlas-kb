import { basename, extname } from "node:path";
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
import { isKnowledgeSourceContentEditable } from "./document-file-types";
import { getKnowledgeWorkspace } from "./runtime";
import {
  createKnowledgeSourceRecord,
  deleteKnowledgeSource,
  listAutoRetryableFailedKnowledgeSources,
  listKnowledgeSources,
  replaceSourceContent,
  requireKnowledgeSource,
  requireKnowledgeSourceRow,
} from "./sources-repository";
import {
  enqueueKnowledgeSourceImport,
  waitForPendingKnowledgeImports,
} from "./source-import-workflow";
import {
  indexKnowledgeSourceContent,
  removeKnowledgeSourceChunks,
} from "./source-indexing";
import {
  allocateManagedSourceFileName,
  buildManagedSourceFileName,
  buildTextSourceContent,
} from "./storage";
import { requireKnowledgeCollection } from "./repository";

type ImportResult = {
  collection: KnowledgeCollection;
  source: KnowledgeSource;
  engine: "hybrid";
};

type SingleFileImportInput = Record<string, never>;

const AUTO_RETRY_FAILED_SOURCE_IMPORTS_INTERVAL_MS = 30 * 60 * 1_000;
let failedSourceAutoRetryTimer: ReturnType<typeof setInterval> | null = null;
let failedSourceAutoRetryRun: Promise<{
  attemptedCount: number;
  queuedCount: number;
}> | null = null;

function getImportEngine(): ImportResult["engine"] {
  return "hybrid";
}

async function resolveManagedImportFileName(args: {
  collectionId: string;
  mimeType?: string;
  sourceFilename?: string;
  sourceId?: string;
  sourceType: KnowledgeSource["sourceType"];
  fallbackName?: string;
  userId: string;
}) {
  const sources = await listKnowledgeSources(args.userId, args.collectionId);
  const usedNames = new Set(
    sources
      .filter((source) => source.id !== args.sourceId)
      .map((source) => source.sourceFilename.trim()),
  );

  return allocateManagedSourceFileName(
    buildManagedSourceFileName({
      mimeType: args.mimeType,
      sourceFilename: args.sourceFilename,
      sourceType: args.sourceType,
      fallbackName: args.fallbackName,
    }),
    usedNames,
  );
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

function decodeWorkspaceTextContent(content: string | Uint8Array): string {
  return typeof content === "string"
    ? content
    : new TextDecoder().decode(content);
}

async function readWorkspaceTextContent(args: {
  documentId: string;
  workspace: Awaited<ReturnType<typeof getKnowledgeWorkspace>>;
}): Promise<string> {
  const filesystem = args.workspace.filesystem;

  if (!filesystem) {
    throw new Error("Knowledge workspace filesystem is not available");
  }

  const fileContent = await filesystem.readFile(args.documentId, {
    encoding: "utf8",
  });
  const content = decodeWorkspaceTextContent(fileContent).trim();

  if (!content) {
    throw new Error("当前文件没有可索引的文本内容");
  }

  return content;
}

function buildRenamedSourceFileName(args: {
  currentSourceFilename: string;
  mimeType?: string;
  requestedSourceFilename?: string;
  sourceType: KnowledgeSource["sourceType"];
}) {
  const requestedSourceFilename = args.requestedSourceFilename?.trim();

  if (!requestedSourceFilename) {
    return args.currentSourceFilename.trim();
  }

  const currentSourceFilename = args.currentSourceFilename.trim();
  const currentExtension = extname(currentSourceFilename);
  const requestedStem = basename(
    requestedSourceFilename,
    extname(requestedSourceFilename),
  ).trim();

  return buildManagedSourceFileName({
    mimeType: args.mimeType,
    sourceFilename:
      currentExtension && requestedStem
        ? `${requestedStem}${currentExtension}`
        : requestedSourceFilename,
    sourceType: args.sourceType,
    fallbackName: currentSourceFilename,
  });
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
  userId: string;
}): Promise<KnowledgeImportData> {
  await requireKnowledgeCollection(args.userId, args.collectionId);

  const { filesystem, workspace } = await getMutableWorkspace({
    userId: args.userId,
    collectionId: args.collectionId,
  });
  const documentId = args.sourceFilename;
  const content = args.content.trim();

  await filesystem.writeFile(documentId, args.fileBody, {
    mimeType: args.mimeType,
    overwrite: false,
  });

  let createdSourceId: string | undefined;

  try {
    const source = await createKnowledgeSourceRecord({
      sourceId: args.sourceId,
      userId: args.userId,
      collectionId: args.collectionId,
      documentId,
      sourceType: args.sourceType,
      content,
      sourceFilename: args.sourceFilename,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
      indexChunkCount: 0,
      status: "processing",
    });
    createdSourceId = source.id;

    const indexed = await indexKnowledgeSourceContent({
      workspace,
      content,
      source: {
        id: source.id,
        documentId,
        mimeType: args.mimeType,
        sourceFilename: args.sourceFilename,
      },
    });

    const readySource = await replaceSourceContent({
      userId: args.userId,
      sourceId: source.id,
      documentId,
      content,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
      sourceFilename: args.sourceFilename,
      indexChunkCount: indexed.chunkCount,
      status: "ready",
      failureMessage: undefined,
    });

    return {
      collection: await requireKnowledgeCollection(
        args.userId,
        args.collectionId,
      ),
      source: readySource,
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

async function createQueuedFileSource(args: {
  byteSize?: number;
  collectionId: string;
  fileBody: Uint8Array;
  mimeType?: string;
  sourceFilename: string;
  userId: string;
}): Promise<KnowledgeImportData> {
  await requireKnowledgeCollection(args.userId, args.collectionId);

  const { filesystem } = await getMutableWorkspace({
    userId: args.userId,
    collectionId: args.collectionId,
  });
  const documentId = args.sourceFilename;
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
      content: undefined,
      sourceFilename: args.sourceFilename,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
      indexChunkCount: 0,
      status: "processing",
      failureMessage: undefined,
    });
    createdSourceId = source.id;

    await enqueueKnowledgeSourceImport({
      userId: args.userId,
      collectionId: args.collectionId,
      sourceId: source.id,
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
  const sourceFilename = await resolveManagedImportFileName({
    userId: args.userId,
    collectionId: args.collectionId,
    sourceType: "file",
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
        input: {},
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
    fileName: args.input.sourceFilename?.trim() || "Untitled Source.txt",
    sourceFilename: args.input.sourceFilename,
  });
  const sourceFilename = await resolveManagedImportFileName({
    userId: args.userId,
    collectionId: args.collectionId,
    sourceType: "text",
    sourceFilename: extracted.sourceFilename,
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
  });
}

export async function updateKnowledgeSource(
  userId: string,
  sourceId: string,
  input: KnowledgeSourceUpdateRequest,
): Promise<KnowledgeSource> {
  const source = await requireKnowledgeSource(userId, sourceId);
  const sourceRow = await requireKnowledgeSourceRow(userId, sourceId);
  const documentId = source.documentId || source.sourceFilename;
  const sourceFilename = source.sourceFilename;

  if (!documentId || !sourceFilename) {
    throw new BadRequestError(`资料 "${sourceId}" 缺少必要文件信息`);
  }

  const isContentEditable = isKnowledgeSourceContentEditable(source);
  const { filesystem, workspace } = await getMutableWorkspace({
    userId,
    collectionId: source.collectionId,
  });
  const currentContent = isContentEditable
    ? source.content?.trim() ||
      (await readWorkspaceTextContent({ documentId, workspace }))
    : undefined;
  const nextContent =
    input.content !== undefined ? input.content.trim() : currentContent;
  const nextSourceFilenameInput = input.sourceFilename?.trim();
  const preferredSourceFilename = buildRenamedSourceFileName({
    currentSourceFilename: sourceFilename,
    mimeType: source.mimeType,
    requestedSourceFilename: nextSourceFilenameInput,
    sourceType: source.sourceType,
  });
  const nextSourceFilename = await resolveManagedImportFileName({
    userId,
    collectionId: source.collectionId,
    sourceId: source.id,
    sourceType: source.sourceType,
    sourceFilename: preferredSourceFilename,
    mimeType: source.mimeType,
  });
  const nextDocumentId = nextSourceFilename;
  const sourceFilenameChanged = nextDocumentId !== documentId;
  const previousChunkCount = Number(sourceRow.index_chunk_count ?? 0);
  const previousContent = currentContent;
  let nextFileCreated = false;

  if (!isContentEditable) {
    if (
      input.content !== undefined &&
      input.content.trim() !== (source.content?.trim() || "")
    ) {
      throw new BadRequestError(
        "当前 PDF、Word、Excel 资料不支持编辑正文；如需替换正文，请重新上传文件。",
      );
    }
  } else if (!nextContent) {
    throw new BadRequestError("资料内容不能为空");
  }

  if (!sourceFilenameChanged && input.content === undefined) {
    return source;
  }

  if (sourceFilenameChanged) {
    try {
      await removeKnowledgeSourceChunks({
        workspace,
        sourceId,
        chunkCount: previousChunkCount,
      });

      if (isContentEditable) {
        await filesystem.writeFile(nextDocumentId, nextContent!, {
          mimeType: source.mimeType,
          overwrite: false,
        });
      } else {
        await filesystem.copyFile(documentId, nextDocumentId);
      }
      nextFileCreated = true;

      const processingSource = await replaceSourceContent({
        userId,
        sourceId,
        documentId: nextDocumentId,
        content: isContentEditable ? nextContent : undefined,
        mimeType: source.mimeType,
        byteSize: isContentEditable
          ? new TextEncoder().encode(nextContent!).byteLength
          : (source.byteSize ?? undefined),
        sourceFilename: nextSourceFilename,
        indexChunkCount: 0,
        status: "processing",
        failureMessage: undefined,
      });

      try {
        await enqueueKnowledgeSourceImport({
          userId,
          collectionId: source.collectionId,
          sourceId: source.id,
        });
      } catch (error) {
        await replaceSourceContent({
          userId,
          sourceId,
          documentId,
          content: isContentEditable ? previousContent : undefined,
          mimeType: source.mimeType,
          byteSize: source.byteSize ?? undefined,
          sourceFilename,
          indexChunkCount: previousChunkCount,
          status: source.status,
          failureMessage: source.failureMessage,
        }).catch(() => undefined);

        if (nextFileCreated) {
          await filesystem
            .deleteFile(nextDocumentId, {
              force: true,
            })
            .catch(() => undefined);
        }

        if (previousChunkCount > 0) {
          const restoreContent = isContentEditable
            ? previousContent
            : await readWorkspaceTextContent({
                documentId,
                workspace,
              }).catch(() => undefined);

          if (restoreContent?.trim()) {
            await indexKnowledgeSourceContent({
              workspace,
              content: restoreContent,
              source: {
                id: source.id,
                documentId,
                mimeType: source.mimeType,
                sourceFilename,
              },
            }).catch(() => undefined);
          }
        }

        throw error;
      }

      await filesystem
        .deleteFile(documentId, {
          force: true,
        })
        .catch(() => undefined);

      return processingSource;
    } catch (error) {
      if (nextFileCreated) {
        await filesystem
          .deleteFile(nextDocumentId, {
            force: true,
          })
          .catch(() => undefined);
      }

      if (previousChunkCount > 0) {
        const restoreContent = isContentEditable
          ? previousContent
          : await readWorkspaceTextContent({
              documentId,
              workspace,
            }).catch(() => undefined);

        if (restoreContent?.trim()) {
          await indexKnowledgeSourceContent({
            workspace,
            content: restoreContent,
            source: {
              id: source.id,
              documentId,
              mimeType: source.mimeType,
              sourceFilename,
            },
          }).catch(() => undefined);
        }
      }

      throw error;
    }
  }

  try {
    await removeKnowledgeSourceChunks({
      workspace,
      sourceId,
      chunkCount: previousChunkCount,
    });

    if (isContentEditable) {
      await filesystem.writeFile(documentId, nextContent!, {
        mimeType: source.mimeType,
        overwrite: true,
      });
    }

    const indexedContent = nextContent!;
    const indexed = await indexKnowledgeSourceContent({
      workspace,
      content: indexedContent,
      source: {
        id: source.id,
        documentId,
        mimeType: source.mimeType,
        sourceFilename,
      },
    });

    const updated = await replaceSourceContent({
      userId,
      sourceId,
      documentId,
      content: nextContent,
      mimeType: source.mimeType,
      byteSize: new TextEncoder().encode(nextContent!).byteLength,
      sourceFilename,
      indexChunkCount: indexed.chunkCount,
      status: "ready",
      failureMessage: undefined,
    });

    return updated;
  } catch (error) {
    if (isContentEditable && previousContent !== undefined) {
      await filesystem
        .writeFile(documentId, previousContent, {
          mimeType: source.mimeType,
          overwrite: true,
        })
        .catch(() => undefined);
    }

    if (previousChunkCount > 0) {
      const restoreContent = isContentEditable
        ? previousContent
        : await readWorkspaceTextContent({
            documentId,
            workspace,
          }).catch(() => undefined);

      if (restoreContent?.trim()) {
        await indexKnowledgeSourceContent({
          workspace,
          content: restoreContent,
          source: {
            id: source.id,
            documentId,
            mimeType: source.mimeType,
            sourceFilename,
          },
        }).catch(() => undefined);
      }
    }

    throw error;
  }
}

export async function retryKnowledgeSourceImport(
  userId: string,
  sourceId: string,
): Promise<KnowledgeSource> {
  const source = await requireKnowledgeSource(userId, sourceId);
  const sourceRow = await requireKnowledgeSourceRow(userId, sourceId);

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

  const { workspace } = await getMutableWorkspace({
    userId,
    collectionId: source.collectionId,
  });

  await removeKnowledgeSourceChunks({
    workspace,
    sourceId: source.id,
    chunkCount: Number(sourceRow.index_chunk_count ?? 0),
  }).catch(() => undefined);

  const retriedSource = await replaceSourceContent({
    userId,
    sourceId: source.id,
    documentId,
    content: undefined,
    mimeType: source.mimeType,
    byteSize: source.byteSize,
    sourceFilename: source.sourceFilename ?? documentId,
    indexChunkCount: 0,
    status: "processing",
    failureMessage: undefined,
  });

  try {
    await enqueueKnowledgeSourceImport({
      userId,
      collectionId: source.collectionId,
      sourceId: source.id,
    });
  } catch (error) {
    await replaceSourceContent({
      userId,
      sourceId: source.id,
      documentId,
      content: undefined,
      mimeType: source.mimeType,
      byteSize: source.byteSize,
      sourceFilename: source.sourceFilename ?? documentId,
      indexChunkCount: 0,
      status: "failed",
      failureMessage:
        error instanceof Error ? error.message : "后台导入任务启动失败",
    }).catch(() => undefined);
    throw error;
  }

  return retriedSource;
}

export function getFailedSourceAutoRetryIntervalMs(): number {
  return AUTO_RETRY_FAILED_SOURCE_IMPORTS_INTERVAL_MS;
}

export function stopFailedKnowledgeSourceAutoRetryScheduler(): void {
  if (!failedSourceAutoRetryTimer) {
    return;
  }

  clearInterval(failedSourceAutoRetryTimer);
  failedSourceAutoRetryTimer = null;
}

export function startFailedKnowledgeSourceAutoRetryScheduler(): void {
  if (failedSourceAutoRetryTimer) {
    return;
  }

  void retryFailedKnowledgeSourceImports();
  failedSourceAutoRetryTimer = setInterval(() => {
    void retryFailedKnowledgeSourceImports();
  }, AUTO_RETRY_FAILED_SOURCE_IMPORTS_INTERVAL_MS);
}

export async function retryFailedKnowledgeSourceImports(args?: {
  limit?: number;
  now?: Date;
  retryAfterMs?: number;
}): Promise<{
  attemptedCount: number;
  queuedCount: number;
}> {
  if (failedSourceAutoRetryRun) {
    return failedSourceAutoRetryRun;
  }

  const run = (async () => {
    const now = args?.now ?? new Date();
    const retryAfterMs =
      args?.retryAfterMs ?? AUTO_RETRY_FAILED_SOURCE_IMPORTS_INTERVAL_MS;
    const retryBefore = new Date(now.getTime() - retryAfterMs);
    const candidates = await listAutoRetryableFailedKnowledgeSources({
      limit: args?.limit,
      retryBefore,
    });
    let queuedCount = 0;

    for (const candidate of candidates) {
      try {
        await retryKnowledgeSourceImport(candidate.userId, candidate.sourceId);
        queuedCount += 1;
      } catch (error) {
        console.error("[knowledge:import] automatic source retry failed", {
          error: error instanceof Error ? error.message : String(error),
          sourceId: candidate.sourceId,
          userId: candidate.userId,
        });
      }
    }

    if (queuedCount > 0) {
      console.info("[knowledge:import] automatic source retries queued", {
        attemptedCount: candidates.length,
        queuedCount,
      });
    }

    return {
      attemptedCount: candidates.length,
      queuedCount,
    };
  })();

  failedSourceAutoRetryRun = run.finally(() => {
    failedSourceAutoRetryRun = null;
  });

  return failedSourceAutoRetryRun;
}

export { waitForPendingKnowledgeImports };
