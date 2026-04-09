import { NotFoundError } from "@atlas-kb/errors";
import type { KnowledgeCollection, KnowledgeSource } from "@atlas-kb/schema";
import { buildKnowledgeTenantId, shouldSyncTenantIndex } from "./ops-agent-kit";
import { deleteKnowledgeImportJobsForSource } from "./import-jobs-repository";
import { ensureKnowledgeDatabase } from "./db";
import {
  getKnowledgeTenantIndexService,
  getKnowledgeWorkspace,
  removeDocumentFromKnowledgeWorkspace,
} from "./runtime";
import { buildSummary, normalizeWhitespace } from "./search-utils";
import {
  nowIso,
  SOURCE_COLUMNS,
  toDbUserId,
  toSource,
  type SourceRow,
} from "./repository-shared";
import {
  requireKnowledgeCollection,
  touchCollection,
} from "./collections-repository";

async function getSourceRow(
  userId: string,
  sourceId: string,
): Promise<SourceRow | null> {
  const db = await ensureKnowledgeDatabase();

  return (
    (await db
      .selectFrom("kb_sources")
      .select(SOURCE_COLUMNS)
      .where("owner_user_id", "=", toDbUserId(userId))
      .where("id", "=", sourceId)
      .executeTakeFirst()) ?? null
  );
}

export async function listKnowledgeSources(
  userId: string,
  collectionId?: string,
): Promise<KnowledgeSource[]> {
  const db = await ensureKnowledgeDatabase();
  let query = db
    .selectFrom("kb_sources")
    .select(SOURCE_COLUMNS)
    .where("owner_user_id", "=", toDbUserId(userId));

  if (collectionId) {
    query = query.where("collection_id", "=", collectionId);
  }

  const rows = await query.orderBy("updated_at", "desc").execute();
  return rows.map((row) => toSource(row));
}

export async function getKnowledgeCollectionSourcesData(
  userId: string,
  collectionId: string,
): Promise<{ collection: KnowledgeCollection; sources: KnowledgeSource[] }> {
  const [collection, sources] = await Promise.all([
    requireKnowledgeCollection(userId, collectionId),
    listKnowledgeSources(userId, collectionId),
  ]);

  return {
    collection,
    sources,
  };
}

export async function getKnowledgeSourceById(
  userId: string,
  sourceId: string,
): Promise<KnowledgeSource | undefined> {
  const row = await getSourceRow(userId, sourceId);
  return row ? toSource(row) : undefined;
}

export async function requireKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<KnowledgeSource> {
  const source = await getKnowledgeSourceById(userId, sourceId);

  if (!source) {
    throw new NotFoundError(`Source "${sourceId}" not found`);
  }

  return source;
}

export async function createKnowledgeSourceRecord(params: {
  sourceId?: string;
  userId: string;
  collectionId: string;
  documentId: string;
  sourceType: KnowledgeSource["sourceType"];
  title: string;
  summary?: string;
  content: string;
  tags: string[];
  sourceFilename?: string;
  mimeType?: string;
  byteSize?: number;
  status: KnowledgeSource["status"];
  failureMessage?: string;
}): Promise<KnowledgeSource> {
  await requireKnowledgeCollection(params.userId, params.collectionId);
  const db = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id = params.sourceId ?? crypto.randomUUID();
  const content = normalizeWhitespace(params.content);
  const summary = params.summary?.trim() || buildSummary(content);

  await db
    .insertInto("kb_sources")
    .values({
      id,
      owner_user_id: toDbUserId(params.userId),
      collection_id: params.collectionId,
      document_id: params.documentId,
      title: params.title.trim(),
      summary,
      content,
      tags_json: params.tags,
      source_type: params.sourceType,
      status: params.status,
      source_filename: params.sourceFilename ?? params.documentId,
      mime_type: params.mimeType ?? null,
      byte_size: params.byteSize ?? null,
      failure_message: params.failureMessage ?? null,
      created_at: now,
      updated_at: now,
    })
    .execute();

  await touchCollection(params.collectionId);
  return requireKnowledgeSource(params.userId, id);
}

export async function replaceSourceContent(params: {
  userId: string;
  sourceId: string;
  documentId: string;
  title: string;
  summary?: string;
  content: string;
  tags: string[];
  mimeType?: string;
  byteSize?: number;
  sourceFilename?: string;
  status: KnowledgeSource["status"];
  failureMessage?: string;
}): Promise<KnowledgeSource> {
  const current = await requireKnowledgeSource(params.userId, params.sourceId);
  const db = await ensureKnowledgeDatabase();
  const content = normalizeWhitespace(params.content);
  const summary = params.summary?.trim() || buildSummary(content);
  const now = nowIso();

  await db
    .updateTable("kb_sources")
    .set({
      document_id: params.documentId,
      title: params.title.trim(),
      summary,
      content,
      tags_json: params.tags,
      source_filename:
        params.sourceFilename ??
        current.sourceFilename ??
        current.documentId ??
        params.documentId,
      mime_type: params.mimeType ?? current.mimeType ?? null,
      byte_size: params.byteSize ?? current.byteSize ?? null,
      status: params.status,
      failure_message: params.failureMessage ?? null,
      updated_at: now,
    })
    .where("owner_user_id", "=", toDbUserId(params.userId))
    .where("id", "=", params.sourceId)
    .execute();

  await touchCollection(current.collectionId);
  return requireKnowledgeSource(params.userId, params.sourceId);
}

export async function deleteKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<void> {
  const source = await requireKnowledgeSource(userId, sourceId);
  const db = await ensureKnowledgeDatabase();
  await deleteKnowledgeImportJobsForSource({
    userId,
    sourceId,
  });
  const documentId = source.documentId || source.sourceFilename;
  const [tenantIndexService, workspace] = await Promise.all([
    getKnowledgeTenantIndexService({
      userId,
      collectionId: source.collectionId,
    }).catch(() => undefined),
    getKnowledgeWorkspace({
      userId,
      collectionId: source.collectionId,
    }).catch(() => undefined),
  ]);

  if (documentId) {
    await removeDocumentFromKnowledgeWorkspace({
      userId,
      collectionId: source.collectionId,
      documentId,
    }).catch(() => undefined);

    if (
      tenantIndexService &&
      shouldSyncTenantIndex({
        sourceType: source.sourceType,
        fileName: source.sourceFilename ?? documentId,
        mimeType: source.mimeType,
      })
    ) {
      await tenantIndexService
        .deleteIndex({
          tenantId: buildKnowledgeTenantId({
            userId,
            collectionId: source.collectionId,
          }),
          path: documentId,
        })
        .catch(() => undefined);
    }
  }

  await db
    .deleteFrom("kb_sources")
    .where("owner_user_id", "=", toDbUserId(userId))
    .where("id", "=", sourceId)
    .execute();

  if (documentId) {
    await workspace?.filesystem
      ?.deleteFile(documentId, {
        force: true,
      })
      .catch(() => undefined);
  }
}
