import postgres, { type Sql } from "postgres";
import { getDatabaseUrl } from "./config";
import { KNOWLEDGE_TABLES } from "./tables";

let sqlCache: Sql | undefined;
let sqlUrlCache = "";

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
  }

  return sqlCache;
}

export async function ensureKnowledgeDatabase(): Promise<Sql> {
  return getKnowledgeDatabase();
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
      ].join(", ")} CASCADE`,
    );
  });
}
