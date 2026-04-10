import type { KnowledgeSource } from "@atlas-kb/schema";
import { ensureKnowledgeDatabase } from "./db";
import { nowIso, toDbUserId } from "./repository-shared";

export type ImportJobRow = {
  attempt: number;
  collection_id: string;
  error_message: string | null;
  finished_at: Date | string | null;
  id: string;
  owner_user_id: string;
  source_id: string;
  source_type: string;
  stage: string;
  started_at: Date | string;
  status: string;
};

const IMPORT_JOB_COLUMNS = [
  "id",
  "owner_user_id",
  "collection_id",
  "source_id",
  "source_type",
  "stage",
  "status",
  "attempt",
  "error_message",
  "started_at",
  "finished_at",
] as const;

async function createKnowledgeImportJob(params: {
  collectionId: string;
  sourceId: string;
  sourceType: KnowledgeSource["sourceType"];
  userId: string;
}): Promise<void> {
  const db = await ensureKnowledgeDatabase();

  await db
    .insertInto("kb_import_jobs")
    .values({
      id: crypto.randomUUID(),
      owner_user_id: toDbUserId(params.userId),
      collection_id: params.collectionId,
      source_id: params.sourceId,
      source_type: params.sourceType,
      stage: "queued",
      status: "pending",
      attempt: 0,
      error_message: null,
      started_at: nowIso(),
      finished_at: null,
    })
    .execute();
}

export async function enqueueKnowledgeFileImport(args: {
  collectionId: string;
  sourceId: string;
  userId: string;
}): Promise<void> {
  await createKnowledgeImportJob({
    userId: args.userId,
    collectionId: args.collectionId,
    sourceId: args.sourceId,
    sourceType: "file",
  });
}

export async function findLatestKnowledgeImportJobForSource(args: {
  sourceId: string;
  userId: string;
}): Promise<ImportJobRow | undefined> {
  const db = await ensureKnowledgeDatabase();

  return (await db
    .selectFrom("kb_import_jobs")
    .select(IMPORT_JOB_COLUMNS)
    .where("owner_user_id", "=", toDbUserId(args.userId))
    .where("source_id", "=", args.sourceId)
    .orderBy("started_at", "desc")
    .orderBy("id", "desc")
    .limit(1)
    .executeTakeFirst()) as ImportJobRow | undefined;
}

export async function requeueKnowledgeFileImport(args: {
  collectionId: string;
  sourceId: string;
  userId: string;
}): Promise<void> {
  const latestJob = await findLatestKnowledgeImportJobForSource({
    userId: args.userId,
    sourceId: args.sourceId,
  });

  if (latestJob) {
    await markKnowledgeImportJobPending(latestJob.id);
    return;
  }

  await enqueueKnowledgeFileImport(args);
}

export async function claimNextKnowledgeImportJob(): Promise<
  ImportJobRow | undefined
> {
  const db = await ensureKnowledgeDatabase();

  return db.transaction().execute(async (trx) => {
    const row = (await trx
      .selectFrom("kb_import_jobs")
      .select(IMPORT_JOB_COLUMNS)
      .where("status", "=", "pending")
      .orderBy("started_at", "asc")
      .forUpdate()
      .skipLocked()
      .limit(1)
      .executeTakeFirst()) as ImportJobRow | undefined;

    if (!row) {
      return undefined;
    }

    const startedAt = nowIso();
    const attempt = Number(row.attempt ?? 0) + 1;

    await trx
      .updateTable("kb_import_jobs")
      .set({
        attempt,
        error_message: null,
        finished_at: null,
        stage: "indexing",
        started_at: startedAt,
        status: "processing",
      })
      .where("id", "=", row.id)
      .execute();

    return {
      ...row,
      attempt,
      error_message: null,
      finished_at: null,
      stage: "indexing",
      started_at: startedAt,
      status: "processing",
    };
  });
}

export async function markKnowledgeImportJobCompleted(
  jobId: string,
): Promise<void> {
  const db = await ensureKnowledgeDatabase();

  await db
    .updateTable("kb_import_jobs")
    .set({
      error_message: null,
      finished_at: nowIso(),
      stage: "completed",
      status: "completed",
    })
    .where("id", "=", jobId)
    .execute();
}

export async function markKnowledgeImportJobFailed(
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const db = await ensureKnowledgeDatabase();

  await db
    .updateTable("kb_import_jobs")
    .set({
      error_message: errorMessage,
      finished_at: nowIso(),
      stage: "failed",
      status: "failed",
    })
    .where("id", "=", jobId)
    .execute();
}

export async function markKnowledgeImportJobPending(
  jobId: string,
): Promise<void> {
  const db = await ensureKnowledgeDatabase();

  await db
    .updateTable("kb_import_jobs")
    .set({
      error_message: null,
      finished_at: null,
      stage: "queued",
      started_at: nowIso(),
      status: "pending",
    })
    .where("id", "=", jobId)
    .execute();
}

export async function deleteKnowledgeImportJobsForCollection(params: {
  collectionId: string;
  userId: string;
}): Promise<void> {
  const db = await ensureKnowledgeDatabase();

  await db
    .deleteFrom("kb_import_jobs")
    .where("owner_user_id", "=", toDbUserId(params.userId))
    .where("collection_id", "=", params.collectionId)
    .execute();
}

export async function deleteKnowledgeImportJobsForSource(params: {
  sourceId: string;
  userId: string;
}): Promise<void> {
  const db = await ensureKnowledgeDatabase();

  await db
    .deleteFrom("kb_import_jobs")
    .where("owner_user_id", "=", toDbUserId(params.userId))
    .where("source_id", "=", params.sourceId)
    .execute();
}
