import { ConflictError, NotFoundError } from "@atlas-kb/errors";
import type {
  ChatMessagesData,
  ChatMessage,
  ChatMessageFeedback,
  ChatMessageFeedbackRequest,
  ChatSession,
  ChatTraceEvent,
  DashboardSummary,
  KnowledgeCollectionData,
  KnowledgeCollection,
  KnowledgeCollectionCreateRequest,
  KnowledgeCollectionUpdateRequest,
  KnowledgeDocumentsData,
  KnowledgeImportJob,
  KnowledgeSourceData,
  KnowledgeSourcesData,
  KnowledgeSource,
  SearchKnowledgeResult,
} from "@atlas-kb/schema";
import { getKnowledgeDatabasePath } from "./config";
import { getKnowledgeDatabase, resetKnowledgeDatabase } from "./db";
import { DEMO_COLLECTIONS, DEMO_SOURCES } from "./seed";
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
  title: string;
  collection_id: string | null;
  preview: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type ChatMessageRow = {
  id: string;
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
    c.name,
    c.description,
    c.color,
    c.icon,
    c.is_pinned,
    c.created_at,
    c.updated_at,
    c.last_activity_at,
    COUNT(s.id) AS document_count,
    SUM(CASE WHEN s.status = 'ready' THEN 1 ELSE 0 END) AS ready_document_count,
    SUM(CASE WHEN s.status = 'processing' THEN 1 ELSE 0 END) AS processing_document_count,
    SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END) AS failed_document_count
  FROM collections c
  LEFT JOIN sources s ON s.collection_id = c.id
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

function getCollectionCount(): number {
  const database = getKnowledgeDatabase();
  const row = database
    .query("SELECT COUNT(*) AS count FROM collections")
    .get() as { count: number } | null;

  return Number(row?.count ?? 0);
}

function insertSeedCollection(collection: KnowledgeCollection): void {
  const database = getKnowledgeDatabase();

  database
    .query(
      `
        INSERT INTO collections (
          id,
          name,
          description,
          color,
          icon,
          is_pinned,
          created_at,
          updated_at,
          last_activity_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      collection.id,
      collection.name,
      collection.description,
      collection.color,
      collection.icon,
      Number(collection.isPinned),
      collection.createdAt,
      collection.updatedAt,
      collection.lastActivityAt,
    );
}

function insertSeedSource(source: KnowledgeSource): void {
  const database = getKnowledgeDatabase();

  database
    .query(
      `
        INSERT INTO sources (
          id,
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      source.id,
      source.collectionId,
      source.title,
      source.summary,
      source.excerpt,
      source.contentPreview,
      source.content,
      JSON.stringify(source.tags),
      source.sourceType,
      source.source,
      source.status,
      source.sourceFilename ?? null,
      source.sourceUrl ?? null,
      source.mimeType ?? null,
      source.byteSize ?? null,
      source.latestVersion,
      source.readyAt ?? null,
      source.lastProcessedAt ?? null,
      source.snapshotUpdatedAt ?? null,
      source.failureMessage ?? null,
      source.createdAt,
      source.updatedAt,
    );

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
      `${source.id}:v1`,
      source.id,
      0,
      "seed",
      source.content,
      source.contentPreview,
      source.mimeType ?? null,
      source.byteSize ?? null,
      null,
      null,
      source.sourceUrl ?? null,
      source.createdAt,
    );

  const chunks = chunkKnowledgeContent({
    content: source.content,
    sourceId: source.id,
    title: source.title,
  });

  const insertChunk = database.query(
    `
      INSERT INTO source_chunks (
        chunk_id,
        source_id,
        collection_id,
        chunk_index,
        section_path,
        title,
        text,
        lexical_text,
        tags_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      source.id,
      source.collectionId,
      chunk.chunkIndex,
      chunk.sectionPath ?? null,
      chunk.title,
      chunk.text,
      buildLexicalIndexText([
        source.title,
        source.summary,
        chunk.sectionPath ?? "",
        chunk.text,
        source.tags.join(" "),
      ]),
      JSON.stringify(source.tags),
      source.updatedAt,
    );

    const rowId = database
      .query("SELECT id FROM source_chunks WHERE chunk_id = ?")
      .get(chunk.chunkId) as { id: number } | null;

    if (rowId) {
      insertFts.run(
        rowId.id,
        chunk.chunkId,
        chunk.title,
        buildLexicalIndexText([
          chunk.title,
          chunk.sectionPath ?? "",
          chunk.text,
          source.tags.join(" "),
        ]),
      );
    }
  }
}

function ensureSeedData(): void {
  if (getCollectionCount() > 0) {
    return;
  }

  const database = getKnowledgeDatabase();

  database.transaction(() => {
    for (const collection of DEMO_COLLECTIONS) {
      insertSeedCollection(collection);
    }

    for (const source of DEMO_SOURCES) {
      insertSeedSource(source);
    }
  })();
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

export async function listKnowledgeCollections(): Promise<
  KnowledgeCollection[]
> {
  ensureSeedData();
  const database = getKnowledgeDatabase();
  const rows = database
    .query(
      `${collectionQuery}
      GROUP BY c.id
      ORDER BY c.is_pinned DESC, c.last_activity_at DESC, c.name ASC`,
    )
    .all() as CollectionRow[];

  return rows.map(toCollection);
}

export async function listKnowledgeSpaces(): Promise<KnowledgeCollection[]> {
  return listKnowledgeCollections();
}

export async function getKnowledgeCollection(
  collectionId: string,
): Promise<KnowledgeCollection | undefined> {
  ensureSeedData();
  const database = getKnowledgeDatabase();
  const row = database
    .query(
      `${collectionQuery}
      WHERE c.id = ?
      GROUP BY c.id`,
    )
    .get(collectionId) as CollectionRow | null;

  return row ? toCollection(row) : undefined;
}

export async function getKnowledgeCollectionData(
  collectionId: string,
): Promise<KnowledgeCollectionData> {
  return {
    collection: await requireKnowledgeCollection(collectionId),
  };
}

export async function getKnowledgeSpace(
  spaceId: string,
): Promise<KnowledgeCollection | undefined> {
  return getKnowledgeCollection(spaceId);
}

export async function requireKnowledgeCollection(
  collectionId: string,
): Promise<KnowledgeCollection> {
  const collection = await getKnowledgeCollection(collectionId);

  if (!collection) {
    throw new NotFoundError(`Knowledge collection "${collectionId}" not found`);
  }

  return collection;
}

export async function requireKnowledgeSpace(
  spaceId: string,
): Promise<KnowledgeCollection> {
  return requireKnowledgeCollection(spaceId);
}

export async function createKnowledgeCollection(
  input: KnowledgeCollectionCreateRequest,
): Promise<KnowledgeCollection> {
  ensureSeedData();
  const database = getKnowledgeDatabase();
  const id = input.id ? slugify(input.id) : slugify(input.name);

  const existing = database
    .query("SELECT id FROM collections WHERE id = ?")
    .get(id) as { id: string } | null;

  if (existing) {
    throw new ConflictError(`Knowledge collection "${id}" already exists`);
  }

  const now = nowIso();

  database
    .query(
      `
        INSERT INTO collections (
          id,
          name,
          description,
          color,
          icon,
          is_pinned,
          created_at,
          updated_at,
          last_activity_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
      input.name.trim(),
      input.description.trim(),
      input.color?.trim() || "#0f766e",
      input.icon?.trim() || "i-lucide-library",
      0,
      now,
      now,
      now,
    );

  return requireKnowledgeCollection(id);
}

export async function createKnowledgeSpace(
  input: KnowledgeCollectionCreateRequest,
): Promise<KnowledgeCollection> {
  return createKnowledgeCollection(input);
}

export async function updateKnowledgeCollection(params: {
  collectionId: string;
  input: KnowledgeCollectionUpdateRequest;
}): Promise<KnowledgeCollection> {
  const collection = await requireKnowledgeCollection(params.collectionId);
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
        WHERE id = ?
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
      params.collectionId,
    );

  return requireKnowledgeCollection(params.collectionId);
}

export async function deleteKnowledgeCollection(
  collectionId: string,
): Promise<void> {
  await requireKnowledgeCollection(collectionId);
  const database = getKnowledgeDatabase();
  database.query("DELETE FROM collections WHERE id = ?").run(collectionId);
}

export async function listKnowledgeSources(
  collectionId?: string,
): Promise<KnowledgeSource[]> {
  ensureSeedData();
  const database = getKnowledgeDatabase();
  const rows = collectionId
    ? (database
        .query(
          `
            SELECT * FROM sources
            WHERE collection_id = ?
            ORDER BY updated_at DESC, title ASC
          `,
        )
        .all(collectionId) as SourceRow[])
    : (database
        .query(
          `
            SELECT * FROM sources
            ORDER BY updated_at DESC, title ASC
          `,
        )
        .all() as SourceRow[]);

  return rows.map(toSource);
}

export async function listKnowledgeDocuments(
  collectionId?: string,
): Promise<KnowledgeSource[]> {
  return listKnowledgeSources(collectionId);
}

export async function getKnowledgeCollectionSources(
  collectionId: string,
): Promise<KnowledgeDocumentsData> {
  const [collection, sources] = await Promise.all([
    requireKnowledgeCollection(collectionId),
    listKnowledgeSources(collectionId),
  ]);

  return {
    space: collection,
    documents: sources,
  };
}

export async function getKnowledgeCollectionSourcesData(
  collectionId: string,
): Promise<KnowledgeSourcesData> {
  const [collection, sources] = await Promise.all([
    requireKnowledgeCollection(collectionId),
    listKnowledgeSources(collectionId),
  ]);

  return {
    collection,
    sources,
  };
}

export async function getKnowledgeSpaceDocuments(
  collectionId: string,
): Promise<KnowledgeDocumentsData> {
  return getKnowledgeCollectionSources(collectionId);
}

export async function getKnowledgeSourceById(
  sourceId: string,
): Promise<KnowledgeSource | undefined> {
  ensureSeedData();
  const database = getKnowledgeDatabase();
  const row = database
    .query("SELECT * FROM sources WHERE id = ?")
    .get(sourceId) as SourceRow | null;

  return row ? toSource(row) : undefined;
}

export async function getKnowledgeSourceData(
  sourceId: string,
): Promise<KnowledgeSourceData> {
  return {
    source: await requireKnowledgeSource(sourceId),
  };
}

export async function getDocumentById(
  sourceId: string,
): Promise<StoredKnowledgeSource | undefined> {
  const source = await getKnowledgeSourceById(sourceId);

  if (!source) {
    return undefined;
  }

  const version = await getLatestSourceVersion(sourceId);

  return {
    ...source,
    filePath: version?.filePath,
    parser: version?.parser,
    snapshotHtml: version?.snapshotHtml,
  };
}

export async function requireKnowledgeSource(
  sourceId: string,
): Promise<KnowledgeSource> {
  const source = await getKnowledgeSourceById(sourceId);

  if (!source) {
    throw new NotFoundError(`Knowledge source "${sourceId}" not found`);
  }

  return source;
}

export async function getLatestSourceVersion(
  sourceId: string,
): Promise<StoredSourceVersion | undefined> {
  ensureSeedData();
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
  limit = 50,
): Promise<KnowledgeImportJob[]> {
  ensureSeedData();
  const database = getKnowledgeDatabase();
  const rows = database
    .query(
      `
        SELECT *
        FROM import_jobs
        ORDER BY started_at DESC
        LIMIT ?
      `,
    )
    .all(limit) as ImportJobRow[];

  return rows.map(toImportJob);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  ensureSeedData();
  const database = getKnowledgeDatabase();
  const counts = database
    .query(
      `
        SELECT
          (SELECT COUNT(*) FROM collections) AS collections_count,
          (SELECT COUNT(*) FROM sources WHERE status = 'ready') AS ready_sources_count,
          (SELECT COUNT(*) FROM sources WHERE status = 'processing') AS processing_sources_count,
          (SELECT COUNT(*) FROM sources WHERE status = 'failed') AS failed_sources_count,
          (SELECT COUNT(*) FROM chat_sessions) AS chat_sessions_count
      `,
    )
    .get() as {
    collections_count: number;
    ready_sources_count: number;
    processing_sources_count: number;
    failed_sources_count: number;
    chat_sessions_count: number;
  } | null;

  const [recentCollections, recentSources, recentSessions] = await Promise.all([
    listKnowledgeCollections().then((items) => items.slice(0, 4)),
    listKnowledgeSources().then((items) => items.slice(0, 6)),
    listChatSessions().then((items) => items.slice(0, 6)),
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
  collectionId: string;
  sourceId: string;
  sourceType: KnowledgeImportJob["sourceType"];
  attempt: number;
}): Promise<KnowledgeImportJob> {
  const database = getKnowledgeDatabase();
  const id = crypto.randomUUID();
  const startedAt = nowIso();

  database
    .query(
      `
        INSERT INTO import_jobs (
          id,
          source_id,
          collection_id,
          source_type,
          stage,
          status,
          attempt,
          error_message,
          started_at,
          finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
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
        WHERE id = ?
      `,
    )
    .run(
      params.stage,
      params.status,
      params.errorMessage ?? null,
      finishedAt,
      params.jobId,
    );
}

export async function createSourceDraft(params: {
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
  await requireKnowledgeCollection(params.collectionId);
  const database = getKnowledgeDatabase();
  const now = nowIso();
  const baseId = slugify(
    params.title || params.sourceFilename || params.sourceUrl || "source",
  );
  let id = baseId;
  let suffix = 1;

  while (database.query("SELECT id FROM sources WHERE id = ?").get(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const summary = params.summary?.trim() || "正在处理内容...";

  database
    .query(
      `
        INSERT INTO sources (
          id,
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
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

  database
    .query(
      `
        UPDATE collections
        SET updated_at = ?, last_activity_at = ?
        WHERE id = ?
      `,
    )
    .run(now, now, params.collectionId);

  return requireKnowledgeSource(id);
}

export async function replaceSourceContent(params: {
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
  const source = await requireKnowledgeSource(params.sourceId);
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
          WHERE id = ?
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
            source_id,
            collection_id,
            chunk_index,
            section_path,
            title,
            text,
            lexical_text,
            tags_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

        const row = database
          .query("SELECT id FROM source_chunks WHERE chunk_id = ?")
          .get(chunk.chunkId) as { id: number } | null;

        if (row) {
          insertFts.run(
            row.id,
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

    database
      .query(
        `
          UPDATE collections
          SET updated_at = ?, last_activity_at = ?
          WHERE id = ?
        `,
      )
      .run(now, now, source.collectionId);
  })();

  return requireKnowledgeSource(params.sourceId);
}

export async function deleteKnowledgeSource(sourceId: string): Promise<void> {
  await requireKnowledgeSource(sourceId);
  const database = getKnowledgeDatabase();
  database.query("DELETE FROM sources WHERE id = ?").run(sourceId);
}

export async function archiveKnowledgeSource(
  sourceId: string,
): Promise<KnowledgeSource> {
  await requireKnowledgeSource(sourceId);
  const database = getKnowledgeDatabase();
  database
    .query("UPDATE sources SET status = ?, updated_at = ? WHERE id = ?")
    .run("archived", nowIso(), sourceId);

  return requireKnowledgeSource(sourceId);
}

export async function listChatSessions(): Promise<ChatSession[]> {
  ensureSeedData();
  const database = getKnowledgeDatabase();
  const rows = database
    .query(
      `
        SELECT *
        FROM chat_sessions
        ORDER BY last_message_at DESC, updated_at DESC
      `,
    )
    .all() as ChatSessionRow[];

  return rows.map(toChatSession);
}

export async function createChatSession(params: {
  title?: string;
  collectionId?: string;
}): Promise<ChatSession> {
  if (params.collectionId) {
    await requireKnowledgeCollection(params.collectionId);
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
          title,
          collection_id,
          preview,
          created_at,
          updated_at,
          last_message_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      session.id,
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
  sessionId: string,
): Promise<ChatSession | undefined> {
  ensureSeedData();
  const database = getKnowledgeDatabase();
  const row = database
    .query("SELECT * FROM chat_sessions WHERE id = ?")
    .get(sessionId) as ChatSessionRow | null;

  return row ? toChatSession(row) : undefined;
}

export async function requireChatSession(
  sessionId: string,
): Promise<ChatSession> {
  const session = await getChatSessionById(sessionId);

  if (!session) {
    throw new NotFoundError(`Chat session "${sessionId}" not found`);
  }

  return session;
}

export async function updateChatSession(params: {
  sessionId: string;
  title: string;
}): Promise<ChatSession> {
  await requireChatSession(params.sessionId);
  const database = getKnowledgeDatabase();
  database
    .query("UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?")
    .run(params.title.trim(), nowIso(), params.sessionId);

  return requireChatSession(params.sessionId);
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await requireChatSession(sessionId);
  const database = getKnowledgeDatabase();
  database.query("DELETE FROM chat_sessions WHERE id = ?").run(sessionId);
}

export async function listChatMessages(
  sessionId: string,
): Promise<ChatMessage[]> {
  await requireChatSession(sessionId);
  const database = getKnowledgeDatabase();
  const rows = database
    .query(
      `
        SELECT
          m.id,
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
        WHERE m.session_id = ?
        ORDER BY m.created_at ASC
      `,
    )
    .all(sessionId) as ChatMessageRow[];

  return rows.map(toChatMessage);
}

export async function getChatMessagesData(
  sessionId: string,
): Promise<ChatMessagesData> {
  const [session, messages] = await Promise.all([
    requireChatSession(sessionId),
    listChatMessages(sessionId),
  ]);

  return {
    session,
    messages,
  };
}

export async function appendChatMessage(params: {
  sessionId: string;
  role: ChatMessage["role"];
  content: string;
  citations?: ChatMessage["citations"];
  retrieval?: ChatMessage["retrieval"];
  trace?: ChatMessage["trace"];
}): Promise<ChatMessage> {
  const session = await requireChatSession(params.sessionId);
  const database = getKnowledgeDatabase();
  const id = crypto.randomUUID();
  const now = nowIso();
  const preview = params.content.trim().slice(0, 140);

  database
    .query(
      `
        INSERT INTO chat_messages (
          id,
          session_id,
          role,
          content,
          citations_json,
          retrieval_json,
          trace_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
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
        WHERE id = ?
      `,
    )
    .run(
      preview || session.preview,
      now,
      now,
      session.collectionId ?? null,
      params.role === "user" ? "1" : "",
      params.role === "user" ? preview.slice(0, 24) : session.title,
      params.sessionId,
    );

  const row = database
    .query(
      `
        SELECT
          m.id,
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
        WHERE m.id = ?
      `,
    )
    .get(id) as ChatMessageRow | null;

  if (!row) {
    throw new NotFoundError(`Chat message "${id}" not found after insert`);
  }

  return toChatMessage(row);
}

export async function saveMessageFeedback(params: {
  messageId: string;
  input: ChatMessageFeedbackRequest;
}): Promise<ChatMessageFeedback> {
  const database = getKnowledgeDatabase();
  const message = database
    .query("SELECT id FROM chat_messages WHERE id = ?")
    .get(params.messageId) as { id: string } | null;

  if (!message) {
    throw new NotFoundError(`Chat message "${params.messageId}" not found`);
  }

  const existing = database
    .query("SELECT id FROM chat_feedback WHERE message_id = ?")
    .get(params.messageId) as { id: string } | null;
  const now = nowIso();
  const id = existing?.id ?? crypto.randomUUID();

  if (existing) {
    database
      .query(
        `
          UPDATE chat_feedback
          SET rating = ?, note = ?, created_at = ?
          WHERE id = ?
        `,
      )
      .run(params.input.rating, params.input.note ?? null, now, existing.id);
  } else {
    database
      .query(
        `
          INSERT INTO chat_feedback (
            id,
            message_id,
            rating,
            note,
            created_at
          ) VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(
        id,
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
