import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { getKnowledgeDatabasePath } from "./config";

let databaseCache: Database | undefined;
let databasePathCache = "";

function openDatabase(): Database {
  const databasePath = getKnowledgeDatabasePath();
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath, {
    create: true,
    strict: true,
  });

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content_preview TEXT NOT NULL,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      source_type TEXT NOT NULL,
      legacy_source TEXT NOT NULL,
      status TEXT NOT NULL,
      source_filename TEXT,
      source_url TEXT,
      mime_type TEXT,
      byte_size INTEGER,
      latest_version INTEGER NOT NULL,
      ready_at TEXT,
      last_processed_at TEXT,
      snapshot_updated_at TEXT,
      failure_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_versions (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      parser TEXT NOT NULL,
      content TEXT NOT NULL,
      content_preview TEXT NOT NULL,
      mime_type TEXT,
      byte_size INTEGER,
      file_path TEXT,
      snapshot_html TEXT,
      source_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      error_message TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS source_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chunk_id TEXT NOT NULL UNIQUE,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      section_path TEXT,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      lexical_text TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS source_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      title,
      lexical_text,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
      preview TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations_json TEXT NOT NULL,
      retrieval_json TEXT,
      trace_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_feedback (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      rating TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sources_collection ON sources(collection_id);
    CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
    CREATE INDEX IF NOT EXISTS idx_source_versions_source ON source_versions(source_id, version_number DESC);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_source ON import_jobs(source_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_source_chunks_source ON source_chunks(source_id);
    CREATE INDEX IF NOT EXISTS idx_source_chunks_collection ON source_chunks(collection_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);
  `);

  try {
    database.exec("ALTER TABLE chat_messages ADD COLUMN retrieval_json TEXT;");
  } catch {
    // Column already exists in upgraded databases.
  }

  try {
    database.exec("ALTER TABLE chat_messages ADD COLUMN trace_json TEXT;");
  } catch {
    // Column already exists in upgraded databases.
  }

  databasePathCache = databasePath;
  return database;
}

export function getKnowledgeDatabase(): Database {
  const databasePath = getKnowledgeDatabasePath();

  if (!databaseCache || databasePathCache !== databasePath) {
    databaseCache?.close();
    databaseCache = openDatabase();
  }

  return databaseCache;
}

export function resetKnowledgeDatabase(): void {
  databaseCache?.close();
  databaseCache = undefined;
  databasePathCache = "";
}
