import { NotFoundError } from "@atlas-kb/errors";
import type {
  BriefingExport,
  ChatMessage,
  ChatMessageFeedback,
  ChatMessageFeedbackRequest,
  ChatMessagesData,
  ChatSession,
  DashboardSummary,
  KnowledgeCollection,
  KnowledgeCollectionCreateRequest,
  KnowledgeCollectionData,
  KnowledgeCollectionUpdateRequest,
  KnowledgeSource,
  KnowledgeSourceData,
  KnowledgeSourcesData,
} from "@atlas-kb/schema";
import { type Selectable, sql } from "kysely";
import { ensureKnowledgeDatabase, resetKnowledgeDatabase } from "./db";
import type {
  KbBriefingExports,
  KbChatMessages,
  KbChatSessions,
  KbCollections,
  KbSources,
} from "./db.generated";
import {
  getKnowledgeWorkspace,
  invalidateKnowledgeWorkspace,
  removeDocumentFromKnowledgeWorkspace,
} from "./runtime";
import {
  buildContentPreview,
  buildSummary,
  normalizeWhitespace,
  slugify,
} from "./search-utils";

type CollectionRow = Selectable<KbCollections> & {
  document_count: number;
  failed_document_count: number;
  processing_document_count: number;
  ready_document_count: number;
};

type SourceRow = Selectable<KbSources>;

export type StoredKnowledgeSourceRecord = {
  id: string;
  userId: string;
  collectionId: string;
  documentId: string;
  title: string;
  summary: string;
  excerpt: string;
  contentPreview: string;
  content: string;
  tags: string[];
  sourceType: KnowledgeSource["sourceType"];
  status: KnowledgeSource["status"];
  sourceFilename?: string;
  mimeType?: string;
  byteSize?: number;
  latestVersion: number;
  readyAt?: string;
  lastProcessedAt?: string;
  failureMessage?: string;
  originalPath?: string | null;
  indexPath: string;
  createdAt: string;
  updatedAt: string;
};

type ChatSessionRow = Selectable<KbChatSessions>;

type ChatMessageRow = Selectable<KbChatMessages> & {
  feedback_created_at: Date | string | null;
  feedback_id: string | null;
  feedback_note: string | null;
  feedback_rating: ChatMessageFeedback["rating"] | null;
};

type BriefingExportRow = Selectable<KbBriefingExports>;

const SOURCE_COLUMNS = [
  "id",
  "owner_user_id",
  "collection_id",
  "document_id",
  "title",
  "summary",
  "excerpt",
  "content_preview",
  "content",
  "tags_json",
  "source_type",
  "status",
  "source_filename",
  "source_url",
  "mime_type",
  "byte_size",
  "latest_version",
  "ready_at",
  "last_processed_at",
  "snapshot_updated_at",
  "failure_message",
  "original_path",
  "index_path",
  "created_at",
  "updated_at",
] as const;

const CHAT_SESSION_COLUMNS = [
  "id",
  "owner_user_id",
  "title",
  "collection_id",
  "preview",
  "created_at",
  "updated_at",
  "last_message_at",
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function toUserId(userId: string): number {
  return Number.parseInt(userId, 10);
}

function toIsoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toOptionalIsoTimestamp(
  value: string | Date | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  return toIsoTimestamp(value);
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function parseOptionalJson<T>(raw: unknown): T | undefined {
  if (!raw) {
    return undefined;
  }

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  return raw as T;
}

function toCollection(row: CollectionRow): KnowledgeCollection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    isPinned: Boolean(row.is_pinned),
    documentCount: Number(row.document_count ?? 0),
    readyDocumentCount: Number(row.ready_document_count ?? 0),
    processingDocumentCount: Number(row.processing_document_count ?? 0),
    failedDocumentCount: Number(row.failed_document_count ?? 0),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    lastActivityAt: toIsoTimestamp(row.last_activity_at),
  };
}

function toSource(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    documentId: row.document_id,
    collectionId: row.collection_id,
    title: row.title,
    summary: row.summary,
    excerpt: row.excerpt,
    contentPreview: row.content_preview,
    content: row.content,
    tags: parseJsonArray(row.tags_json),
    sourceType: row.source_type as KnowledgeSource["sourceType"],
    status: row.status as KnowledgeSource["status"],
    sourceFilename: row.source_filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    byteSize:
      row.byte_size === null || row.byte_size === undefined
        ? undefined
        : Number(row.byte_size),
    latestVersion: row.latest_version,
    readyAt: toOptionalIsoTimestamp(row.ready_at),
    lastProcessedAt: toOptionalIsoTimestamp(row.last_processed_at),
    failureMessage: row.failure_message ?? undefined,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

function toStoredSourceRecord(row: SourceRow): StoredKnowledgeSourceRecord {
  return {
    id: row.id,
    userId: String(row.owner_user_id),
    collectionId: row.collection_id,
    documentId: row.document_id,
    title: row.title,
    summary: row.summary,
    excerpt: row.excerpt,
    contentPreview: row.content_preview,
    content: row.content,
    tags: parseJsonArray(row.tags_json),
    sourceType: row.source_type as KnowledgeSource["sourceType"],
    status: row.status as KnowledgeSource["status"],
    sourceFilename: row.source_filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    byteSize:
      row.byte_size === null || row.byte_size === undefined
        ? undefined
        : Number(row.byte_size),
    latestVersion: row.latest_version,
    readyAt: toOptionalIsoTimestamp(row.ready_at),
    lastProcessedAt: toOptionalIsoTimestamp(row.last_processed_at),
    failureMessage: row.failure_message ?? undefined,
    originalPath: row.original_path,
    indexPath: row.index_path,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

function toChatSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    collectionId: row.collection_id,
    preview: row.preview,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    lastMessageAt: toIsoTimestamp(row.last_message_at),
  };
}

function toChatMessage(row: ChatMessageRow): ChatMessage {
  const feedback =
    row.feedback_id && row.feedback_rating && row.feedback_created_at
      ? {
          id: row.feedback_id,
          messageId: row.id,
          rating: row.feedback_rating,
          note: row.feedback_note ?? undefined,
          createdAt: toIsoTimestamp(row.feedback_created_at),
        }
      : undefined;

  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as ChatMessage["role"],
    content: row.content,
    citations:
      parseOptionalJson<ChatMessage["citations"]>(row.citations_json) ?? [],
    createdAt: toIsoTimestamp(row.created_at),
    feedback,
  };
}

function toBriefingExport(row: BriefingExportRow): BriefingExport {
  return {
    id: row.id,
    sourceId: row.source_id,
    documentId: row.document_id,
    title: row.title,
    summary: row.summary,
    form: parseOptionalJson<BriefingExport["form"]>(row.form_json) ?? {
      sourceOrg: "",
      documentCode: "",
      documentTitle: "",
      receivedAt: "",
      briefingOpinion: "",
      pendingQuestions: "",
    },
    citations:
      parseOptionalJson<BriefingExport["citations"]>(row.citations_json) ?? [],
    createdAt: toIsoTimestamp(row.created_at),
  };
}

async function touchCollection(collectionId: string) {
  const db = await ensureKnowledgeDatabase();
  const now = nowIso();

  await db
    .updateTable("kb_collections")
    .set({
      last_activity_at: now,
      updated_at: now,
    })
    .where("id", "=", collectionId)
    .execute();
}

function buildCollectionQuery(userId: string) {
  return ensureKnowledgeDatabase().then((db) =>
    db
      .selectFrom("kb_collections as c")
      .leftJoin("kb_sources as s", (join) =>
        join
          .onRef("s.collection_id", "=", "c.id")
          .onRef("s.owner_user_id", "=", "c.owner_user_id"),
      )
      .select([
        "c.id as id",
        "c.owner_user_id as owner_user_id",
        "c.name as name",
        "c.description as description",
        "c.color as color",
        "c.icon as icon",
        "c.is_pinned as is_pinned",
        "c.created_at as created_at",
        "c.updated_at as updated_at",
        "c.last_activity_at as last_activity_at",
      ])
      .select([
        sql<number>`cast(count(${sql.ref("s.id")}) as integer)`.as(
          "document_count",
        ),
        sql<number>`cast(count(${sql.ref("s.id")}) filter (where ${sql.ref("s.status")} = 'ready') as integer)`.as(
          "ready_document_count",
        ),
        sql<number>`cast(count(${sql.ref("s.id")}) filter (where ${sql.ref("s.status")} = 'processing') as integer)`.as(
          "processing_document_count",
        ),
        sql<number>`cast(count(${sql.ref("s.id")}) filter (where ${sql.ref("s.status")} = 'failed') as integer)`.as(
          "failed_document_count",
        ),
      ])
      .where("c.owner_user_id", "=", toUserId(userId))
      .groupBy([
        "c.id",
        "c.owner_user_id",
        "c.name",
        "c.description",
        "c.color",
        "c.icon",
        "c.is_pinned",
        "c.created_at",
        "c.updated_at",
        "c.last_activity_at",
      ]),
  );
}

async function getCollectionRow(
  userId: string,
  collectionId: string,
): Promise<CollectionRow | null> {
  const query = await buildCollectionQuery(userId);

  return (
    (await query.where("c.id", "=", collectionId).executeTakeFirst()) ?? null
  );
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
      .where("owner_user_id", "=", toUserId(userId))
      .where("id", "=", sourceId)
      .executeTakeFirst()) ?? null
  );
}

async function getChatSessionRow(
  userId: string,
  sessionId: string,
): Promise<ChatSessionRow | null> {
  const db = await ensureKnowledgeDatabase();

  return (
    (await db
      .selectFrom("kb_chat_sessions")
      .select(CHAT_SESSION_COLUMNS)
      .where("owner_user_id", "=", toUserId(userId))
      .where("id", "=", sessionId)
      .executeTakeFirst()) ?? null
  );
}

async function getChatMessageRow(
  userId: string,
  messageId: string,
): Promise<ChatMessageRow | null> {
  const db = await ensureKnowledgeDatabase();

  return (
    (await db
      .selectFrom("kb_chat_messages as m")
      .leftJoin("kb_chat_feedback as f", "f.message_id", "m.id")
      .select([
        "m.id as id",
        "m.owner_user_id as owner_user_id",
        "m.session_id as session_id",
        "m.role as role",
        "m.content as content",
        "m.citations_json as citations_json",
        "m.created_at as created_at",
        "f.id as feedback_id",
        "f.rating as feedback_rating",
        "f.note as feedback_note",
        "f.created_at as feedback_created_at",
      ])
      .where("m.owner_user_id", "=", toUserId(userId))
      .where("m.id", "=", messageId)
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

export async function resetKnowledgeRepository(): Promise<void> {
  await resetKnowledgeDatabase();
}

export async function listKnowledgeCollections(
  userId: string,
): Promise<KnowledgeCollection[]> {
  const rows = await (await buildCollectionQuery(userId))
    .orderBy("c.is_pinned", "desc")
    .orderBy("c.updated_at", "desc")
    .execute();

  return rows.map((row) => toCollection(row));
}

export async function createKnowledgeCollection(params: {
  userId: string;
  input: KnowledgeCollectionCreateRequest;
}): Promise<KnowledgeCollection> {
  const db = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id =
    params.input.id?.trim() ||
    `${slugify(params.input.name).slice(0, 40)}-${crypto.randomUUID().slice(0, 8)}`;

  await db
    .insertInto("kb_collections")
    .values({
      id,
      owner_user_id: toUserId(params.userId),
      name: params.input.name.trim(),
      description: params.input.description.trim(),
      color: params.input.color?.trim() || "#0f766e",
      icon: params.input.icon?.trim() || "i-lucide-library",
      is_pinned: false,
      created_at: now,
      updated_at: now,
      last_activity_at: now,
    })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();

  return requireKnowledgeCollection(params.userId, id);
}

export async function getKnowledgeCollection(
  userId: string,
  collectionId: string,
): Promise<KnowledgeCollection | undefined> {
  const row = await getCollectionRow(userId, collectionId);
  return row ? toCollection(row) : undefined;
}

export async function requireKnowledgeCollection(
  userId: string,
  collectionId: string,
): Promise<KnowledgeCollection> {
  const collection = await getKnowledgeCollection(userId, collectionId);

  if (!collection) {
    throw new NotFoundError(`Collection "${collectionId}" not found`);
  }

  return collection;
}

export async function getKnowledgeCollectionData(
  userId: string,
  collectionId: string,
): Promise<KnowledgeCollectionData> {
  return {
    collection: await requireKnowledgeCollection(userId, collectionId),
  };
}

export async function updateKnowledgeCollection(params: {
  userId: string;
  collectionId: string;
  input: KnowledgeCollectionUpdateRequest;
}): Promise<KnowledgeCollection> {
  await requireKnowledgeCollection(params.userId, params.collectionId);
  const db = await ensureKnowledgeDatabase();

  const updates: Partial<KbCollections> = {
    updated_at: nowIso(),
  };

  if (params.input.name?.trim()) {
    updates.name = params.input.name.trim();
  }

  if (params.input.description?.trim()) {
    updates.description = params.input.description.trim();
  }

  if (params.input.color?.trim()) {
    updates.color = params.input.color.trim();
  }

  if (params.input.icon?.trim()) {
    updates.icon = params.input.icon.trim();
  }

  if (typeof params.input.isPinned === "boolean") {
    updates.is_pinned = params.input.isPinned;
  }

  await db
    .updateTable("kb_collections")
    .set(updates)
    .where("owner_user_id", "=", toUserId(params.userId))
    .where("id", "=", params.collectionId)
    .execute();

  return requireKnowledgeCollection(params.userId, params.collectionId);
}

export async function deleteKnowledgeCollection(
  userId: string,
  collectionId: string,
): Promise<void> {
  const db = await ensureKnowledgeDatabase();
  const workspace = await getKnowledgeWorkspace({
    userId,
    collectionId,
  }).catch(() => undefined);

  await db
    .deleteFrom("kb_collections")
    .where("owner_user_id", "=", toUserId(userId))
    .where("id", "=", collectionId)
    .execute();

  await workspace?.filesystem
    ?.rmdir("", { recursive: true })
    .catch(() => undefined);

  await invalidateKnowledgeWorkspace({
    userId,
    collectionId,
  });
}

export async function listKnowledgeSources(
  userId: string,
  collectionId?: string,
): Promise<KnowledgeSource[]> {
  const db = await ensureKnowledgeDatabase();
  let query = db
    .selectFrom("kb_sources")
    .select(SOURCE_COLUMNS)
    .where("owner_user_id", "=", toUserId(userId));

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
      owner_user_id: toUserId(params.userId),
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
    .where("owner_user_id", "=", toUserId(params.userId))
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
    .where("owner_user_id", "=", toUserId(userId))
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

async function countRows(args: {
  table: "kb_chat_sessions" | "kb_collections" | "kb_sources";
  userId: string;
  status?: KnowledgeSource["status"];
}): Promise<number> {
  const db = await ensureKnowledgeDatabase();
  let query = db
    .selectFrom(args.table)
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("owner_user_id", "=", toUserId(args.userId));

  if (args.table === "kb_sources" && args.status) {
    query = query.where("status", "=", args.status);
  }

  const row = await query.executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function getDashboardSummary(
  userId: string,
): Promise<DashboardSummary> {
  const [
    collectionsCount,
    readySourcesCount,
    processingSourcesCount,
    failedSourcesCount,
    chatSessionsCount,
    recentCollections,
    recentSources,
    recentSessions,
  ] = await Promise.all([
    countRows({
      table: "kb_collections",
      userId,
    }),
    countRows({
      table: "kb_sources",
      userId,
      status: "ready",
    }),
    countRows({
      table: "kb_sources",
      userId,
      status: "processing",
    }),
    countRows({
      table: "kb_sources",
      userId,
      status: "failed",
    }),
    countRows({
      table: "kb_chat_sessions",
      userId,
    }),
    listKnowledgeCollections(userId).then((items) => items.slice(0, 6)),
    listKnowledgeSources(userId).then((items) => items.slice(0, 6)),
    listChatSessions(userId).then((items) => items.slice(0, 6)),
  ]);

  return {
    collectionsCount,
    readySourcesCount,
    processingSourcesCount,
    failedSourcesCount,
    chatSessionsCount,
    recentCollections,
    recentSources,
    recentSessions,
    hasAnyData:
      recentCollections.length > 0 ||
      recentSources.length > 0 ||
      recentSessions.length > 0,
  };
}

export async function createChatSession(params: {
  userId: string;
  title?: string;
  collectionId: string;
}): Promise<ChatSession> {
  const db = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id = crypto.randomUUID();
  const collection = await requireKnowledgeCollection(
    params.userId,
    params.collectionId,
  );
  const title = params.title?.trim() || `${collection.name} 对话`;
  const preview = "开始提问吧";

  await db
    .insertInto("kb_chat_sessions")
    .values({
      id,
      owner_user_id: toUserId(params.userId),
      title,
      collection_id: params.collectionId,
      preview,
      created_at: now,
      updated_at: now,
      last_message_at: now,
    })
    .execute();

  return requireChatSession(params.userId, id);
}

export async function listChatSessions(
  userId: string,
  collectionId?: string,
): Promise<ChatSession[]> {
  const db = await ensureKnowledgeDatabase();
  let query = db
    .selectFrom("kb_chat_sessions")
    .select(CHAT_SESSION_COLUMNS)
    .where("owner_user_id", "=", toUserId(userId));

  if (collectionId) {
    query = query.where("collection_id", "=", collectionId);
  }

  const rows = await query.orderBy("last_message_at", "desc").execute();
  return rows.map((row) => toChatSession(row));
}

export async function getChatSessionById(
  userId: string,
  sessionId: string,
): Promise<ChatSession | undefined> {
  const row = await getChatSessionRow(userId, sessionId);
  return row ? toChatSession(row) : undefined;
}

export async function requireChatSession(
  userId: string,
  sessionId: string,
): Promise<ChatSession> {
  const session = await getChatSessionById(userId, sessionId);

  if (!session) {
    throw new NotFoundError(`Chat session "${sessionId}" not found`);
  }

  return session;
}

export async function updateChatSession(params: {
  userId: string;
  sessionId: string;
  title: string;
}): Promise<ChatSession> {
  await requireChatSession(params.userId, params.sessionId);
  const db = await ensureKnowledgeDatabase();

  await db
    .updateTable("kb_chat_sessions")
    .set({
      title: params.title.trim(),
      updated_at: nowIso(),
    })
    .where("owner_user_id", "=", toUserId(params.userId))
    .where("id", "=", params.sessionId)
    .execute();

  return requireChatSession(params.userId, params.sessionId);
}

export async function deleteChatSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  await requireChatSession(userId, sessionId);
  const db = await ensureKnowledgeDatabase();

  await db
    .deleteFrom("kb_chat_sessions")
    .where("owner_user_id", "=", toUserId(userId))
    .where("id", "=", sessionId)
    .execute();
}

export async function listChatMessages(
  userId: string,
  sessionId: string,
): Promise<ChatMessage[]> {
  await requireChatSession(userId, sessionId);
  const db = await ensureKnowledgeDatabase();
  const rows = await db
    .selectFrom("kb_chat_messages as m")
    .leftJoin("kb_chat_feedback as f", "f.message_id", "m.id")
    .select([
      "m.id as id",
      "m.owner_user_id as owner_user_id",
      "m.session_id as session_id",
      "m.role as role",
      "m.content as content",
      "m.citations_json as citations_json",
      "m.created_at as created_at",
      "f.id as feedback_id",
      "f.rating as feedback_rating",
      "f.note as feedback_note",
      "f.created_at as feedback_created_at",
    ])
    .where("m.owner_user_id", "=", toUserId(userId))
    .where("m.session_id", "=", sessionId)
    .orderBy("m.created_at", "asc")
    .execute();

  return rows.map((row) => toChatMessage(row));
}

export async function appendChatMessage(params: {
  userId: string;
  sessionId: string;
  role: ChatMessage["role"];
  content: string;
  citations?: ChatMessage["citations"];
}): Promise<ChatMessage> {
  const session = await requireChatSession(params.userId, params.sessionId);
  const db = await ensureKnowledgeDatabase();
  const id = crypto.randomUUID();
  const now = nowIso();
  const preview = params.content.trim().slice(0, 160);

  await db
    .insertInto("kb_chat_messages")
    .values({
      id,
      owner_user_id: toUserId(params.userId),
      session_id: params.sessionId,
      role: params.role,
      content: params.content.trim(),
      citations_json: params.citations ?? [],
      created_at: now,
      retrieval_json: null,
      trace_json: null,
    })
    .execute();

  await db
    .updateTable("kb_chat_sessions")
    .set({
      preview: params.role === "user" ? preview : session.preview,
      updated_at: now,
      last_message_at: now,
    })
    .where("owner_user_id", "=", toUserId(params.userId))
    .where("id", "=", params.sessionId)
    .execute();

  const message = await getChatMessageRow(params.userId, id);
  return toChatMessage(message!);
}

export async function getChatMessagesData(
  userId: string,
  sessionId: string,
): Promise<ChatMessagesData> {
  const [session, messages] = await Promise.all([
    requireChatSession(userId, sessionId),
    listChatMessages(userId, sessionId),
  ]);

  return {
    session,
    messages,
  };
}

export async function saveMessageFeedback(params: {
  userId: string;
  messageId: string;
  input: ChatMessageFeedbackRequest;
}): Promise<ChatMessageFeedback> {
  const db = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id = crypto.randomUUID();

  await db
    .deleteFrom("kb_chat_feedback")
    .where("owner_user_id", "=", toUserId(params.userId))
    .where("message_id", "=", params.messageId)
    .execute();

  await db
    .insertInto("kb_chat_feedback")
    .values({
      id,
      owner_user_id: toUserId(params.userId),
      message_id: params.messageId,
      rating: params.input.rating,
      note: params.input.note?.trim() || null,
      created_at: now,
    })
    .execute();

  return {
    id,
    messageId: params.messageId,
    rating: params.input.rating,
    note: params.input.note?.trim() || undefined,
    createdAt: now,
  };
}

export async function listBriefingExports(
  userId: string,
  sourceId: string,
): Promise<BriefingExport[]> {
  const db = await ensureKnowledgeDatabase();
  const rows = await db
    .selectFrom("kb_briefing_exports")
    .select([
      "id",
      "owner_user_id",
      "source_id",
      "document_id",
      "title",
      "summary",
      "form_json",
      "citations_json",
      "created_at",
    ])
    .where("owner_user_id", "=", toUserId(userId))
    .where("source_id", "=", sourceId)
    .orderBy("created_at", "desc")
    .execute();

  return rows.map((row) => toBriefingExport(row));
}

export async function createBriefingExport(params: {
  userId: string;
  sourceId: string;
  documentId: string;
  title: string;
  summary: string;
  form: BriefingExport["form"];
  citations: BriefingExport["citations"];
}): Promise<BriefingExport> {
  const db = await ensureKnowledgeDatabase();
  const exportRecord: BriefingExport = {
    id: crypto.randomUUID(),
    sourceId: params.sourceId,
    documentId: params.documentId,
    title: params.title,
    summary: params.summary,
    form: params.form,
    citations: params.citations,
    createdAt: nowIso(),
  };

  await db
    .insertInto("kb_briefing_exports")
    .values({
      id: exportRecord.id,
      owner_user_id: toUserId(params.userId),
      source_id: params.sourceId,
      document_id: params.documentId,
      title: params.title,
      summary: params.summary,
      form_json: params.form,
      citations_json: params.citations,
      created_at: exportRecord.createdAt,
    })
    .execute();

  return exportRecord;
}
