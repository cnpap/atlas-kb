import postgres, { type Sql } from "postgres";
import { getDatabaseUrl } from "./config";
import { KNOWLEDGE_TABLES } from "./tables";

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
    CREATE TABLE IF NOT EXISTS ${sql.unsafe(KNOWLEDGE_TABLES.users)} (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${sql.unsafe(KNOWLEDGE_TABLES.collections)} (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.users)}(id) ON DELETE CASCADE,
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
    CREATE TABLE IF NOT EXISTS ${sql.unsafe(KNOWLEDGE_TABLES.sources)} (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.users)}(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.collections)}(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_kb_collections_owner
    ON ${sql.unsafe(KNOWLEDGE_TABLES.collections)} (owner_user_id, updated_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_kb_sources_owner
    ON ${sql.unsafe(KNOWLEDGE_TABLES.sources)} (owner_user_id, updated_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_kb_sources_collection
    ON ${sql.unsafe(KNOWLEDGE_TABLES.sources)} (collection_id, updated_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_kb_sources_document
    ON ${sql.unsafe(KNOWLEDGE_TABLES.sources)} (owner_user_id, document_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${sql.unsafe(KNOWLEDGE_TABLES.importJobs)} (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.users)}(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.sources)}(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.collections)}(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_kb_import_jobs_owner
    ON ${sql.unsafe(KNOWLEDGE_TABLES.importJobs)} (owner_user_id, started_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${sql.unsafe(KNOWLEDGE_TABLES.chatSessions)} (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.users)}(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      collection_id TEXT REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.collections)}(id) ON DELETE SET NULL,
      preview TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      last_message_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_kb_chat_sessions_owner
    ON ${sql.unsafe(KNOWLEDGE_TABLES.chatSessions)} (owner_user_id, last_message_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${sql.unsafe(KNOWLEDGE_TABLES.chatMessages)} (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.users)}(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.chatSessions)}(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations_json JSONB NOT NULL,
      retrieval_json JSONB,
      trace_json JSONB,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_kb_chat_messages_session
    ON ${sql.unsafe(KNOWLEDGE_TABLES.chatMessages)} (session_id, created_at ASC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${sql.unsafe(KNOWLEDGE_TABLES.chatFeedback)} (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.users)}(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.chatMessages)}(id) ON DELETE CASCADE,
      rating TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_kb_chat_feedback_owner
    ON ${sql.unsafe(KNOWLEDGE_TABLES.chatFeedback)} (owner_user_id, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${sql.unsafe(KNOWLEDGE_TABLES.briefingExports)} (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.users)}(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES ${sql.unsafe(KNOWLEDGE_TABLES.sources)}(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      form_json JSONB NOT NULL,
      citations_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_kb_briefing_exports_source
    ON ${sql.unsafe(KNOWLEDGE_TABLES.briefingExports)} (source_id, created_at DESC)
  `;
}

export async function resetKnowledgeDatabase(): Promise<void> {
  const sql = await ensureKnowledgeDatabase();

  await sql.begin(async (transaction) => {
    await transaction.unsafe(
      `TRUNCATE TABLE ${[
        KNOWLEDGE_TABLES.briefingExports,
        KNOWLEDGE_TABLES.chatFeedback,
        KNOWLEDGE_TABLES.chatMessages,
        KNOWLEDGE_TABLES.chatSessions,
        KNOWLEDGE_TABLES.importJobs,
        KNOWLEDGE_TABLES.sources,
        KNOWLEDGE_TABLES.collections,
        KNOWLEDGE_TABLES.users,
      ].join(", ")} CASCADE`,
    );
  });
}
