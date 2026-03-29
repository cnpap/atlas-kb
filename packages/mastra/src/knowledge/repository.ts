import { NotFoundError } from "@atlas-kb/errors";
import type {
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
  KnowledgeDocumentsData,
  KnowledgeImportJob,
  KnowledgeSource,
  KnowledgeSourceData,
  KnowledgeSourcesData,
  SearchKnowledgeResult,
} from "@atlas-kb/schema";
import { getKnowledgeDatabasePath } from "./config";
import { getKnowledgeDatabase, resetKnowledgeDatabase } from "./db";
import {
  buildContentPreview,
  buildLexicalIndexText,
  buildSummary,
  chunkKnowledgeContent,
  normalizeWhitespace,
  slugify,
} from "./search-utils";

type CollectionRow = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  document_count: number;
  ready_document_count: number;
  processing_document_count: number;
  failed_document_count: number;
};

type SourceRow = {
  id: string;
  owner_user_id: string;
  collection_id: string;
  title: string;
  summary: string;
  excerpt: string;
  content_preview: string;
  content: string;
  tags_json: string;
  source_type: KnowledgeSource["sourceType"];
  legacy_source: KnowledgeSource["source"];
  status: KnowledgeSource["status"];
  source_filename: string | null;
  source_url: string | null;
  mime_type: string | null;
  byte_size: number | null;
  latest_version: number;
  ready_at: string | null;
  last_processed_at: string | null;
  snapshot_updated_at: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
};

type ImportJobRow = {
  id: string;
  owner_user_id: string;
  source_id: string;
  collection_id: string;
  source_type: KnowledgeImportJob["sourceType"];
  stage: KnowledgeImportJob["stage"];
  status: KnowledgeImportJob["status"];
  attempt: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

type ChatSessionRow = {
  id: string;
  owner_user_id: string;
  title: string;
  collection_id: string | null;
  preview: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type ChatMessageRow = {
  id: string;
  owner_user_id: string;
  session_id: string;
  role: ChatMessage["role"];
  content: string;
  citations_json: string;
  retrieval_json: string | null;
  trace_json: string | null;
  created_at: string;
  feedback_id: string | null;
  feedback_rating: ChatMessageFeedback["rating"] | null;
  feedback_note: string | null;
  feedback_created_at: string | null;
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
    COUNT(s.id) AS document_count,
    COALESCE(SUM(CASE WHEN s.status = 'ready' THEN 1 ELSE 0 END), 0) AS ready_document_count,
    COALESCE(SUM(CASE WHEN s.status = 'processing' THEN 1 ELSE 0 END), 0) AS processing_document_count,
    COALESCE(SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_document_count
  FROM collections c
  LEFT JOIN sources s
    ON s.collection_id = c.id
   AND s.owner_user_id = c.owner_user_id
`;

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function parseOptionalJson<T>(raw: string | null): T | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
  };
}

function toSource(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    collectionId: row.collection_id,
    spaceId: row.collection_id,
    title: row.title,
    summary: row.summary,
    excerpt: row.excerpt,
    contentPreview: row.content_preview,
    content: row.content,
    tags: parseJsonArray(row.tags_json),
    sourceType: row.source_type,
    source: row.legacy_source,
    status: row.status,
    sourceFilename: row.source_filename ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    mimeType: row.mime_type ?? undefined,
    byteSize: row.byte_size ?? undefined,
    latestVersion: row.latest_version,
    readyAt: row.ready_at ?? undefined,
    lastProcessedAt: row.last_processed_at ?? undefined,
    snapshotUpdatedAt: row.snapshot_updated_at ?? undefined,
    failureMessage: row.failure_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toImportJob(row: ImportJobRow): KnowledgeImportJob {
  return {
    id: row.id,
    sourceId: row.source_id,
    collectionId: row.collection_id,
    sourceType: row.source_type,
    stage: row.stage,
    status: row.status,
    attempt: row.attempt,
    errorMessage: row.error_message ?? undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
  };
}

function toChatSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    collectionId: row.collection_id ?? undefined,
    preview: row.preview,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
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
          createdAt: row.feedback_created_at,
        }
      : undefined;

  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    citations: JSON.parse(row.citations_json) as ChatMessage["citations"],
    retrieval: parseOptionalJson<SearchKnowledgeResult>(row.retrieval_json),
    trace: parseOptionalJson<ChatTraceEvent[]>(row.trace_json),
    createdAt: row.created_at,
    feedback,
  };
}

async function touchCollection(collectionId: string): Promise<void> {
  const database = getKnowledgeDatabase();
  const now = nowIso();

  database
    .query(
      `
        UPDATE collections
        SET updated_at = ?, last_activity_at = ?
        WHERE id = ?
      `,
    )
    .run(now, now, collectionId);
}

function getCollectionRow(
  userId: string,
  collectionId: string,
): CollectionRow | null {
  const database = getKnowledgeDatabase();
  return (
    (database
      .query(
        `${collectionQuery}
        WHERE c.owner_user_id = ? AND c.id = ?
        GROUP BY c.id`,
      )
      .get(userId, collectionId) as CollectionRow | null) ?? null
  );
}

function getSourceRow(userId: string, sourceId: string): SourceRow | null {
  const database = getKnowledgeDatabase();
  return (
    (database
      .query(
        `
          SELECT *
          FROM sources
          WHERE owner_user_id = ? AND id = ?
        `,
      )
      .get(userId, sourceId) as SourceRow | null) ?? null
  );
}

function getSourceRowUnchecked(sourceId: string): SourceRow | null {
  const database = getKnowledgeDatabase();
  return (
    (database
      .query(
        `
          SELECT *
          FROM sources
          WHERE id = ?
        `,
      )
      .get(sourceId) as SourceRow | null) ?? null
  );
}

function getChatSessionRow(
  userId: string,
  sessionId: string,
): ChatSessionRow | null {
  const database = getKnowledgeDatabase();
  return (
    (database
      .query(
        `
          SELECT *
          FROM chat_sessions
          WHERE owner_user_id = ? AND id = ?
        `,
      )
      .get(userId, sessionId) as ChatSessionRow | null) ?? null
  );
}

function createUniqueId(
  table: "collections" | "sources",
  base: string,
): string {
  const database = getKnowledgeDatabase();
  const normalizedBase = slugify(base || table.slice(0, -1));
  let id = normalizedBase;
  let suffix = 1;

  while (database.query(`SELECT id FROM ${table} WHERE id = ?`).get(id)) {
    id = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }

  return id;
}

export interface StoredKnowledgeSource extends KnowledgeSource {
  filePath?: string;
  parser?: string;
  snapshotHtml?: string;
}

export interface StoredSourceVersion {
  id: string;
  sourceId: string;
  version: number;
  parser: string;
  content: string;
  contentPreview: string;
  mimeType?: string;
  byteSize?: number;
  filePath?: string;
  snapshotHtml?: string;
  sourceUrl?: string;
  createdAt: string;
}

export function resolveDatabasePath(): string {
  return getKnowledgeDatabasePath();
}

export function toStoredKnowledgeSource(
  source: KnowledgeSource,
): StoredKnowledgeSource {
  return { ...source };
}

export function resetKnowledgeRepository(): void {
  resetKnowledgeDatabase();
}

export async function listKnowledgeCollections(
  userId: string,
): Promise<KnowledgeCollection[]> {
  const database = getKnowledgeDatabase();
  const rows = database
    .query(
      `${collectionQuery}
      WHERE c.owner_user_id = ?
      GROUP BY c.id
      ORDER BY c.is_pinned DESC, c.last_activity_at DESC, c.name ASC`,
    )
    .all(userId) as CollectionRow[];

  return rows.map(toCollection);
}

export async function listKnowledgeSpaces(
  userId: string,
): Promise<KnowledgeCollection[]> {
  return listKnowledgeCollections(userId);
}

export async function getKnowledgeCollection(
  userId: string,
  collectionId: string,
): Promise<KnowledgeCollection | undefined> {
  const row = getCollectionRow(userId, collectionId);
  return row ? toCollection(row) : undefined;
}

export async function getKnowledgeCollectionData(
  userId: string,
  collectionId: string,
): Promise<KnowledgeCollectionData> {
  return {
    collection: await requireKnowledgeCollection(userId, collectionId),
  };
}

export async function getKnowledgeSpace(
  userId: string,
  spaceId: string,
): Promise<KnowledgeCollection | undefined> {
  return getKnowledgeCollection(userId, spaceId);
}

export async function requireKnowledgeCollection(
  userId: string,
  collectionId: string,
): Promise<KnowledgeCollection> {
  const collection = await getKnowledgeCollection(userId, collectionId);

  if (!collection) {
    throw new NotFoundError(`Knowledge collection "${collectionId}" not found`);
  }

  return collection;
}

export async function requireKnowledgeSpace(
  userId: string,
  spaceId: string,
): Promise<KnowledgeCollection> {
  return requireKnowledgeCollection(userId, spaceId);
}

export async function createKnowledgeCollection(params: {
  userId: string;
  input: KnowledgeCollectionCreateRequest;
}): Promise<KnowledgeCollection> {
  const database = getKnowledgeDatabase();
  const id = createUniqueId(
    "collections",
    params.input.id ? params.input.id : params.input.name,
  );
  const now = nowIso();

  database
    .query(
      `
        INSERT INTO collections (
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
      params.userId,
      params.input.name.trim(),
      params.input.description.trim(),
      params.input.color?.trim() || "#0f766e",
      params.input.icon?.trim() || "i-lucide-library",
      0,
      now,
      now,
      now,
    );

  return requireKnowledgeCollection(params.userId, id);
}

export async function createKnowledgeSpace(params: {
  userId: string;
  input: KnowledgeCollectionCreateRequest;
}): Promise<KnowledgeCollection> {
  return createKnowledgeCollection(params);
}

export async function updateKnowledgeCollection(params: {
  userId: string;
  collectionId: string;
  input: KnowledgeCollectionUpdateRequest;
}): Promise<KnowledgeCollection> {
  const collection = await requireKnowledgeCollection(
    params.userId,
    params.collectionId,
  );
  const database = getKnowledgeDatabase();
  const now = nowIso();

  database
    .query(
      `
        UPDATE collections
        SET
          name = ?,
          description = ?,
          color = ?,
          icon = ?,
          is_pinned = ?,
          updated_at = ?,
          last_activity_at = ?
        WHERE owner_user_id = ? AND id = ?
      `,
    )
    .run(
      params.input.name?.trim() || collection.name,
      params.input.description?.trim() || collection.description,
      params.input.color?.trim() || collection.color,
      params.input.icon?.trim() || collection.icon,
      Number(params.input.isPinned ?? collection.isPinned),
      now,
      now,
      params.userId,
      params.collectionId,
    );

  return requireKnowledgeCollection(params.userId, params.collectionId);
}

export async function deleteKnowledgeCollection(
  userId: string,
  collectionId: string,
): Promise<void> {
  await requireKnowledgeCollection(userId, collectionId);
  const database = getKnowledgeDatabase();
  database
    .query("DELETE FROM collections WHERE owner_user_id = ? AND id = ?")
    .run(userId, collectionId);
}

export async function listKnowledgeSources(
  userId: string,
  collectionId?: string,
): Promise<KnowledgeSource[]> {
  const database = getKnowledgeDatabase();

  if (collectionId) {
    await requireKnowledgeCollection(userId, collectionId);
  }

  const rows = collectionId
    ? (database
        .query(
          `
            SELECT *
            FROM sources
            WHERE owner_user_id = ? AND collection_id = ?
            ORDER BY updated_at DESC, title ASC
          `,
        )
        .all(userId, collectionId) as SourceRow[])
    : (database
        .query(
          `
            SELECT *
            FROM sources
            WHERE owner_user_id = ?
            ORDER BY updated_at DESC, title ASC
          `,
        )
        .all(userId) as SourceRow[]);

  return rows.map(toSource);
}

export async function listKnowledgeDocuments(
  userId: string,
  collectionId?: string,
): Promise<KnowledgeSource[]> {
  return listKnowledgeSources(userId, collectionId);
}

export async function getKnowledgeCollectionSources(
  userId: string,
  collectionId: string,
): Promise<KnowledgeDocumentsData> {
  const [collection, sources] = await Promise.all([
    requireKnowledgeCollection(userId, collectionId),
    listKnowledgeSources(userId, collectionId),
  ]);

  return {
    space: collection,
    documents: sources,
  };
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

export async function getKnowledgeSpaceDocuments(
  userId: string,
  collectionId: string,
): Promise<KnowledgeDocumentsData> {
  return getKnowledgeCollectionSources(userId, collectionId);
}

export async function getKnowledgeSourceById(
  userId: string,
  sourceId: string,
): Promise<KnowledgeSource | undefined> {
  const row = getSourceRow(userId, sourceId);
  return row ? toSource(row) : undefined;
}

export async function getKnowledgeSourceData(
  userId: string,
  sourceId: string,
): Promise<KnowledgeSourceData> {
  return {
    source: await requireKnowledgeSource(userId, sourceId),
  };
}

export async function getDocumentById(
  userId: string,
  sourceId: string,
): Promise<StoredKnowledgeSource | undefined> {
  const source = await getKnowledgeSourceById(userId, sourceId);

  if (!source) {
    return undefined;
  }

  const version = await getLatestSourceVersion(userId, sourceId);

  return {
    ...source,
    filePath: version?.filePath,
    parser: version?.parser,
    snapshotHtml: version?.snapshotHtml,
  };
}

export async function getDocumentByIdUnchecked(
  sourceId: string,
): Promise<StoredKnowledgeSource | undefined> {
  const row = getSourceRowUnchecked(sourceId);

  if (!row) {
    return undefined;
  }

  const source = toSource(row);
  const version = await getLatestSourceVersionUnchecked(sourceId);

  return {
    ...source,
    filePath: version?.filePath,
    parser: version?.parser,
    snapshotHtml: version?.snapshotHtml,
  };
}

export async function requireKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<KnowledgeSource> {
  const source = await getKnowledgeSourceById(userId, sourceId);

  if (!source) {
    throw new NotFoundError(`Knowledge source "${sourceId}" not found`);
  }

  return source;
}

export async function getLatestSourceVersion(
  userId: string,
  sourceId: string,
): Promise<StoredSourceVersion | undefined> {
  await requireKnowledgeSource(userId, sourceId);
  return getLatestSourceVersionUnchecked(sourceId);
}

export async function getLatestSourceVersionUnchecked(
  sourceId: string,
): Promise<StoredSourceVersion | undefined> {
  const database = getKnowledgeDatabase();
  const row = database
    .query(
      `
        SELECT
          id,
          source_id,
          version_number,
          parser,
          content,
          content_preview,
          mime_type,
          byte_size,
          file_path,
          snapshot_html,
          source_url,
          created_at
        FROM source_versions
        WHERE source_id = ?
        ORDER BY version_number DESC
        LIMIT 1
      `,
    )
    .get(sourceId) as {
    id: string;
    source_id: string;
    version_number: number;
    parser: string;
    content: string;
    content_preview: string;
    mime_type: string | null;
    byte_size: number | null;
    file_path: string | null;
    snapshot_html: string | null;
    source_url: string | null;
    created_at: string;
  } | null;

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    sourceId: row.source_id,
    version: row.version_number,
    parser: row.parser,
    content: row.content,
    contentPreview: row.content_preview,
    mimeType: row.mime_type ?? undefined,
    byteSize: row.byte_size ?? undefined,
    filePath: row.file_path ?? undefined,
    snapshotHtml: row.snapshot_html ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listImportJobs(
  userId: string,
  limit = 50,
): Promise<KnowledgeImportJob[]> {
  const database = getKnowledgeDatabase();
  const rows = database
    .query(
      `
        SELECT *
        FROM import_jobs
        WHERE owner_user_id = ?
        ORDER BY started_at DESC
        LIMIT ?
      `,
    )
    .all(userId, limit) as ImportJobRow[];

  return rows.map(toImportJob);
}

export async function getDashboardSummary(
  userId: string,
): Promise<DashboardSummary> {
  const database = getKnowledgeDatabase();
  const counts = database
    .query(
      `
        SELECT
          (SELECT COUNT(*) FROM collections WHERE owner_user_id = ?) AS collections_count,
          (SELECT COUNT(*) FROM sources WHERE owner_user_id = ? AND status = 'ready') AS ready_sources_count,
          (SELECT COUNT(*) FROM sources WHERE owner_user_id = ? AND status = 'processing') AS processing_sources_count,
          (SELECT COUNT(*) FROM sources WHERE owner_user_id = ? AND status = 'failed') AS failed_sources_count,
          (SELECT COUNT(*) FROM chat_sessions WHERE owner_user_id = ?) AS chat_sessions_count
      `,
    )
    .get(userId, userId, userId, userId, userId) as {
    collections_count: number;
    ready_sources_count: number;
    processing_sources_count: number;
    failed_sources_count: number;
    chat_sessions_count: number;
  } | null;

  const [recentCollections, recentSources, recentSessions] = await Promise.all([
    listKnowledgeCollections(userId).then((items) => items.slice(0, 4)),
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
      Number(counts?.collections_count ?? 0) > 0 ||
      Number(counts?.chat_sessions_count ?? 0) > 0,
  };
}

export async function createImportJob(params: {
  userId: string;
  collectionId: string;
  sourceId: string;
  sourceType: KnowledgeImportJob["sourceType"];
  attempt: number;
}): Promise<KnowledgeImportJob> {
  await Promise.all([
    requireKnowledgeCollection(params.userId, params.collectionId),
    requireKnowledgeSource(params.userId, params.sourceId),
  ]);

  const database = getKnowledgeDatabase();
  const id = crypto.randomUUID();
  const startedAt = nowIso();

  database
    .query(
      `
        INSERT INTO import_jobs (
          id,
          owner_user_id,
          source_id,
          collection_id,
          source_type,
          stage,
          status,
          attempt,
          error_message,
          started_at,
          finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
      params.userId,
      params.sourceId,
      params.collectionId,
      params.sourceType,
      "queued",
      "processing",
      params.attempt,
      null,
      startedAt,
      null,
    );

  return {
    id,
    sourceId: params.sourceId,
    collectionId: params.collectionId,
    sourceType: params.sourceType,
    stage: "queued",
    status: "processing",
    attempt: params.attempt,
    startedAt,
  };
}

export async function updateImportJob(params: {
  userId: string;
  jobId: string;
  stage: KnowledgeImportJob["stage"];
  status: KnowledgeImportJob["status"];
  errorMessage?: string;
}): Promise<void> {
  const database = getKnowledgeDatabase();
  const finishedAt = params.status === "processing" ? null : nowIso();

  database
    .query(
      `
        UPDATE import_jobs
        SET
          stage = ?,
          status = ?,
          error_message = ?,
          finished_at = COALESCE(?, finished_at)
        WHERE owner_user_id = ? AND id = ?
      `,
    )
    .run(
      params.stage,
      params.status,
      params.errorMessage ?? null,
      finishedAt,
      params.userId,
      params.jobId,
    );
}

export async function createSourceDraft(params: {
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
}): Promise<KnowledgeSource> {
  await requireKnowledgeCollection(params.userId, params.collectionId);
  const database = getKnowledgeDatabase();
  const now = nowIso();
  const id = createUniqueId(
    "sources",
    params.title || params.sourceFilename || params.sourceUrl || "source",
  );
  const summary = params.summary?.trim() || "正在处理内容...";

  database
    .query(
      `
        INSERT INTO sources (
          id,
          owner_user_id,
          collection_id,
          title,
          summary,
          excerpt,
          content_preview,
          content,
          tags_json,
          source_type,
          legacy_source,
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
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
      params.userId,
      params.collectionId,
      params.title.trim(),
      summary,
      summary,
      summary,
      summary,
      JSON.stringify(params.tags ?? []),
      params.sourceType,
      params.sourceType === "seed" ? "seed" : "upload",
      "processing",
      params.sourceFilename ?? null,
      params.sourceUrl ?? null,
      params.mimeType ?? null,
      params.byteSize ?? null,
      0,
      null,
      null,
      null,
      null,
      now,
      now,
    );

  await touchCollection(params.collectionId);

  return requireKnowledgeSource(params.userId, id);
}

export async function replaceSourceContent(params: {
  userId: string;
  sourceId: string;
  title: string;
  summary?: string;
  content: string;
  tags: string[];
  parser: string;
  mimeType?: string;
  byteSize?: number;
  filePath?: string;
  snapshotHtml?: string;
  sourceFilename?: string;
  sourceUrl?: string;
  status: KnowledgeSource["status"];
  failureMessage?: string;
}): Promise<KnowledgeSource> {
  const database = getKnowledgeDatabase();
  const source = await requireKnowledgeSource(params.userId, params.sourceId);
  const row = getSourceRow(params.userId, params.sourceId);

  if (!row) {
    throw new NotFoundError(`Knowledge source "${params.sourceId}" not found`);
  }

  const now = nowIso();
  const nextVersion = source.latestVersion + 1;
  const normalizedContent = normalizeWhitespace(params.content);
  const preview = buildContentPreview(normalizedContent);
  const summary = params.summary?.trim() || buildSummary(normalizedContent);

  database.transaction(() => {
    database
      .query(
        "DELETE FROM source_chunks_fts WHERE rowid IN (SELECT id FROM source_chunks WHERE source_id = ?)",
      )
      .run(params.sourceId);
    database
      .query("DELETE FROM source_chunks WHERE source_id = ?")
      .run(params.sourceId);

    database
      .query(
        `
          INSERT INTO source_versions (
            id,
            source_id,
            version_number,
            parser,
            content,
            content_preview,
            mime_type,
            byte_size,
            file_path,
            snapshot_html,
            source_url,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        `${params.sourceId}:v${nextVersion}`,
        params.sourceId,
        nextVersion,
        params.parser,
        normalizedContent || params.failureMessage || source.content,
        preview || source.contentPreview,
        params.mimeType ?? null,
        params.byteSize ?? null,
        params.filePath ?? null,
        params.snapshotHtml ?? null,
        params.sourceUrl ?? null,
        now,
      );

    database
      .query(
        `
          UPDATE sources
          SET
            title = ?,
            summary = ?,
            excerpt = ?,
            content_preview = ?,
            content = ?,
            tags_json = ?,
            source_filename = ?,
            source_url = ?,
            mime_type = ?,
            byte_size = ?,
            latest_version = ?,
            status = ?,
            ready_at = ?,
            last_processed_at = ?,
            snapshot_updated_at = ?,
            failure_message = ?,
            updated_at = ?
          WHERE owner_user_id = ? AND id = ?
        `,
      )
      .run(
        params.title.trim(),
        summary,
        preview || source.excerpt,
        preview || source.contentPreview,
        normalizedContent || source.content,
        JSON.stringify(params.tags),
        params.sourceFilename ?? source.sourceFilename ?? null,
        params.sourceUrl ?? source.sourceUrl ?? null,
        params.mimeType ?? source.mimeType ?? null,
        params.byteSize ?? source.byteSize ?? null,
        nextVersion,
        params.status,
        params.status === "ready" ? now : null,
        now,
        source.sourceType === "url" ? now : (source.snapshotUpdatedAt ?? null),
        params.failureMessage ?? null,
        now,
        params.userId,
        params.sourceId,
      );

    if (params.status === "ready") {
      const chunks = chunkKnowledgeContent({
        content: normalizedContent,
        sourceId: params.sourceId,
        title: params.title,
      });
      const insertChunk = database.query(
        `
            INSERT INTO source_chunks (
              chunk_id,
              owner_user_id,
              source_id,
              collection_id,
              chunk_index,
              section_path,
              title,
              text,
              lexical_text,
              tags_json,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
      );
      const insertFts = database.query(
        `
            INSERT INTO source_chunks_fts (
              rowid,
              chunk_id,
              title,
              lexical_text
            ) VALUES (?, ?, ?, ?)
          `,
      );

      for (const chunk of chunks) {
        insertChunk.run(
          chunk.chunkId,
          row.owner_user_id,
          params.sourceId,
          source.collectionId,
          chunk.chunkIndex,
          chunk.sectionPath ?? null,
          chunk.title,
          chunk.text,
          buildLexicalIndexText([
            params.title,
            summary,
            chunk.sectionPath ?? "",
            chunk.text,
            params.tags.join(" "),
          ]),
          JSON.stringify(params.tags),
          now,
        );

        const chunkRow = database
          .query("SELECT id FROM source_chunks WHERE chunk_id = ?")
          .get(chunk.chunkId) as { id: number } | null;

        if (chunkRow) {
          insertFts.run(
            chunkRow.id,
            chunk.chunkId,
            chunk.title,
            buildLexicalIndexText([
              chunk.title,
              chunk.sectionPath ?? "",
              chunk.text,
              params.tags.join(" "),
            ]),
          );
        }
      }
    }
  })();

  await touchCollection(source.collectionId);

  return requireKnowledgeSource(params.userId, params.sourceId);
}

export async function deleteKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<void> {
  const source = await requireKnowledgeSource(userId, sourceId);
  const database = getKnowledgeDatabase();
  database
    .query("DELETE FROM sources WHERE owner_user_id = ? AND id = ?")
    .run(userId, sourceId);
  await touchCollection(source.collectionId);
}

export async function archiveKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<KnowledgeSource> {
  const source = await requireKnowledgeSource(userId, sourceId);
  const database = getKnowledgeDatabase();
  const now = nowIso();

  database
    .query(
      `
        UPDATE sources
        SET status = ?, updated_at = ?
        WHERE owner_user_id = ? AND id = ?
      `,
    )
    .run("archived", now, userId, sourceId);

  await touchCollection(source.collectionId);

  return requireKnowledgeSource(userId, sourceId);
}

export async function listChatSessions(userId: string): Promise<ChatSession[]> {
  const database = getKnowledgeDatabase();
  const rows = database
    .query(
      `
        SELECT *
        FROM chat_sessions
        WHERE owner_user_id = ?
        ORDER BY last_message_at DESC, updated_at DESC
      `,
    )
    .all(userId) as ChatSessionRow[];

  return rows.map(toChatSession);
}

export async function createChatSession(params: {
  userId: string;
  title?: string;
  collectionId?: string;
}): Promise<ChatSession> {
  if (params.collectionId) {
    await requireKnowledgeCollection(params.userId, params.collectionId);
  }

  const database = getKnowledgeDatabase();
  const now = nowIso();
  const session: ChatSession = {
    id: crypto.randomUUID(),
    title: params.title?.trim() || "新对话",
    collectionId: params.collectionId,
    preview: "开始提问吧",
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  };

  database
    .query(
      `
        INSERT INTO chat_sessions (
          id,
          owner_user_id,
          title,
          collection_id,
          preview,
          created_at,
          updated_at,
          last_message_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      session.id,
      params.userId,
      session.title,
      session.collectionId ?? null,
      session.preview,
      session.createdAt,
      session.updatedAt,
      session.lastMessageAt,
    );

  return session;
}

export async function getChatSessionById(
  userId: string,
  sessionId: string,
): Promise<ChatSession | undefined> {
  const row = getChatSessionRow(userId, sessionId);
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
  const database = getKnowledgeDatabase();
  database
    .query(
      `
        UPDATE chat_sessions
        SET title = ?, updated_at = ?
        WHERE owner_user_id = ? AND id = ?
      `,
    )
    .run(params.title.trim(), nowIso(), params.userId, params.sessionId);

  return requireChatSession(params.userId, params.sessionId);
}

export async function deleteChatSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  await requireChatSession(userId, sessionId);
  const database = getKnowledgeDatabase();
  database
    .query("DELETE FROM chat_sessions WHERE owner_user_id = ? AND id = ?")
    .run(userId, sessionId);
}

export async function listChatMessages(
  userId: string,
  sessionId: string,
): Promise<ChatMessage[]> {
  await requireChatSession(userId, sessionId);
  const database = getKnowledgeDatabase();
  const rows = database
    .query(
      `
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
        FROM chat_messages m
        LEFT JOIN chat_feedback f ON f.message_id = m.id
        WHERE m.owner_user_id = ? AND m.session_id = ?
        ORDER BY m.created_at ASC
      `,
    )
    .all(userId, sessionId) as ChatMessageRow[];

  return rows.map(toChatMessage);
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

export async function appendChatMessage(params: {
  userId: string;
  sessionId: string;
  role: ChatMessage["role"];
  content: string;
  citations?: ChatMessage["citations"];
  retrieval?: ChatMessage["retrieval"];
  trace?: ChatMessage["trace"];
}): Promise<ChatMessage> {
  const session = await requireChatSession(params.userId, params.sessionId);
  const database = getKnowledgeDatabase();
  const id = crypto.randomUUID();
  const now = nowIso();
  const preview = params.content.trim().slice(0, 140);

  database
    .query(
      `
        INSERT INTO chat_messages (
          id,
          owner_user_id,
          session_id,
          role,
          content,
          citations_json,
          retrieval_json,
          trace_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
      params.userId,
      params.sessionId,
      params.role,
      params.content.trim(),
      JSON.stringify(params.citations ?? []),
      params.retrieval ? JSON.stringify(params.retrieval) : null,
      params.trace ? JSON.stringify(params.trace) : null,
      now,
    );

  database
    .query(
      `
        UPDATE chat_sessions
        SET
          preview = ?,
          updated_at = ?,
          last_message_at = ?,
          collection_id = COALESCE(collection_id, ?),
          title = CASE
            WHEN title = '新对话' AND ? <> '' THEN ?
            ELSE title
          END
        WHERE owner_user_id = ? AND id = ?
      `,
    )
    .run(
      preview || session.preview,
      now,
      now,
      session.collectionId ?? null,
      params.role === "user" ? "1" : "",
      params.role === "user" ? preview.slice(0, 24) : session.title,
      params.userId,
      params.sessionId,
    );

  const row = database
    .query(
      `
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
          NULL AS feedback_id,
          NULL AS feedback_rating,
          NULL AS feedback_note,
          NULL AS feedback_created_at
        FROM chat_messages m
        WHERE m.owner_user_id = ? AND m.id = ?
      `,
    )
    .get(params.userId, id) as ChatMessageRow | null;

  if (!row) {
    throw new NotFoundError(`Chat message "${id}" not found after insert`);
  }

  return toChatMessage(row);
}

export async function saveMessageFeedback(params: {
  userId: string;
  messageId: string;
  input: ChatMessageFeedbackRequest;
}): Promise<ChatMessageFeedback> {
  const database = getKnowledgeDatabase();
  const message = database
    .query(
      `
        SELECT id
        FROM chat_messages
        WHERE owner_user_id = ? AND id = ?
      `,
    )
    .get(params.userId, params.messageId) as { id: string } | null;

  if (!message) {
    throw new NotFoundError(`Chat message "${params.messageId}" not found`);
  }

  const existing = database
    .query(
      `
        SELECT id
        FROM chat_feedback
        WHERE owner_user_id = ? AND message_id = ?
      `,
    )
    .get(params.userId, params.messageId) as { id: string } | null;
  const now = nowIso();
  const id = existing?.id ?? crypto.randomUUID();

  if (existing) {
    database
      .query(
        `
          UPDATE chat_feedback
          SET rating = ?, note = ?, created_at = ?
          WHERE owner_user_id = ? AND id = ?
        `,
      )
      .run(
        params.input.rating,
        params.input.note ?? null,
        now,
        params.userId,
        existing.id,
      );
  } else {
    database
      .query(
        `
          INSERT INTO chat_feedback (
            id,
            owner_user_id,
            message_id,
            rating,
            note,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        id,
        params.userId,
        params.messageId,
        params.input.rating,
        params.input.note ?? null,
        now,
      );
  }

  return {
    id,
    messageId: params.messageId,
    rating: params.input.rating,
    note: params.input.note,
    createdAt: now,
  };
}
