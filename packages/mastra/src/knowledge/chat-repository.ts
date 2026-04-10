import { NotFoundError } from "@atlas-kb/errors";
import type {
  ChatMessage,
  ChatMessageFeedback,
  ChatMessageFeedbackRequest,
  ChatSession,
} from "@atlas-kb/schema";
import { sql, type Kysely, type Transaction } from "kysely";
import { ensureKnowledgeDatabase } from "./db";
import type { DB } from "./db.generated";
import {
  CHAT_SESSION_COLUMNS,
  nowIso,
  toChatMessage,
  toChatSession,
  toDbUserId,
  type ChatMessageRow,
  type ChatSessionRow,
} from "./repository-shared";
import { requireKnowledgeCollection } from "./collections-repository";

export const DEFAULT_CHAT_SESSION_TITLE = "新建会话";
export const DEFAULT_EMPTY_CHAT_SESSION_PREVIEW = "开始提问吧";

type ChatSessionExecutor = Kysely<DB> | Transaction<DB>;

async function getChatSessionRow(
  userId: string,
  sessionId: string,
): Promise<ChatSessionRow | null> {
  const db = await ensureKnowledgeDatabase();

  return (
    (await db
      .selectFrom("kb_chat_sessions")
      .select(CHAT_SESSION_COLUMNS)
      .where("owner_user_id", "=", toDbUserId(userId))
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
        "m.assistant_role_id as assistant_role_id",
        "m.role as role",
        "m.content as content",
        "m.citations_json as citations_json",
        "m.created_at as created_at",
        "f.id as feedback_id",
        "f.rating as feedback_rating",
        "f.note as feedback_note",
        "f.created_at as feedback_created_at",
      ])
      .where("m.owner_user_id", "=", toDbUserId(userId))
      .where("m.id", "=", messageId)
      .executeTakeFirst()) ?? null
  );
}

function getPlaceholderChatSessionLockKey(params: {
  collectionId: string;
  userId: string;
}): string {
  return `atlas_kb_chat_placeholder:${params.userId}:${params.collectionId}`;
}

async function acquirePlaceholderChatSessionLock(
  executor: ChatSessionExecutor,
  params: {
    collectionId: string;
    userId: string;
  },
): Promise<void> {
  await sql`
    select pg_advisory_xact_lock(
      hashtext('atlas_kb_chat_placeholder'),
      hashtext(${getPlaceholderChatSessionLockKey(params)})
    )
  `.execute(executor);
}

async function getReusablePlaceholderChatSessionRow(
  executor: ChatSessionExecutor,
  params: {
    collectionId: string;
    userId: string;
  },
): Promise<ChatSessionRow | null> {
  return (
    (await executor
      .selectFrom("kb_chat_sessions")
      .select(CHAT_SESSION_COLUMNS)
      .where("owner_user_id", "=", toDbUserId(params.userId))
      .where("collection_id", "=", params.collectionId)
      .where("title", "=", DEFAULT_CHAT_SESSION_TITLE)
      .where("preview", "=", DEFAULT_EMPTY_CHAT_SESSION_PREVIEW)
      .orderBy("created_at", "desc")
      .executeTakeFirst()) ?? null
  );
}

async function insertChatSession(
  executor: ChatSessionExecutor,
  params: {
    collectionId: string;
    preview: string;
    title: string;
    userId: string;
  },
): Promise<ChatSession> {
  const now = nowIso();
  const id = crypto.randomUUID();

  await executor
    .insertInto("kb_chat_sessions")
    .values({
      id,
      owner_user_id: toDbUserId(params.userId),
      title: params.title,
      collection_id: params.collectionId,
      preview: params.preview,
      created_at: now,
      updated_at: now,
      last_message_at: now,
    })
    .execute();

  const row = await executor
    .selectFrom("kb_chat_sessions")
    .select(CHAT_SESSION_COLUMNS)
    .where("owner_user_id", "=", toDbUserId(params.userId))
    .where("id", "=", id)
    .executeTakeFirst();

  return toChatSession(row!);
}

export function isPlaceholderChatSession(
  session: Pick<ChatSession, "preview" | "title">,
): boolean {
  return (
    session.title.trim() === DEFAULT_CHAT_SESSION_TITLE &&
    session.preview.trim() === DEFAULT_EMPTY_CHAT_SESSION_PREVIEW
  );
}

export async function createChatSession(params: {
  userId: string;
  title?: string;
  collectionId: string;
}): Promise<ChatSession> {
  const db = await ensureKnowledgeDatabase();
  const normalizedTitle = params.title?.trim();

  await requireKnowledgeCollection(params.userId, params.collectionId);

  if (normalizedTitle) {
    return insertChatSession(db, {
      userId: params.userId,
      collectionId: params.collectionId,
      title: normalizedTitle,
      preview: DEFAULT_EMPTY_CHAT_SESSION_PREVIEW,
    });
  }

  return db.transaction().execute(async (trx) => {
    await acquirePlaceholderChatSessionLock(trx, {
      userId: params.userId,
      collectionId: params.collectionId,
    });

    const existingPlaceholder = await getReusablePlaceholderChatSessionRow(
      trx,
      {
        userId: params.userId,
        collectionId: params.collectionId,
      },
    );

    if (existingPlaceholder) {
      return toChatSession(existingPlaceholder);
    }

    return insertChatSession(trx, {
      userId: params.userId,
      collectionId: params.collectionId,
      title: DEFAULT_CHAT_SESSION_TITLE,
      preview: DEFAULT_EMPTY_CHAT_SESSION_PREVIEW,
    });
  });
}

export async function listChatSessions(
  userId: string,
  collectionId?: string,
): Promise<ChatSession[]> {
  const db = await ensureKnowledgeDatabase();
  let query = db
    .selectFrom("kb_chat_sessions")
    .select(CHAT_SESSION_COLUMNS)
    .where("owner_user_id", "=", toDbUserId(userId));

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

export async function getChatMessageById(
  userId: string,
  messageId: string,
): Promise<ChatMessage | undefined> {
  const row = await getChatMessageRow(userId, messageId);
  return row ? toChatMessage(row) : undefined;
}

export async function requireChatMessage(
  userId: string,
  messageId: string,
): Promise<ChatMessage> {
  const message = await getChatMessageById(userId, messageId);

  if (!message) {
    throw new NotFoundError(`Chat message "${messageId}" not found`);
  }

  return message;
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
    .where("owner_user_id", "=", toDbUserId(params.userId))
    .where("id", "=", params.sessionId)
    .execute();

  return requireChatSession(params.userId, params.sessionId);
}

export async function renamePlaceholderChatSession(params: {
  userId: string;
  sessionId: string;
  title: string;
}): Promise<ChatSession> {
  const nextTitle = params.title.trim();

  if (!nextTitle) {
    return requireChatSession(params.userId, params.sessionId);
  }

  const db = await ensureKnowledgeDatabase();

  await db
    .updateTable("kb_chat_sessions")
    .set({
      title: nextTitle,
      updated_at: nowIso(),
    })
    .where("owner_user_id", "=", toDbUserId(params.userId))
    .where("id", "=", params.sessionId)
    .where("title", "=", DEFAULT_CHAT_SESSION_TITLE)
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
    .where("owner_user_id", "=", toDbUserId(userId))
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
      "m.assistant_role_id as assistant_role_id",
      "m.role as role",
      "m.content as content",
      "m.citations_json as citations_json",
      "m.created_at as created_at",
      "f.id as feedback_id",
      "f.rating as feedback_rating",
      "f.note as feedback_note",
      "f.created_at as feedback_created_at",
    ])
    .where("m.owner_user_id", "=", toDbUserId(userId))
    .where("m.session_id", "=", sessionId)
    .orderBy("m.created_at", "asc")
    .orderBy(
      sql<number>`case when ${sql.ref("m.role")} = 'user' then 0 else 1 end`,
      "asc",
    )
    .execute();

  return rows.map((row) => toChatMessage(row));
}

export async function appendChatMessage(params: {
  userId: string;
  sessionId: string;
  assistantRoleId: string;
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
      owner_user_id: toDbUserId(params.userId),
      session_id: params.sessionId,
      assistant_role_id: params.assistantRoleId,
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
    .where("owner_user_id", "=", toDbUserId(params.userId))
    .where("id", "=", params.sessionId)
    .execute();

  const message = await getChatMessageRow(params.userId, id);
  return toChatMessage(message!);
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
    .where("owner_user_id", "=", toDbUserId(params.userId))
    .where("message_id", "=", params.messageId)
    .execute();

  await db
    .insertInto("kb_chat_feedback")
    .values({
      id,
      owner_user_id: toDbUserId(params.userId),
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
