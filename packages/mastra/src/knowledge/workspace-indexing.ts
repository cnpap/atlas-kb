import type {
  WorkspaceIndexResult,
  WorkspaceIndexer,
} from "@cnpap/ops-agent-kit";
import { getWorkspaceIndexMaxPagesPerRun } from "./config";
import { deleteKnowledgeSourceIndexProgress } from "./workspace-index-checkpoints";

export type BackgroundIndexOutcome =
  | {
      failureMessage?: undefined;
      kind: "completed";
      result: WorkspaceIndexResult;
    }
  | {
      failureMessage?: undefined;
      kind: "processing";
      result: WorkspaceIndexResult;
    }
  | {
      failureMessage: string;
      kind: "failed";
      result: WorkspaceIndexResult;
    };

function summarizeIndexFailure(result: {
  failedChunkDetails: Array<{ error: string }>;
  lastError: string | null;
}): string {
  const direct = result.lastError?.trim();

  if (direct) {
    return direct.slice(0, 280);
  }

  const failedChunkError = result.failedChunkDetails[0]?.error?.trim();

  if (failedChunkError) {
    return failedChunkError.slice(0, 280);
  }

  return "文件解析或索引失败，请稍后重试。";
}

function requireCompletedIndexResult(
  result: WorkspaceIndexResult,
): WorkspaceIndexResult {
  if (result.status === "completed") {
    return result;
  }

  throw new Error(summarizeIndexFailure(result));
}

export async function createKnowledgeIndexNow(args: {
  path: string;
  workspaceIndexer: WorkspaceIndexer;
}): Promise<WorkspaceIndexResult> {
  return requireCompletedIndexResult(
    await args.workspaceIndexer.createIndex({
      path: args.path,
    }),
  );
}

export async function updateKnowledgeIndexNow(args: {
  path: string;
  workspaceIndexer: WorkspaceIndexer;
}): Promise<WorkspaceIndexResult> {
  return requireCompletedIndexResult(
    await args.workspaceIndexer.updateIndex({
      path: args.path,
    }),
  );
}

export async function runBackgroundKnowledgeIndex(args: {
  path: string;
  workspaceIndexer: WorkspaceIndexer;
}): Promise<BackgroundIndexOutcome> {
  const existingStatus = await args.workspaceIndexer.getIndexStatus({
    path: args.path,
  });
  const result = existingStatus?.resumeable
    ? await args.workspaceIndexer.resumeIndex({
        path: args.path,
        maxPagesPerRun: getWorkspaceIndexMaxPagesPerRun(),
      })
    : existingStatus?.status === "completed"
      ? existingStatus
      : await args.workspaceIndexer
          .deleteIndex({
            path: args.path,
          })
          .catch(() => undefined)
          .then(() =>
            args.workspaceIndexer.createIndex({
              path: args.path,
              maxPagesPerRun: getWorkspaceIndexMaxPagesPerRun(),
            }),
          );

  if (result.status === "completed") {
    return {
      kind: "completed",
      result,
    };
  }

  if (result.status === "paused" || result.status === "indexing") {
    return {
      kind: "processing",
      result,
    };
  }

  return {
    kind: "failed",
    failureMessage: summarizeIndexFailure(result),
    result,
  };
}

export async function clearKnowledgeIndexState(args: {
  collectionId: string;
  path: string;
  userId: string;
  workspaceIndexer?: WorkspaceIndexer | null;
}): Promise<void> {
  await args.workspaceIndexer
    ?.deleteIndex({
      path: args.path,
    })
    .catch(() => undefined);

  await deleteKnowledgeSourceIndexProgress({
    userId: args.userId,
    collectionId: args.collectionId,
    path: args.path,
  }).catch(() => undefined);
}
