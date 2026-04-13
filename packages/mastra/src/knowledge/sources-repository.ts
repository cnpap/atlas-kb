import { NotFoundError } from "@atlas-kb/errors";
import { sql } from "kysely";
import type { KnowledgeCollection, KnowledgeSource } from "@atlas-kb/schema";
import { ensureKnowledgeDatabase } from "./db";
import { getKnowledgeWorkspace } from "./runtime";
import { normalizeWhitespace } from "./search-utils";
import { removeKnowledgeSourceChunks } from "./source-indexing";
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

let kbSourcesTitleColumnExists: boolean | undefined;

async function hasLegacyKbSourcesTitleColumn(): Promise<boolean> {
  if (kbSourcesTitleColumnExists !== undefined) {
    return kbSourcesTitleColumnExists;
  }

  const db = await ensureKnowledgeDatabase();
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'kb_sources'
        AND column_name = 'title'
    ) AS "exists"
  `.execute(db);

  kbSourcesTitleColumnExists = Boolean(result.rows[0]?.exists);
  return kbSourcesTitleColumnExists;
}

export function resetKnowledgeSourceSchemaCache(): void {
  kbSourcesTitleColumnExists = undefined;
}

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

export async function requireKnowledgeSourceRow(
  userId: string,
  sourceId: string,
): Promise<SourceRow> {
  const row = await getSourceRow(userId, sourceId);

  if (!row) {
    throw new NotFoundError(`Source "${sourceId}" not found`);
  }

  return row;
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

  const rows = await query
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();
  return rows.map((row) => toSource(row));
}

export async function listAutoRetryableFailedKnowledgeSources(args?: {
  limit?: number;
  retryBefore?: Date;
}): Promise<
  Array<{
    sourceId: string;
    userId: string;
  }>
> {
  const db = await ensureKnowledgeDatabase();
  const retryBefore = args?.retryBefore;
  const limit = args?.limit && args.limit > 0 ? Math.floor(args.limit) : 50;
  let query = db
    .selectFrom("kb_sources")
    .select(["id", "owner_user_id"])
    .where("source_type", "=", "file")
    .where("status", "=", "failed");

  if (retryBefore) {
    query = query.where("updated_at", "<=", retryBefore);
  }

  const rows = await query
    .orderBy("updated_at", "asc")
    .limit(limit)
    .execute();

  return rows.map((row) => ({
    sourceId: row.id,
    userId: String(row.owner_user_id),
  }));
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

  if (!row) {
    return undefined;
  }

  return toSource(row);
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
  content?: string;
  sourceFilename: string;
  mimeType?: string;
  byteSize?: number;
  indexChunkCount?: number;
  status: KnowledgeSource["status"];
  failureMessage?: string;
}): Promise<KnowledgeSource> {
  await requireKnowledgeCollection(params.userId, params.collectionId);
  const db = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id = params.sourceId ?? crypto.randomUUID();
  const content = params.content
    ? normalizeWhitespace(params.content)
    : undefined;
  const values: Record<string, unknown> = {
    id,
    owner_user_id: toDbUserId(params.userId),
    collection_id: params.collectionId,
    document_id: params.documentId,
    content: content ?? null,
    source_type: params.sourceType,
    status: params.status,
    source_filename: params.sourceFilename.trim(),
    mime_type: params.mimeType ?? null,
    byte_size: params.byteSize ?? null,
    index_chunk_count: params.indexChunkCount ?? 0,
    failure_message: params.failureMessage ?? null,
    created_at: now,
    updated_at: now,
  };

  if (await hasLegacyKbSourcesTitleColumn()) {
    values.title = params.sourceFilename.trim();
  }

  await (db.insertInto("kb_sources") as never as {
    values(input: Record<string, unknown>): { execute(): Promise<unknown> };
  })
    .values(values)
    .execute();

  await touchCollection(params.collectionId);
  return requireKnowledgeSource(params.userId, id);
}

export async function replaceSourceContent(params: {
  userId: string;
  sourceId: string;
  documentId: string;
  content?: string;
  mimeType?: string;
  byteSize?: number;
  sourceFilename: string;
  indexChunkCount?: number;
  status: KnowledgeSource["status"];
  failureMessage?: string;
}): Promise<KnowledgeSource> {
  const current = await requireKnowledgeSourceRow(
    params.userId,
    params.sourceId,
  );
  const db = await ensureKnowledgeDatabase();
  const content = params.content
    ? normalizeWhitespace(params.content)
    : undefined;
  const now = nowIso();
  const values: Record<string, unknown> = {
    document_id: params.documentId,
    content: content ?? null,
    source_filename: params.sourceFilename.trim(),
    mime_type: params.mimeType ?? current.mime_type ?? null,
    byte_size:
      params.byteSize ??
      (current.byte_size === null || current.byte_size === undefined
        ? null
        : Number(current.byte_size)),
    index_chunk_count:
      params.indexChunkCount ?? Number(current.index_chunk_count ?? 0),
    status: params.status,
    failure_message: params.failureMessage ?? null,
    updated_at: now,
  };

  if (await hasLegacyKbSourcesTitleColumn()) {
    values.title = params.sourceFilename.trim();
  }

  await (db.updateTable("kb_sources") as never as {
    set(input: Record<string, unknown>): {
      where(column: string, op: string, value: string): {
        where(column: string, op: string, value: string): {
          execute(): Promise<unknown>;
        };
      };
    };
  })
    .set(values)
    .where("owner_user_id", "=", toDbUserId(params.userId))
    .where("id", "=", params.sourceId)
    .execute();

  await touchCollection(current.collection_id);
  return requireKnowledgeSource(params.userId, params.sourceId);
}

export async function deleteKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<void> {
  const source = await requireKnowledgeSourceRow(userId, sourceId);
  const db = await ensureKnowledgeDatabase();
  const documentId = source.document_id || source.source_filename;
  const workspace = await getKnowledgeWorkspace({
    userId,
    collectionId: source.collection_id,
  }).catch(() => undefined);

  if (workspace) {
    await removeKnowledgeSourceChunks({
      workspace,
      sourceId,
      chunkCount: Number(source.index_chunk_count ?? 0),
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
