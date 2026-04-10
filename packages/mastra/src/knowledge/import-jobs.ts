import type {
  KnowledgeImportJobProcessResult,
  KnowledgeSource,
} from "@atlas-kb/schema";
import { dispatchKnowledgeImportDrainInAdmin } from "./admin-client";
import {
  claimNextKnowledgeImportJob,
  markKnowledgeImportJobCompleted,
  markKnowledgeImportJobFailed,
  markKnowledgeImportJobPending,
} from "./import-jobs-repository";
import {
  getKnowledgeSourceById,
  replaceSourceContent,
} from "./sources-repository";
import { getKnowledgeWorkspaceIndexer } from "./runtime";
import {
  type BackgroundIndexOutcome,
  clearKnowledgeIndexState,
  runBackgroundKnowledgeIndex,
} from "./workspace-indexing";

function summarizeImportFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 280);
  }

  return "文件解析或索引失败，请稍后重试。";
}

async function processQueuedFileSource(args: {
  source: KnowledgeSource;
  userId: string;
}): Promise<BackgroundIndexOutcome> {
  const documentId = args.source.documentId || args.source.sourceFilename;

  if (!documentId) {
    throw new Error(`资料 "${args.source.id}" 缺少 documentId`);
  }

  const workspaceIndexer = await getKnowledgeWorkspaceIndexer({
    userId: args.userId,
    collectionId: args.source.collectionId,
  });
  return runBackgroundKnowledgeIndex({
    path: documentId,
    workspaceIndexer,
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

    const documentId = source.documentId || source.sourceFilename;

    if (!documentId) {
      throw new Error(`资料 "${source.id}" 缺少 documentId`);
    }

    const outcome = await processQueuedFileSource({
      userId,
      source,
    });

    if (outcome.kind === "processing") {
      await replaceSourceContent({
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
      await markKnowledgeImportJobPending(job.id);
      const sourceId = source.id;
      const collectionId = source.collectionId;

      void dispatchKnowledgeImportDrainInAdmin().catch((error) => {
        console.error("[knowledge-import] failed to redispatch admin drain", {
          collectionId,
          sourceId,
          error:
            error instanceof Error
              ? error.message
              : "Unknown admin dispatch error",
        });
      });

      return {
        processed: true,
        jobId: job.id,
        sourceId: source.id,
        sourceStatus: "processing",
      };
    }

    if (outcome.kind === "failed") {
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

      await replaceSourceContent({
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
        status: "failed",
        failureMessage: outcome.failureMessage,
      }).catch(() => undefined);

      await markKnowledgeImportJobFailed(job.id, outcome.failureMessage);

      return {
        processed: true,
        jobId: job.id,
        sourceId: source.id,
        sourceStatus: "failed",
      };
    }

    await replaceSourceContent({
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
      status: "ready",
      failureMessage: undefined,
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
