import postgres, { type Sql } from "postgres";
import { getDatabaseUrl } from "./config";

let sqlCache: Sql | undefined;
let sqlUrlCache = "";
let schemaInitPromise: Promise<void> | undefined;

function createSqlClient(): Sql {
  return postgres(getDatabaseUrl(), {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 30,
    onnotice() {},
    prepare: false,
  });
}

export function getKnowledgeDatabase(): Sql {
  const nextUrl = getDatabaseUrl();

  if (!sqlCache || sqlUrlCache !== nextUrl) {
    void sqlCache?.end({ timeout: 1 });
    sqlCache = createSqlClient();
    sqlUrlCache = nextUrl;
    schemaInitPromise = undefined;
  }

  return sqlCache;
}

export async function ensureKnowledgeDatabase(): Promise<Sql> {
  const sql = getKnowledgeDatabase();

  if (!schemaInitPromise) {
    schemaInitPromise = initializeSchema(sql);
  }

  await schemaInitPromise;
  return sql;
}

async function initializeSchema(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      last_activity_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content_preview TEXT NOT NULL,
      content TEXT NOT NULL,
      tags_json JSONB NOT NULL,
      source_type TEXT NOT NULL,
      legacy_source TEXT NOT NULL,
      status TEXT NOT NULL,
      source_filename TEXT,
      source_url TEXT,
      mime_type TEXT,
      byte_size BIGINT,
      latest_version INTEGER NOT NULL DEFAULT 1,
      ready_at TIMESTAMPTZ,
      last_processed_at TIMESTAMPTZ,
      snapshot_updated_at TIMESTAMPTZ,
      failure_message TEXT,
      original_path TEXT,
      index_path TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_collections_owner
    ON collections (owner_user_id, updated_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sources_owner
    ON sources (owner_user_id, updated_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sources_collection
    ON sources (collection_id, updated_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sources_document
    ON sources (owner_user_id, document_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      error_message TEXT,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_import_jobs_owner
    ON import_jobs (owner_user_id, started_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
      preview TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      last_message_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_owner
    ON chat_sessions (owner_user_id, last_message_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations_json JSONB NOT NULL,
      retrieval_json JSONB,
      trace_json JSONB,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session
    ON chat_messages (session_id, created_at ASC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chat_feedback (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      rating TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_chat_feedback_owner
    ON chat_feedback (owner_user_id, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS briefing_exports (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      form_json JSONB NOT NULL,
      citations_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_briefing_exports_source
    ON briefing_exports (source_id, created_at DESC)
  `;
}

export async function resetKnowledgeDatabase(): Promise<void> {
  const sql = await ensureKnowledgeDatabase();

  await sql.begin(async (transaction) => {
    await transaction`TRUNCATE TABLE briefing_exports, chat_feedback, chat_messages, chat_sessions, import_jobs, sources, collections, users CASCADE`;
  });
}
