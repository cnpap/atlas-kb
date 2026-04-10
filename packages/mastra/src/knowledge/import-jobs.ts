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
  getKnowledgeSourceById,
  replaceSourceContent,
} from "./sources-repository";
import { getKnowledgeWorkspaceIndexer } from "./runtime";

function summarizeImportFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 280);
  }

  return "文件解析或索引失败，请稍后重试。";
}

async function clearSourceIndex(args: {
  documentId: string;
  source: KnowledgeSource;
  userId: string;
}): Promise<void> {
  const workspaceIndexer = await getKnowledgeWorkspaceIndexer({
    userId: args.userId,
    collectionId: args.source.collectionId,
  }).catch(() => undefined);

  await workspaceIndexer
    ?.deleteIndex({ path: args.documentId })
    .catch(() => undefined);
}

async function processQueuedFileSource(args: {
  source: KnowledgeSource;
  userId: string;
}): Promise<void> {
  const documentId = args.source.documentId || args.source.sourceFilename;

  if (!documentId) {
    throw new Error(`资料 "${args.source.id}" 缺少 documentId`);
  }

  const workspaceIndexer = await getKnowledgeWorkspaceIndexer({
    userId: args.userId,
    collectionId: args.source.collectionId,
  });

  await clearSourceIndex({
    userId: args.userId,
    source: args.source,
    documentId,
  });

  await workspaceIndexer.createIndex({
    path: documentId,
    visionMode: "off",
  });

  await replaceSourceContent({
    userId: args.userId,
    sourceId: args.source.id,
    documentId,
    title: args.source.title,
    summary: args.source.summary,
    content: undefined,
    tags: args.source.tags,
    mimeType: args.source.mimeType,
    byteSize: args.source.byteSize,
    sourceFilename: args.source.sourceFilename ?? documentId,
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
        await clearSourceIndex({
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
        content: undefined,
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
