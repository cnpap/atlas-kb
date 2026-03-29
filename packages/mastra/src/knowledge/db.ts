import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { getKnowledgeDatabasePath } from "./config";

const CURRENT_SCHEMA_VERSION = 2;

let databaseCache: Database | undefined;
let databasePathCache = "";

function recreateSchema(database: Database): void {
  database.exec(`
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS chat_feedback;
    DROP TABLE IF EXISTS chat_messages;
    DROP TABLE IF EXISTS chat_sessions;
    DROP TABLE IF EXISTS source_chunks_fts;
    DROP TABLE IF EXISTS source_chunks;
    DROP TABLE IF EXISTS import_jobs;
    DROP TABLE IF EXISTS source_versions;
    DROP TABLE IF EXISTS sources;
    DROP TABLE IF EXISTS collections;
    DROP TABLE IF EXISTS users;

    PRAGMA foreign_keys = ON;
  `);

  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE collections (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL
    );

    CREATE TABLE sources (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

    CREATE TABLE source_versions (
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

    CREATE TABLE import_jobs (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

    CREATE TABLE source_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chunk_id TEXT NOT NULL UNIQUE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

    CREATE VIRTUAL TABLE source_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      title,
      lexical_text,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TABLE chat_sessions (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
      preview TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL
    );

    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations_json TEXT NOT NULL,
      retrieval_json TEXT,
      trace_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE chat_feedback (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      rating TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_users_username ON users(username);
    CREATE INDEX idx_collections_owner ON collections(owner_user_id, updated_at DESC);
    CREATE INDEX idx_sources_owner ON sources(owner_user_id, updated_at DESC);
    CREATE INDEX idx_sources_collection ON sources(collection_id, updated_at DESC);
    CREATE INDEX idx_sources_status ON sources(owner_user_id, status);
    CREATE INDEX idx_source_versions_source ON source_versions(source_id, version_number DESC);
    CREATE INDEX idx_import_jobs_owner ON import_jobs(owner_user_id, started_at DESC);
    CREATE INDEX idx_source_chunks_owner ON source_chunks(owner_user_id, collection_id);
    CREATE INDEX idx_chat_sessions_owner ON chat_sessions(owner_user_id, last_message_at DESC);
    CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at ASC);
    CREATE INDEX idx_chat_messages_owner ON chat_messages(owner_user_id, session_id);
  `);

  database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};`);
}

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
  `);

  const row = database.query("PRAGMA user_version;").get() as {
    user_version?: number;
  } | null;
  const version = Number(row?.user_version ?? 0);

  if (version !== CURRENT_SCHEMA_VERSION) {
    recreateSchema(database);
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
