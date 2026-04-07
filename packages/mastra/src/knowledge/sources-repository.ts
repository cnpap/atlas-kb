import { NotFoundError } from "@atlas-kb/errors";
import type {
  KnowledgeSource,
  KnowledgeSourceData,
  KnowledgeSourcesData,
} from "@atlas-kb/schema";
import { ensureKnowledgeDatabase } from "./db";
import {
  getKnowledgeWorkspace,
  removeDocumentFromKnowledgeWorkspace,
} from "./runtime";
import {
  buildContentPreview,
  buildSummary,
  normalizeWhitespace,
} from "./search-utils";
import {
  nowIso,
  SOURCE_COLUMNS,
  toDbUserId,
  toSource,
  toStoredSourceRecord,
  type SourceRow,
  type StoredKnowledgeSourceRecord,
} from "./repository-shared";
import {
  requireKnowledgeCollection,
  touchCollection,
} from "./collections-repository";

export async function getSourceRow(
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

export async function getStoredSourceRecord(
  userId: string,
  sourceId: string,
): Promise<StoredKnowledgeSourceRecord | null> {
  const row = await getSourceRow(userId, sourceId);
  return row ? toStoredSourceRecord(row) : null;
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
): Promise<KnowledgeSourcesData> {
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

export async function getKnowledgeSourceData(
  userId: string,
  sourceId: string,
): Promise<KnowledgeSourceData> {
  return {
    source: await requireKnowledgeSource(userId, sourceId),
  };
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
  originalPath?: string | null;
  indexPath: string;
}): Promise<KnowledgeSource> {
  await requireKnowledgeCollection(params.userId, params.collectionId);
  const db = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id = params.sourceId ?? crypto.randomUUID();
  const content = normalizeWhitespace(params.content);
  const summary = params.summary?.trim() || buildSummary(content);
  const preview = buildContentPreview(content);
  const excerpt = buildSummary(content, 160);

  await db
    .insertInto("kb_sources")
    .values({
      id,
      owner_user_id: toDbUserId(params.userId),
      collection_id: params.collectionId,
      document_id: params.documentId,
      title: params.title.trim(),
      summary,
      excerpt,
      content_preview: preview,
      content,
      tags_json: params.tags,
      source_type: params.sourceType,
      status: params.status,
      source_filename: params.sourceFilename ?? null,
      source_url: null,
      mime_type: params.mimeType ?? null,
      byte_size: params.byteSize ?? null,
      latest_version: 1,
      ready_at: params.status === "ready" ? now : null,
      last_processed_at: now,
      snapshot_updated_at: null,
      failure_message: params.failureMessage ?? null,
      original_path: params.originalPath ?? null,
      index_path: params.indexPath,
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
  originalPath?: string | null;
  indexPath: string;
}): Promise<KnowledgeSource> {
  const current = await requireKnowledgeSource(params.userId, params.sourceId);
  const db = await ensureKnowledgeDatabase();
  const content = normalizeWhitespace(params.content);
  const summary = params.summary?.trim() || buildSummary(content);
  const preview = buildContentPreview(content);
  const excerpt = buildSummary(content, 160);
  const nextVersion = current.latestVersion + 1;
  const now = nowIso();

  await db
    .updateTable("kb_sources")
    .set({
      document_id: params.documentId,
      title: params.title.trim(),
      summary,
      excerpt,
      content_preview: preview,
      content,
      tags_json: params.tags,
      source_filename: params.sourceFilename ?? current.sourceFilename ?? null,
      source_url: null,
      mime_type: params.mimeType ?? current.mimeType ?? null,
      byte_size: params.byteSize ?? current.byteSize ?? null,
      latest_version: nextVersion,
      status: params.status,
      ready_at: params.status === "ready" ? now : null,
      last_processed_at: now,
      snapshot_updated_at: null,
      failure_message: params.failureMessage ?? null,
      original_path: params.originalPath ?? null,
      index_path: params.indexPath,
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
  const documentId = source.documentId || source.sourceFilename;
  const workspace = await getKnowledgeWorkspace({
    userId,
    collectionId: source.collectionId,
  }).catch(() => undefined);

  if (documentId) {
    await removeDocumentFromKnowledgeWorkspace({
      userId,
      collectionId: source.collectionId,
      documentId,
    }).catch(() => undefined);
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
