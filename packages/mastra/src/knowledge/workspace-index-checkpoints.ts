import type {
  KnowledgeSource,
  KnowledgeSourceIndexProgress,
} from "@atlas-kb/schema";
import type {
  WorkspaceIndexCheckpoint,
  WorkspaceIndexCheckpointChunk,
  WorkspaceIndexCheckpointKey,
  WorkspaceIndexCheckpointStore,
  WorkspaceIndexFailure,
} from "@cnpap/ops-agent-kit";
import { sql } from "kysely";
import { ensureKnowledgeDatabase } from "./db";
import { nowIso, toDbUserId } from "./repository-shared";

type CheckpointRow = {
  checkpoint_json: unknown;
  collection_id: string;
  path: string;
  updated_at: Date | string;
};

function normalizeCheckpoint(value: unknown): WorkspaceIndexCheckpoint {
  if (typeof value === "string") {
    return JSON.parse(value) as WorkspaceIndexCheckpoint;
  }

  return value as WorkspaceIndexCheckpoint;
}

function buildPageSummary(checkpoint: WorkspaceIndexCheckpoint): {
  completedPages: number;
  failedPages: number;
} {
  const pageMap = new Map<
    number,
    {
      completed: number;
      failed: number;
      total: number;
    }
  >();

  for (const chunk of checkpoint.chunks) {
    for (const pageNumber of chunk.pageNumbers) {
      const current = pageMap.get(pageNumber) ?? {
        completed: 0,
        failed: 0,
        total: 0,
      };

      current.total += 1;

      if (chunk.status === "completed") {
        current.completed += 1;
      }

      if (chunk.status === "failed") {
        current.failed += 1;
      }

      pageMap.set(pageNumber, current);
    }
  }

  let completedPages = 0;
  let failedPages = 0;

  for (const page of pageMap.values()) {
    if (page.failed > 0) {
      failedPages += 1;
      continue;
    }

    if (page.completed === page.total) {
      completedPages += 1;
    }
  }

  return {
    completedPages,
    failedPages,
  };
}

function listFailedChunkDetails(
  checkpoint: WorkspaceIndexCheckpoint,
): WorkspaceIndexFailure[] {
  return checkpoint.chunks
    .filter(
      (chunk): chunk is WorkspaceIndexCheckpointChunk & { error: string } =>
        chunk.status === "failed" && typeof chunk.error === "string",
    )
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((chunk) => ({
      chunkId: chunk.chunkId,
      ordinal: chunk.ordinal,
      pageNumbers: chunk.pageNumbers,
      error: chunk.error,
    }));
}

function isResumeableCheckpoint(checkpoint: WorkspaceIndexCheckpoint): boolean {
  return (
    checkpoint.status === "indexing" ||
    checkpoint.status === "paused" ||
    checkpoint.status === "failed"
  );
}

export function checkpointToSourceIndexProgress(
  checkpoint: WorkspaceIndexCheckpoint,
): KnowledgeSourceIndexProgress {
  const completedChunks = checkpoint.chunks.filter(
    (chunk) => chunk.status === "completed",
  ).length;
  const failedChunks = checkpoint.chunks.filter(
    (chunk) => chunk.status === "failed",
  ).length;
  const { completedPages, failedPages } = buildPageSummary(checkpoint);

  return {
    path: checkpoint.path,
    status: checkpoint.status,
    totalChunks: checkpoint.totalChunks,
    completedChunks,
    failedChunks,
    totalPages: checkpoint.totalPages,
    completedPages,
    failedPages,
    lastProcessedPage: checkpoint.lastProcessedPage,
    resumeable: isResumeableCheckpoint(checkpoint),
    failedChunkDetails: listFailedChunkDetails(checkpoint),
    lastError: checkpoint.lastError,
    updatedAt: checkpoint.updatedAt,
  };
}

export function createDatabaseWorkspaceIndexCheckpointStore(args: {
  collectionId: string;
  userId: string;
}): WorkspaceIndexCheckpointStore {
  return {
    async load(key: WorkspaceIndexCheckpointKey) {
      const db = await ensureKnowledgeDatabase();
      const rows = (
        await sql<CheckpointRow>`
          SELECT checkpoint_json, collection_id, path, updated_at
          FROM kb_workspace_index_checkpoints
          WHERE scope_key = ${key.scopeKey}
            AND path = ${key.path}
          LIMIT 1
        `.execute(db)
      ).rows;
      const row = rows[0];

      return row ? normalizeCheckpoint(row.checkpoint_json) : null;
    },

    async save(checkpoint: WorkspaceIndexCheckpoint) {
      const db = await ensureKnowledgeDatabase();
      const createdAt = nowIso();
      const updatedAt = checkpoint.updatedAt || createdAt;
      const checkpointJson = JSON.stringify(checkpoint);

      await sql`
        INSERT INTO kb_workspace_index_checkpoints (
          scope_key,
          path,
          owner_user_id,
          collection_id,
          status,
          checkpoint_json,
          created_at,
          updated_at
        )
        VALUES (
          ${checkpoint.scopeKey},
          ${checkpoint.path},
          ${toDbUserId(args.userId)},
          ${args.collectionId},
          ${checkpoint.status},
          ${checkpointJson}::jsonb,
          ${createdAt},
          ${updatedAt}
        )
        ON CONFLICT (scope_key, path)
        DO UPDATE SET
          owner_user_id = EXCLUDED.owner_user_id,
          collection_id = EXCLUDED.collection_id,
          status = EXCLUDED.status,
          checkpoint_json = EXCLUDED.checkpoint_json,
          updated_at = EXCLUDED.updated_at
      `.execute(db);
    },

    async delete(key: WorkspaceIndexCheckpointKey) {
      const db = await ensureKnowledgeDatabase();

      await sql`
        DELETE FROM kb_workspace_index_checkpoints
        WHERE scope_key = ${key.scopeKey}
          AND path = ${key.path}
      `.execute(db);
    },

    async clearScope(args) {
      const db = await ensureKnowledgeDatabase();

      await sql`
        DELETE FROM kb_workspace_index_checkpoints
        WHERE scope_key = ${args.scopeKey}
      `.execute(db);
    },
  };
}

export async function deleteKnowledgeSourceIndexProgress(args: {
  collectionId: string;
  path: string;
  userId: string;
}): Promise<void> {
  const db = await ensureKnowledgeDatabase();

  await sql`
    DELETE FROM kb_workspace_index_checkpoints
    WHERE owner_user_id = ${toDbUserId(args.userId)}
      AND collection_id = ${args.collectionId}
      AND path = ${args.path}
  `.execute(db);
}

export async function loadKnowledgeSourceIndexProgressMap(args: {
  collectionId?: string;
  userId: string;
}): Promise<Map<string, KnowledgeSourceIndexProgress>> {
  const db = await ensureKnowledgeDatabase();
  const collectionFilter = args.collectionId
    ? sql`AND collection_id = ${args.collectionId}`
    : sql``;
  const rows = (
    await sql<CheckpointRow>`
      SELECT checkpoint_json, collection_id, path, updated_at
      FROM kb_workspace_index_checkpoints
      WHERE owner_user_id = ${toDbUserId(args.userId)}
        ${collectionFilter}
      ORDER BY updated_at DESC
    `.execute(db)
  ).rows;
  const progressBySourceKey = new Map<string, KnowledgeSourceIndexProgress>();

  for (const row of rows) {
    const key = `${row.collection_id}:${row.path}`;

    if (progressBySourceKey.has(key)) {
      continue;
    }

    progressBySourceKey.set(
      key,
      checkpointToSourceIndexProgress(normalizeCheckpoint(row.checkpoint_json)),
    );
  }

  return progressBySourceKey;
}

export async function attachKnowledgeSourceIndexProgress(
  userId: string,
  sources: KnowledgeSource[],
  collectionId?: string,
): Promise<KnowledgeSource[]> {
  if (sources.length === 0) {
    return sources;
  }

  const progressMap = await loadKnowledgeSourceIndexProgressMap({
    userId,
    collectionId,
  });

  return sources.map((source) => {
    const path = source.documentId || source.sourceFilename;
    const progress = path
      ? progressMap.get(`${source.collectionId}:${path}`)
      : undefined;

    return progress
      ? {
          ...source,
          indexProgress: progress,
        }
      : source;
  });
}
