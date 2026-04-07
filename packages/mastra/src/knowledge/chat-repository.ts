import { NotFoundError } from "@atlas-kb/errors";
import type {
  ChatMessage,
  ChatMessageFeedback,
  ChatMessageFeedbackRequest,
  ChatMessagesData,
  ChatSession,
} from "@atlas-kb/schema";
import { ensureKnowledgeDatabase } from "./db";
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

export async function getChatSessionRow(
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

export async function getChatMessageRow(
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

export async function createChatSession(params: {
  userId: string;
  title?: string;
  collectionId: string;
}): Promise<ChatSession> {
  const db = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id = crypto.randomUUID();
  const collection = await requireKnowledgeCollection(
    params.userId,
    params.collectionId,
  );
  const title = params.title?.trim() || `${collection.name} 对话`;
  const preview = "开始提问吧";

  await db
    .insertInto("kb_chat_sessions")
    .values({
      id,
      owner_user_id: toDbUserId(params.userId),
      title,
      collection_id: params.collectionId,
      preview,
      created_at: now,
      updated_at: now,
      last_message_at: now,
    })
    .execute();

  return requireChatSession(params.userId, id);
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
    .execute();

  return rows.map((row) => toChatMessage(row));
}

export async function appendChatMessage(params: {
  userId: string;
  sessionId: string;
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
