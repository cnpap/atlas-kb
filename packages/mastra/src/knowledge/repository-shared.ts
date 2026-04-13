import type {
  AssistantRole,
  ChatMessage,
  ChatMessageFeedback,
  ChatSession,
  KnowledgeCollection,
  KnowledgeSource,
} from "@atlas-kb/schema";
export type CollectionRow = {
  color: string;
  created_at: Date | string;
  description: string;
  icon: string;
  id: string;
  is_pinned: boolean;
  last_activity_at: Date | string;
  name: string;
  owner_user_id: string;
  updated_at: Date | string;
  document_count: number;
  failed_document_count: number;
  processing_document_count: number;
  ready_document_count: number;
};

export type SourceRow = {
  byte_size: number | string | null;
  collection_id: string;
  content: string | null;
  created_at: Date | string;
  document_id: string;
  failure_message: string | null;
  id: string;
  index_chunk_count: number | string | null;
  mime_type: string | null;
  owner_user_id: string;
  source_filename: string | null;
  source_type: string;
  status: string;
  title: string;
  updated_at: Date | string;
};

export type ChatSessionRow = {
  collection_id: string;
  created_at: Date | string;
  id: string;
  last_message_at: Date | string;
  owner_user_id: string;
  preview: string;
  title: string;
  updated_at: Date | string;
};

export type ChatMessageRow = {
  assistant_role_id: string;
  citations_json: unknown;
  content: string;
  created_at: Date | string;
  id: string;
  owner_user_id: string;
  role: string;
  session_id: string;
  feedback_created_at: Date | string | null;
  feedback_id: string | null;
  feedback_note: string | null;
  feedback_rating: string | null;
};

export type AssistantRoleRow = {
  created_at: Date | string;
  deleted_at: Date | string | null;
  id: string;
  is_builtin: boolean;
  is_default: boolean;
  name: string;
  owner_user_id: string | null;
  sort_order: number;
  style_prompt: string;
  system_prompt: string;
  updated_at: Date | string;
};

export const SOURCE_COLUMNS = [
  "id",
  "owner_user_id",
  "collection_id",
  "document_id",
  "title",
  "content",
  "index_chunk_count",
  "source_type",
  "status",
  "source_filename",
  "mime_type",
  "byte_size",
  "failure_message",
  "created_at",
  "updated_at",
] as const;

export const CHAT_SESSION_COLUMNS = [
  "id",
  "owner_user_id",
  "title",
  "collection_id",
  "preview",
  "created_at",
  "updated_at",
  "last_message_at",
] as const;

export const ASSISTANT_ROLE_COLUMNS = [
  "id",
  "owner_user_id",
  "name",
  "system_prompt",
  "style_prompt",
  "is_builtin",
  "is_default",
  "sort_order",
  "created_at",
  "updated_at",
  "deleted_at",
] as const;

export function nowIso(): string {
  return new Date().toISOString();
}

export function toDbUserId(userId: string): string {
  return userId.trim();
}

function toIsoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function parseOptionalJson<T>(raw: unknown): T | undefined {
  if (!raw) {
    return undefined;
  }

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  return raw as T;
}

export function toCollection(row: CollectionRow): KnowledgeCollection {
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
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    lastActivityAt: toIsoTimestamp(row.last_activity_at),
  };
}

export function toSource(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    documentId: row.document_id,
    collectionId: row.collection_id,
    title: row.title,
    content: row.content ?? undefined,
    sourceType: row.source_type as KnowledgeSource["sourceType"],
    status: row.status as KnowledgeSource["status"],
    sourceFilename: row.source_filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    byteSize:
      row.byte_size === null || row.byte_size === undefined
        ? undefined
        : Number(row.byte_size),
    failureMessage: row.failure_message ?? undefined,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export function toChatSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    collectionId: row.collection_id,
    preview: row.preview,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    lastMessageAt: toIsoTimestamp(row.last_message_at),
  };
}

export function toChatMessage(row: ChatMessageRow): ChatMessage {
  const feedback =
    row.feedback_id && row.feedback_rating && row.feedback_created_at
      ? {
          id: row.feedback_id,
          messageId: row.id,
          rating: row.feedback_rating as ChatMessageFeedback["rating"],
          note: row.feedback_note ?? undefined,
          createdAt: toIsoTimestamp(row.feedback_created_at),
        }
      : undefined;

  return {
    id: row.id,
    sessionId: row.session_id,
    assistantRoleId: row.assistant_role_id,
    role: row.role as ChatMessage["role"],
    content: row.content,
    citations:
      parseOptionalJson<ChatMessage["citations"]>(row.citations_json) ?? [],
    createdAt: toIsoTimestamp(row.created_at),
    feedback,
  };
}

export function toAssistantRole(row: AssistantRoleRow): AssistantRole {
  return {
    id: row.id,
    name: row.name,
    stylePrompt: row.style_prompt,
    isBuiltin: Boolean(row.is_builtin),
    isDefault: Boolean(row.is_default),
  };
}

export type AssistantRolePromptConfig = {
  id: string;
  isBuiltin: boolean;
  isDefault: boolean;
  name: string;
  stylePrompt: string;
  systemPrompt: string;
};

export function toAssistantRolePromptConfig(
  row: AssistantRoleRow,
): AssistantRolePromptConfig {
  return {
    id: row.id,
    name: row.name,
    systemPrompt: row.system_prompt,
    stylePrompt: row.style_prompt,
    isBuiltin: Boolean(row.is_builtin),
    isDefault: Boolean(row.is_default),
  };
}
