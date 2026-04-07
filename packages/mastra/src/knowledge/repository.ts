import { NotFoundError } from "@atlas-kb/errors";
import type {
  BriefingExport,
  ChatMessage,
  ChatMessageFeedback,
  ChatMessageFeedbackRequest,
  ChatMessagesData,
  ChatSession,
  ChatTraceEvent,
  DashboardSummary,
  KnowledgeCollection,
  KnowledgeCollectionCreateRequest,
  KnowledgeCollectionData,
  KnowledgeCollectionUpdateRequest,
  KnowledgeSource,
  KnowledgeSourceData,
  KnowledgeSourcesData,
  SearchKnowledgeResult,
} from "@atlas-kb/schema";
import {
  buildContentPreview,
  buildSummary,
  normalizeWhitespace,
  slugify,
} from "./search-utils";
import { ensureKnowledgeDatabase, resetKnowledgeDatabase } from "./db";
import { getDatabaseUrl } from "./config";
import { invalidateKnowledgeWorkspace } from "./runtime";
import {
  deleteManagedCollectionFiles,
  deleteManagedSourceFiles,
} from "./storage";

type CollectionRow = {
  id: string;
  owner_user_id: number | string;
  name: string;
  description: string;
  color: string;
  icon: string;
  is_pinned: boolean;
  created_at: string | Date;
  updated_at: string | Date;
  last_activity_at: string | Date;
  document_count: number;
  ready_document_count: number;
  processing_document_count: number;
  failed_document_count: number;
};

type SourceRow = {
  id: string;
  owner_user_id: number | string;
  collection_id: string;
  document_id: string;
  title: string;
  summary: string;
  excerpt: string;
  content_preview: string;
  content: string;
  tags_json: unknown;
  source_type: KnowledgeSource["sourceType"];
  status: KnowledgeSource["status"];
  source_filename: string | null;
  source_url: string | null;
  mime_type: string | null;
  byte_size: number | string | null;
  latest_version: number;
  ready_at: string | Date | null;
  last_processed_at: string | Date | null;
  snapshot_updated_at: string | Date | null;
  failure_message: string | null;
  original_path: string | null;
  index_path: string;
  created_at: string | Date;
  updated_at: string | Date;
};

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
  sourceUrl?: string;
  mimeType?: string;
  byteSize?: number;
  latestVersion: number;
  readyAt?: string;
  lastProcessedAt?: string;
  snapshotUpdatedAt?: string;
  failureMessage?: string;
  originalPath?: string | null;
  indexPath: string;
  createdAt: string;
  updatedAt: string;
};

type ChatSessionRow = {
  id: string;
  owner_user_id: number | string;
  title: string;
  collection_id: string;
  preview: string;
  created_at: string | Date;
  updated_at: string | Date;
  last_message_at: string | Date;
};

type ChatMessageRow = {
  id: string;
  owner_user_id: number | string;
  session_id: string;
  role: ChatMessage["role"];
  content: string;
  citations_json: unknown;
  retrieval_json: unknown;
  trace_json: unknown;
  created_at: string | Date;
  feedback_id: string | null;
  feedback_rating: ChatMessageFeedback["rating"] | null;
  feedback_note: string | null;
  feedback_created_at: string | Date | null;
};

type BriefingExportRow = {
  id: string;
  owner_user_id: number | string;
  source_id: string;
  document_id: string;
  title: string;
  summary: string;
  form_json: unknown;
  citations_json: unknown;
  created_at: string | Date;
};

const collectionQuery = `
  SELECT
    c.id,
    c.owner_user_id,
    c.name,
    c.description,
    c.color,
    c.icon,
    c.is_pinned,
    c.created_at,
    c.updated_at,
    c.last_activity_at,
    COUNT(s.id)::int AS document_count,
    COALESCE(SUM(CASE WHEN s.status = 'ready' THEN 1 ELSE 0 END), 0)::int AS ready_document_count,
    COALESCE(SUM(CASE WHEN s.status = 'processing' THEN 1 ELSE 0 END), 0)::int AS processing_document_count,
    COALESCE(SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END), 0)::int AS failed_document_count
  FROM kb_collections c
  LEFT JOIN kb_sources s
    ON s.collection_id = c.id
   AND s.owner_user_id = c.owner_user_id
`;

function nowIso(): string {
  return new Date().toISOString();
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
    sourceType: row.source_type,
    status: row.status,
    sourceFilename: row.source_filename ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    mimeType: row.mime_type ?? undefined,
    byteSize:
      row.byte_size === null || row.byte_size === undefined
        ? undefined
        : Number(row.byte_size),
    latestVersion: row.latest_version,
    readyAt: toOptionalIsoTimestamp(row.ready_at),
    lastProcessedAt: toOptionalIsoTimestamp(row.last_processed_at),
    snapshotUpdatedAt: toOptionalIsoTimestamp(row.snapshot_updated_at),
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
    sourceType: row.source_type,
    status: row.status,
    sourceFilename: row.source_filename ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    mimeType: row.mime_type ?? undefined,
    byteSize:
      row.byte_size === null || row.byte_size === undefined
        ? undefined
        : Number(row.byte_size),
    latestVersion: row.latest_version,
    readyAt: toOptionalIsoTimestamp(row.ready_at),
    lastProcessedAt: toOptionalIsoTimestamp(row.last_processed_at),
    snapshotUpdatedAt: toOptionalIsoTimestamp(row.snapshot_updated_at),
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
    role: row.role,
    content: row.content,
    citations:
      parseOptionalJson<ChatMessage["citations"]>(row.citations_json) ?? [],
    retrieval: parseOptionalJson<SearchKnowledgeResult>(row.retrieval_json),
    trace: parseOptionalJson<ChatTraceEvent[]>(row.trace_json),
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
  const sql = await ensureKnowledgeDatabase();
  await sql`
    UPDATE kb_collections
    SET last_activity_at = ${nowIso()}, updated_at = ${nowIso()}
    WHERE id = ${collectionId}
  `;
}

async function getCollectionRow(
  userId: string,
  collectionId: string,
): Promise<CollectionRow | null> {
  const sql = await ensureKnowledgeDatabase();
  const [row] = await sql<CollectionRow[]>`
    ${sql.unsafe(collectionQuery)}
    WHERE c.owner_user_id = ${userId}
      AND c.id = ${collectionId}
    GROUP BY c.id
    LIMIT 1
  `;
  return row ?? null;
}

async function getSourceRow(
  userId: string,
  sourceId: string,
): Promise<SourceRow | null> {
  const sql = await ensureKnowledgeDatabase();
  const [row] = await sql<SourceRow[]>`
    SELECT
      id,
      owner_user_id,
      collection_id,
      document_id,
      title,
      summary,
      excerpt,
      content_preview,
      content,
      tags_json,
      source_type,
      status,
      source_filename,
      source_url,
      mime_type,
      byte_size,
      latest_version,
      ready_at,
      last_processed_at,
      snapshot_updated_at,
      failure_message,
      original_path,
      index_path,
      created_at,
      updated_at
    FROM kb_sources
    WHERE owner_user_id = ${userId}
      AND id = ${sourceId}
    LIMIT 1
  `;

  return row ?? null;
}

export async function getStoredSourceRecord(
  userId: string,
  sourceId: string,
): Promise<StoredKnowledgeSourceRecord | null> {
  const row = await getSourceRow(userId, sourceId);
  return row ? toStoredSourceRecord(row) : null;
}

async function getSourceRowByDocumentId(
  userId: string,
  documentId: string,
): Promise<SourceRow | null> {
  const sql = await ensureKnowledgeDatabase();
  const [row] = await sql<SourceRow[]>`
    SELECT
      id,
      owner_user_id,
      collection_id,
      document_id,
      title,
      summary,
      excerpt,
      content_preview,
      content,
      tags_json,
      source_type,
      status,
      source_filename,
      source_url,
      mime_type,
      byte_size,
      latest_version,
      ready_at,
      last_processed_at,
      snapshot_updated_at,
      failure_message,
      original_path,
      index_path,
      created_at,
      updated_at
    FROM kb_sources
    WHERE owner_user_id = ${userId}
      AND document_id = ${documentId}
    LIMIT 1
  `;

  return row ?? null;
}

export async function getStoredSourceRecordByDocumentId(
  userId: string,
  documentId: string,
): Promise<StoredKnowledgeSourceRecord | null> {
  const row = await getSourceRowByDocumentId(userId, documentId);
  return row ? toStoredSourceRecord(row) : null;
}

export function resolveDatabasePath(): string {
  return getDatabaseUrl();
}

export function toStoredKnowledgeSource(
  source: KnowledgeSource,
): KnowledgeSource {
  return source;
}

export async function resetKnowledgeRepository(): Promise<void> {
  await resetKnowledgeDatabase();
}

export async function listKnowledgeCollections(
  userId: string,
): Promise<KnowledgeCollection[]> {
  const sql = await ensureKnowledgeDatabase();
  const rows = await sql<CollectionRow[]>`
    ${sql.unsafe(collectionQuery)}
    WHERE c.owner_user_id = ${userId}
    GROUP BY c.id
    ORDER BY c.is_pinned DESC, c.updated_at DESC
  `;

  return rows.map((row) => toCollection(row));
}

export async function createKnowledgeCollection(params: {
  userId: string;
  input: KnowledgeCollectionCreateRequest;
}): Promise<KnowledgeCollection> {
  const sql = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id =
    params.input.id?.trim() ||
    `${slugify(params.input.name).slice(0, 40)}-${crypto.randomUUID().slice(0, 8)}`;

  await sql`
    INSERT INTO kb_collections (
      id,
      owner_user_id,
      name,
      description,
      color,
      icon,
      is_pinned,
      created_at,
      updated_at,
      last_activity_at
    ) VALUES (
      ${id},
      ${params.userId},
      ${params.input.name.trim()},
      ${params.input.description.trim()},
      ${params.input.color?.trim() || "#0f766e"},
      ${params.input.icon?.trim() || "i-lucide-library"},
      ${false},
      ${now},
      ${now},
      ${now}
    )
    ON CONFLICT (id) DO NOTHING
  `;

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
  const sql = await ensureKnowledgeDatabase();
  const now = nowIso();

  await sql`
    UPDATE kb_collections
    SET
      name = COALESCE(${params.input.name?.trim() || null}, name),
      description = COALESCE(${params.input.description?.trim() || null}, description),
      color = COALESCE(${params.input.color?.trim() || null}, color),
      icon = COALESCE(${params.input.icon?.trim() || null}, icon),
      is_pinned = COALESCE(${params.input.isPinned ?? null}, is_pinned),
      updated_at = ${now}
    WHERE owner_user_id = ${params.userId}
      AND id = ${params.collectionId}
  `;

  return requireKnowledgeCollection(params.userId, params.collectionId);
}

export async function deleteKnowledgeCollection(
  userId: string,
  collectionId: string,
): Promise<void> {
  const sql = await ensureKnowledgeDatabase();

  await sql`
    DELETE FROM kb_collections
    WHERE owner_user_id = ${userId}
      AND id = ${collectionId}
  `;

  await deleteManagedCollectionFiles({
    userId,
    collectionId,
  });

  await invalidateKnowledgeWorkspace({
    userId,
    collectionId,
  });
}

export async function listKnowledgeSources(
  userId: string,
  collectionId?: string,
): Promise<KnowledgeSource[]> {
  const sql = await ensureKnowledgeDatabase();
  const rows = await sql<SourceRow[]>`
    SELECT
      id,
      owner_user_id,
      collection_id,
      document_id,
      title,
      summary,
      excerpt,
      content_preview,
      content,
      tags_json,
      source_type,
      status,
      source_filename,
      source_url,
      mime_type,
      byte_size,
      latest_version,
      ready_at,
      last_processed_at,
      snapshot_updated_at,
      failure_message,
      original_path,
      index_path,
      created_at,
      updated_at
    FROM kb_sources
    WHERE owner_user_id = ${userId}
      ${collectionId ? sql`AND collection_id = ${collectionId}` : sql``}
    ORDER BY updated_at DESC
  `;

  return rows.map((row) => toSource(row));
}

export async function getKnowledgeCollectionSources(
  userId: string,
  collectionId: string,
): Promise<KnowledgeSource[]> {
  await requireKnowledgeCollection(userId, collectionId);
  return listKnowledgeSources(userId, collectionId);
}

export async function getKnowledgeCollectionSourcesData(
  userId: string,
  collectionId: string,
): Promise<KnowledgeSourcesData> {
  const [collection, sources] = await Promise.all([
    requireKnowledgeCollection(userId, collectionId),
    getKnowledgeCollectionSources(userId, collectionId),
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

export async function getDocumentById(
  userId: string,
  documentId: string,
): Promise<KnowledgeSource | undefined> {
  const row = await getSourceRowByDocumentId(userId, documentId);
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
  sourceUrl?: string;
  mimeType?: string;
  byteSize?: number;
  status: KnowledgeSource["status"];
  failureMessage?: string;
  originalPath?: string | null;
  indexPath: string;
}): Promise<KnowledgeSource> {
  await requireKnowledgeCollection(params.userId, params.collectionId);
  const sql = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id = params.sourceId ?? crypto.randomUUID();
  const content = normalizeWhitespace(params.content);
  const summary = params.summary?.trim() || buildSummary(content);
  const preview = buildContentPreview(content);
  const excerpt = buildSummary(content, 160);

  await sql`
    INSERT INTO kb_sources (
      id,
      owner_user_id,
      collection_id,
      document_id,
      title,
      summary,
      excerpt,
      content_preview,
      content,
      tags_json,
      source_type,
      status,
      source_filename,
      source_url,
      mime_type,
      byte_size,
      latest_version,
      ready_at,
      last_processed_at,
      snapshot_updated_at,
      failure_message,
      original_path,
      index_path,
      created_at,
      updated_at
    ) VALUES (
      ${id},
      ${params.userId},
      ${params.collectionId},
      ${params.documentId},
      ${params.title.trim()},
      ${summary},
      ${excerpt},
      ${preview},
      ${content},
      ${JSON.stringify(params.tags)},
      ${params.sourceType},
      ${params.status},
      ${params.sourceFilename ?? null},
      ${params.sourceUrl ?? null},
      ${params.mimeType ?? null},
      ${params.byteSize ?? null},
      ${1},
      ${params.status === "ready" ? now : null},
      ${now},
      ${params.sourceType === "url" ? now : null},
      ${params.failureMessage ?? null},
      ${params.originalPath ?? null},
      ${params.indexPath},
      ${now},
      ${now}
    )
  `;

  await touchCollection(params.collectionId);
  return requireKnowledgeSource(params.userId, id);
}

export async function createSourceDraft(params: {
  sourceId?: string;
  userId: string;
  collectionId: string;
  sourceType: KnowledgeSource["sourceType"];
  title: string;
  summary?: string;
  tags?: string[];
  sourceFilename?: string;
  sourceUrl?: string;
  mimeType?: string;
  byteSize?: number;
  originalPath?: string | null;
  indexPath: string;
}): Promise<KnowledgeSource> {
  await requireKnowledgeCollection(params.userId, params.collectionId);
  const sql = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id = params.sourceId ?? crypto.randomUUID();

  await sql`
    INSERT INTO kb_sources (
      id,
      owner_user_id,
      collection_id,
      document_id,
      title,
      summary,
      excerpt,
      content_preview,
      content,
      tags_json,
      source_type,
      status,
      source_filename,
      source_url,
      mime_type,
      byte_size,
      latest_version,
      ready_at,
      last_processed_at,
      snapshot_updated_at,
      failure_message,
      original_path,
      index_path,
      created_at,
      updated_at
    ) VALUES (
      ${id},
      ${params.userId},
      ${params.collectionId},
      ${`draft:${id}`},
      ${params.title.trim()},
      ${params.summary?.trim() || "资料处理中"},
      ${params.summary?.trim() || "资料处理中"},
      ${params.summary?.trim() || "资料处理中"},
      ${""},
      ${JSON.stringify(params.tags ?? [])},
      ${params.sourceType},
      ${"processing"},
      ${params.sourceFilename ?? null},
      ${params.sourceUrl ?? null},
      ${params.mimeType ?? null},
      ${params.byteSize ?? null},
      ${0},
      ${null},
      ${null},
      ${null},
      ${null},
      ${params.originalPath ?? null},
      ${params.indexPath},
      ${now},
      ${now}
    )
  `;

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
  sourceUrl?: string;
  status: KnowledgeSource["status"];
  failureMessage?: string;
  originalPath?: string | null;
  indexPath: string;
}): Promise<KnowledgeSource> {
  const current = await requireKnowledgeSource(params.userId, params.sourceId);
  const sql = await ensureKnowledgeDatabase();
  const content = normalizeWhitespace(params.content);
  const summary = params.summary?.trim() || buildSummary(content);
  const preview = buildContentPreview(content);
  const excerpt = buildSummary(content, 160);
  const nextVersion = current.latestVersion + 1;
  const now = nowIso();

  await sql`
    UPDATE kb_sources
    SET
      document_id = ${params.documentId},
      title = ${params.title.trim()},
      summary = ${summary},
      excerpt = ${excerpt},
      content_preview = ${preview},
      content = ${content},
      tags_json = ${JSON.stringify(params.tags)},
      source_filename = ${params.sourceFilename ?? current.sourceFilename ?? null},
      source_url = ${params.sourceUrl ?? current.sourceUrl ?? null},
      mime_type = ${params.mimeType ?? current.mimeType ?? null},
      byte_size = ${params.byteSize ?? current.byteSize ?? null},
      latest_version = ${nextVersion},
      status = ${params.status},
      ready_at = ${params.status === "ready" ? now : null},
      last_processed_at = ${now},
      snapshot_updated_at = ${current.sourceType === "url" ? now : (current.snapshotUpdatedAt ?? null)},
      failure_message = ${params.failureMessage ?? null},
      original_path = ${params.originalPath ?? null},
      index_path = ${params.indexPath},
      updated_at = ${now}
    WHERE owner_user_id = ${params.userId}
      AND id = ${params.sourceId}
  `;

  await touchCollection(current.collectionId);
  return requireKnowledgeSource(params.userId, params.sourceId);
}

export async function deleteKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<void> {
  const source = await requireKnowledgeSource(userId, sourceId);
  const stored = await getStoredSourceRecord(userId, sourceId);
  const sql = await ensureKnowledgeDatabase();

  await sql`
    DELETE FROM kb_sources
    WHERE owner_user_id = ${userId}
      AND id = ${sourceId}
  `;

  await deleteManagedSourceFiles({
    userId,
    collectionId: source.collectionId,
    originalPath: stored?.originalPath,
  });

  await invalidateKnowledgeWorkspace({
    userId,
    collectionId: source.collectionId,
  });
}

export async function archiveKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<KnowledgeSource> {
  const source = await requireKnowledgeSource(userId, sourceId);
  const sql = await ensureKnowledgeDatabase();

  await sql`
    UPDATE kb_sources
    SET status = ${"archived"}, updated_at = ${nowIso()}
    WHERE owner_user_id = ${userId}
      AND id = ${sourceId}
  `;

  await touchCollection(source.collectionId);
  return requireKnowledgeSource(userId, sourceId);
}

export async function getDashboardSummary(
  userId: string,
): Promise<DashboardSummary> {
  const sql = await ensureKnowledgeDatabase();
  const [counts] = await sql<
    Array<{
      collections_count: number;
      ready_sources_count: number;
      processing_sources_count: number;
      failed_sources_count: number;
      chat_sessions_count: number;
    }>
  >`
    SELECT
      (SELECT COUNT(*)::int FROM kb_collections WHERE owner_user_id = ${userId}) AS collections_count,
      (SELECT COUNT(*)::int FROM kb_sources WHERE owner_user_id = ${userId} AND status = 'ready') AS ready_sources_count,
      (SELECT COUNT(*)::int FROM kb_sources WHERE owner_user_id = ${userId} AND status = 'processing') AS processing_sources_count,
      (SELECT COUNT(*)::int FROM kb_sources WHERE owner_user_id = ${userId} AND status = 'failed') AS failed_sources_count,
      (SELECT COUNT(*)::int FROM kb_chat_sessions WHERE owner_user_id = ${userId}) AS chat_sessions_count
  `;

  const [recentCollections, recentSources, recentSessions] = await Promise.all([
    listKnowledgeCollections(userId).then((items) => items.slice(0, 6)),
    listKnowledgeSources(userId).then((items) => items.slice(0, 6)),
    listChatSessions(userId).then((items) => items.slice(0, 6)),
  ]);

  return {
    collectionsCount: Number(counts?.collections_count ?? 0),
    readySourcesCount: Number(counts?.ready_sources_count ?? 0),
    processingSourcesCount: Number(counts?.processing_sources_count ?? 0),
    failedSourcesCount: Number(counts?.failed_sources_count ?? 0),
    chatSessionsCount: Number(counts?.chat_sessions_count ?? 0),
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
  const sql = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id = crypto.randomUUID();
  const collection = await requireKnowledgeCollection(
    params.userId,
    params.collectionId,
  );
  const title = params.title?.trim() || `${collection.name} 对话`;
  const preview = "开始提问吧";

  await sql`
    INSERT INTO kb_chat_sessions (
      id,
      owner_user_id,
      title,
      collection_id,
      preview,
      created_at,
      updated_at,
      last_message_at
    ) VALUES (
      ${id},
      ${params.userId},
      ${title},
      ${params.collectionId},
      ${preview},
      ${now},
      ${now},
      ${now}
    )
  `;

  return requireChatSession(params.userId, id);
}

export async function listChatSessions(
  userId: string,
  collectionId?: string,
): Promise<ChatSession[]> {
  const sql = await ensureKnowledgeDatabase();
  const rows = await sql<ChatSessionRow[]>`
    SELECT
      id,
      owner_user_id,
      title,
      collection_id,
      preview,
      created_at,
      updated_at,
      last_message_at
    FROM kb_chat_sessions
    WHERE owner_user_id = ${userId}
      ${collectionId ? sql`AND collection_id = ${collectionId}` : sql``}
    ORDER BY last_message_at DESC
  `;

  return rows.map((row) => toChatSession(row));
}

export async function getChatSessionById(
  userId: string,
  sessionId: string,
): Promise<ChatSession | undefined> {
  const sql = await ensureKnowledgeDatabase();
  const [row] = await sql<ChatSessionRow[]>`
    SELECT
      id,
      owner_user_id,
      title,
      collection_id,
      preview,
      created_at,
      updated_at,
      last_message_at
    FROM kb_chat_sessions
    WHERE owner_user_id = ${userId}
      AND id = ${sessionId}
    LIMIT 1
  `;

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
  const sql = await ensureKnowledgeDatabase();

  await sql`
    UPDATE kb_chat_sessions
    SET title = ${params.title.trim()}, updated_at = ${nowIso()}
    WHERE owner_user_id = ${params.userId}
      AND id = ${params.sessionId}
  `;

  return requireChatSession(params.userId, params.sessionId);
}

export async function deleteChatSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  await requireChatSession(userId, sessionId);
  const sql = await ensureKnowledgeDatabase();

  await sql`
    DELETE FROM kb_chat_sessions
    WHERE owner_user_id = ${userId}
      AND id = ${sessionId}
  `;
}

export async function listChatMessages(
  userId: string,
  sessionId: string,
): Promise<ChatMessage[]> {
  await requireChatSession(userId, sessionId);
  const sql = await ensureKnowledgeDatabase();
  const rows = await sql<ChatMessageRow[]>`
    SELECT
      m.id,
      m.owner_user_id,
      m.session_id,
      m.role,
      m.content,
      m.citations_json,
      m.retrieval_json,
      m.trace_json,
      m.created_at,
      f.id AS feedback_id,
      f.rating AS feedback_rating,
      f.note AS feedback_note,
      f.created_at AS feedback_created_at
    FROM kb_chat_messages m
    LEFT JOIN kb_chat_feedback f ON f.message_id = m.id
    WHERE m.owner_user_id = ${userId}
      AND m.session_id = ${sessionId}
    ORDER BY m.created_at ASC
  `;

  return rows.map((row) => toChatMessage(row));
}

export async function appendChatMessage(params: {
  userId: string;
  sessionId: string;
  role: ChatMessage["role"];
  content: string;
  citations?: ChatMessage["citations"];
  retrieval?: SearchKnowledgeResult;
  trace?: ChatTraceEvent[];
}): Promise<ChatMessage> {
  const session = await requireChatSession(params.userId, params.sessionId);
  const sql = await ensureKnowledgeDatabase();
  const id = crypto.randomUUID();
  const now = nowIso();
  const preview = params.content.trim().slice(0, 160);

  await sql`
    INSERT INTO kb_chat_messages (
      id,
      owner_user_id,
      session_id,
      role,
      content,
      citations_json,
      retrieval_json,
      trace_json,
      created_at
    ) VALUES (
      ${id},
      ${params.userId},
      ${params.sessionId},
      ${params.role},
      ${params.content.trim()},
      ${JSON.stringify(params.citations ?? [])},
      ${params.retrieval ? JSON.stringify(params.retrieval) : null},
      ${params.trace ? JSON.stringify(params.trace) : null},
      ${now}
    )
  `;

  await sql`
    UPDATE kb_chat_sessions
    SET
      preview = ${params.role === "user" ? preview : session.preview},
      updated_at = ${now},
      last_message_at = ${now}
    WHERE owner_user_id = ${params.userId}
      AND id = ${params.sessionId}
  `;

  const messages = await listChatMessages(params.userId, params.sessionId);
  return messages.find((message) => message.id === id)!;
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
  const sql = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id = crypto.randomUUID();

  await sql`
    DELETE FROM kb_chat_feedback
    WHERE owner_user_id = ${params.userId}
      AND message_id = ${params.messageId}
  `;

  await sql`
    INSERT INTO kb_chat_feedback (
      id,
      owner_user_id,
      message_id,
      rating,
      note,
      created_at
    ) VALUES (
      ${id},
      ${params.userId},
      ${params.messageId},
      ${params.input.rating},
      ${params.input.note?.trim() || null},
      ${now}
    )
  `;

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
  const sql = await ensureKnowledgeDatabase();
  const rows = await sql<BriefingExportRow[]>`
    SELECT
      id,
      owner_user_id,
      source_id,
      document_id,
      title,
      summary,
      form_json,
      citations_json,
      created_at
    FROM kb_briefing_exports
    WHERE owner_user_id = ${userId}
      AND source_id = ${sourceId}
    ORDER BY created_at DESC
  `;

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
  const sql = await ensureKnowledgeDatabase();
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

  await sql`
    INSERT INTO kb_briefing_exports (
      id,
      owner_user_id,
      source_id,
      document_id,
      title,
      summary,
      form_json,
      citations_json,
      created_at
    ) VALUES (
      ${exportRecord.id},
      ${params.userId},
      ${params.sourceId},
      ${params.documentId},
      ${params.title},
      ${params.summary},
      ${JSON.stringify(params.form)},
      ${JSON.stringify(params.citations)},
      ${exportRecord.createdAt}
    )
  `;

  return exportRecord;
}
