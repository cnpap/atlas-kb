import type {
  KnowledgeImportJobProcessResult,
  KnowledgeSource,
} from "@atlas-kb/schema";
import {
  claimNextKnowledgeImportJob,
  markKnowledgeImportJobCompleted,
  markKnowledgeImportJobFailed,
} from "./import-jobs-repository";
import {
  buildKnowledgeTenantId,
  readKnowledgeWorkspaceTextFile,
  shouldSyncTenantIndex,
} from "./ops-agent-kit";
import {
  getKnowledgeSourceById,
  replaceSourceContent,
} from "./sources-repository";
import {
  getKnowledgeTenantIndexService,
  getKnowledgeWorkspace,
  removeDocumentFromKnowledgeWorkspace,
} from "./runtime";
import { buildSummary } from "./search-utils";
import { extractFileContent } from "./storage";

export const PENDING_FILE_IMPORT_CONTENT =
  "文件已上传，正在后台解析与建立索引。";
export const PENDING_FILE_IMPORT_SUMMARY =
  "文件已上传，正在后台解析与建立索引。";

function toByteArray(
  value: Awaited<
    ReturnType<
      NonNullable<
        Awaited<ReturnType<typeof getKnowledgeWorkspace>>["filesystem"]
      >["readFile"]
    >
  >,
): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  return new Uint8Array(value);
}

function buildIndexMetadata(args: {
  collectionId: string;
  source: Pick<
    KnowledgeSource,
    "sourceFilename" | "sourceType" | "summary" | "tags" | "title"
  >;
}) {
  return {
    collectionId: args.collectionId,
    sourceFilename: args.source.sourceFilename,
    sourceType: args.source.sourceType,
    summary: args.source.summary,
    tags: args.source.tags,
    title: args.source.title,
  };
}

function buildTenantIndexIdentity(args: {
  collectionId: string;
  documentId: string;
  userId: string;
}) {
  return {
    tenantId: buildKnowledgeTenantId({
      userId: args.userId,
      collectionId: args.collectionId,
    }),
    path: args.documentId,
  };
}

function summarizeImportFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 280);
  }

  return "文件解析或索引失败，请稍后重试。";
}

function shouldUseTenantIndexOnly(source: KnowledgeSource): boolean {
  return shouldSyncTenantIndex({
    sourceType: source.sourceType,
    fileName: source.sourceFilename,
    mimeType: source.mimeType,
  });
}

async function resolveQueuedSourceContent(args: {
  documentId: string;
  source: KnowledgeSource;
  userId: string;
}): Promise<{ content: string; mimeType?: string }> {
  const workspace = await getKnowledgeWorkspace({
    userId: args.userId,
    collectionId: args.source.collectionId,
  });
  const filesystem = workspace.filesystem;

  if (!filesystem) {
    throw new Error("Knowledge workspace filesystem is not available");
  }

  if (shouldUseTenantIndexOnly(args.source)) {
    return {
      content: await readKnowledgeWorkspaceTextFile(
        filesystem,
        args.documentId,
      ),
      mimeType: args.source.mimeType,
    };
  }

  const fileBody = await filesystem.readFile(args.documentId);
  const extracted = await extractFileContent({
    bytes: toByteArray(fileBody),
    fileName: args.source.sourceFilename ?? args.documentId,
    mimeType: args.source.mimeType,
  });

  return {
    content: extracted.content,
    mimeType: extracted.mimeType || args.source.mimeType,
  };
}

async function clearSourceIndexes(args: {
  documentId: string;
  source: KnowledgeSource;
  userId: string;
}): Promise<void> {
  await removeDocumentFromKnowledgeWorkspace({
    userId: args.userId,
    collectionId: args.source.collectionId,
    documentId: args.documentId,
  }).catch(() => undefined);

  const tenantIndexService = await getKnowledgeTenantIndexService({
    userId: args.userId,
    collectionId: args.source.collectionId,
  }).catch(() => undefined);

  if (
    tenantIndexService &&
    shouldSyncTenantIndex({
      sourceType: args.source.sourceType,
      fileName: args.source.sourceFilename ?? args.documentId,
      mimeType: args.source.mimeType,
    })
  ) {
    await tenantIndexService
      .deleteIndex(
        buildTenantIndexIdentity({
          userId: args.userId,
          collectionId: args.source.collectionId,
          documentId: args.documentId,
        }),
      )
      .catch(() => undefined);
  }
}

async function processQueuedFileSource(args: {
  source: KnowledgeSource;
  userId: string;
}): Promise<void> {
  const documentId = args.source.documentId || args.source.sourceFilename;

  if (!documentId) {
    throw new Error(`资料 "${args.source.id}" 缺少 documentId`);
  }

  const [workspace, tenantIndexService, resolved] = await Promise.all([
    getKnowledgeWorkspace({
      userId: args.userId,
      collectionId: args.source.collectionId,
    }),
    getKnowledgeTenantIndexService({
      userId: args.userId,
      collectionId: args.source.collectionId,
    }),
    resolveQueuedSourceContent({
      userId: args.userId,
      source: args.source,
      documentId,
    }),
  ]);

  const summary =
    args.source.summary === PENDING_FILE_IMPORT_SUMMARY
      ? buildSummary(resolved.content, 160)
      : args.source.summary;
  const nextSource = {
    ...args.source,
    mimeType: resolved.mimeType ?? args.source.mimeType,
    summary,
  };

  await clearSourceIndexes({
    userId: args.userId,
    source: args.source,
    documentId,
  });

  if (!shouldUseTenantIndexOnly(nextSource)) {
    await workspace.index(documentId, resolved.content, {
      mimeType: nextSource.mimeType,
      metadata: buildIndexMetadata({
        collectionId: nextSource.collectionId,
        source: {
          sourceFilename: nextSource.sourceFilename,
          sourceType: nextSource.sourceType,
          summary: nextSource.summary,
          tags: nextSource.tags,
          title: nextSource.title,
        },
      }),
    });
  }

  if (
    tenantIndexService &&
    shouldSyncTenantIndex({
      sourceType: nextSource.sourceType,
      fileName: nextSource.sourceFilename ?? documentId,
      mimeType: nextSource.mimeType,
    })
  ) {
    await tenantIndexService.createIndex({
      ...buildTenantIndexIdentity({
        userId: args.userId,
        collectionId: nextSource.collectionId,
        documentId,
      }),
      visionMode: "off",
    });
  }

  await replaceSourceContent({
    userId: args.userId,
    sourceId: nextSource.id,
    documentId,
    title: nextSource.title,
    summary: nextSource.summary,
    content: resolved.content,
    tags: nextSource.tags,
    mimeType: nextSource.mimeType,
    byteSize: nextSource.byteSize,
    sourceFilename: nextSource.sourceFilename ?? documentId,
    status: "ready",
    failureMessage: undefined,
  });
}

export async function processNextKnowledgeImportJob(): Promise<KnowledgeImportJobProcessResult> {
  const job = await claimNextKnowledgeImportJob();

  if (!job) {
    return {
      processed: false,
    };
  }

  const userId = String(job.owner_user_id);
  let source = await getKnowledgeSourceById(userId, job.source_id).catch(
    () => undefined,
  );

  if (!source) {
    await markKnowledgeImportJobCompleted(job.id);
    return {
      processed: true,
      jobId: job.id,
      sourceId: job.source_id,
    };
  }

  try {
    if (source.sourceType !== "file") {
      await markKnowledgeImportJobCompleted(job.id);
      return {
        processed: true,
        jobId: job.id,
        sourceId: source.id,
        sourceStatus: source.status,
      };
    }

    await processQueuedFileSource({
      userId,
      source,
    });

    await markKnowledgeImportJobCompleted(job.id);

    return {
      processed: true,
      jobId: job.id,
      sourceId: source.id,
      sourceStatus: "ready",
    };
  } catch (error) {
    const failureMessage = summarizeImportFailureMessage(error);
    source = await getKnowledgeSourceById(userId, job.source_id).catch(
      () => undefined,
    );

    if (source) {
      const documentId = source.documentId || source.sourceFilename;

      if (documentId) {
        await clearSourceIndexes({
          userId,
          source,
          documentId,
        });
      }

      await replaceSourceContent({
        userId,
        sourceId: source.id,
        documentId: source.documentId || source.sourceFilename || source.id,
        title: source.title,
        summary: source.summary,
        content: source.content,
        tags: source.tags,
        mimeType: source.mimeType,
        byteSize: source.byteSize,
        sourceFilename:
          source.sourceFilename ??
          source.documentId ??
          `${source.title.trim() || source.id}.txt`,
        status: "failed",
        failureMessage,
      }).catch(() => undefined);
    }

    await markKnowledgeImportJobFailed(job.id, failureMessage);

    return {
      processed: true,
      jobId: job.id,
      sourceId: job.source_id,
      sourceStatus: "failed",
    };
  }
}

export async function waitForPendingKnowledgeImports(): Promise<void> {
  while (true) {
    const result = await processNextKnowledgeImportJob();

    if (!result.processed) {
      return;
    }
  }
}
