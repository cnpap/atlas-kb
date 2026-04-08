import { Kysely, sql } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "./config";
import type { DB } from "./db.generated";
import { KNOWLEDGE_TABLES } from "./tables";

let dbCache: Kysely<DB> | undefined;
let dbUrlCache = "";

function createDatabaseClient(): Kysely<DB> {
  const client = postgres(getDatabaseUrl(), {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 30,
    onnotice() {},
    prepare: false,
  });

  return new Kysely<DB>({
    dialect: new PostgresJSDialect({
      postgres: client,
    }),
  });
}

function getKnowledgeDatabase(): Kysely<DB> {
  const nextUrl = getDatabaseUrl();

  if (!dbCache || dbUrlCache !== nextUrl) {
    void dbCache?.destroy();
    dbCache = createDatabaseClient();
    dbUrlCache = nextUrl;
  }

  return dbCache;
}

export async function ensureKnowledgeDatabase(): Promise<Kysely<DB>> {
  return getKnowledgeDatabase();
}

export async function resetKnowledgeDatabase(): Promise<void> {
  const db = await ensureKnowledgeDatabase();

  await db.transaction().execute(async (trx) => {
    await sql`
      TRUNCATE TABLE
        ${sql.table(KNOWLEDGE_TABLES.chatFeedback)},
        ${sql.table(KNOWLEDGE_TABLES.chatMessages)},
        ${sql.table(KNOWLEDGE_TABLES.chatSessions)},
        ${sql.table(KNOWLEDGE_TABLES.importJobs)},
        ${sql.table(KNOWLEDGE_TABLES.sources)},
        ${sql.table(KNOWLEDGE_TABLES.collections)}
      CASCADE
    `.execute(trx);
  });
}
