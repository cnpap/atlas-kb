import type {
  BriefingExport,
  ChatMessage,
  ChatMessageFeedback,
  ChatSession,
  DashboardSummary,
  KnowledgeCollection,
  KnowledgeSource,
} from "@atlas-kb/schema";
import type {
  KbBriefingExports,
  KbChatMessages,
  KbChatSessions,
  KbCollections,
  KbSources,
} from "./db.generated";

export type CollectionRow = Pick<
  KbCollections,
  | "color"
  | "created_at"
  | "description"
  | "icon"
  | "id"
  | "is_pinned"
  | "last_activity_at"
  | "name"
  | "owner_user_id"
  | "updated_at"
> & {
  document_count: number;
  failed_document_count: number;
  processing_document_count: number;
  ready_document_count: number;
};

export type SourceRow = Pick<
  KbSources,
  | "byte_size"
  | "collection_id"
  | "content"
  | "content_preview"
  | "created_at"
  | "document_id"
  | "excerpt"
  | "failure_message"
  | "id"
  | "index_path"
  | "last_processed_at"
  | "latest_version"
  | "mime_type"
  | "original_path"
  | "owner_user_id"
  | "ready_at"
  | "snapshot_updated_at"
  | "source_filename"
  | "source_type"
  | "source_url"
  | "status"
  | "summary"
  | "tags_json"
  | "title"
  | "updated_at"
>;

export type StoredKnowledgeSourceRecord = {
  id: string;
  userId: string;
  collectionId: string;
  documentId: string;
  title: string;
  summary: string;
  excerpt: string;
  contentPreview: string;
  content: string;
  tags: string[];
  sourceType: KnowledgeSource["sourceType"];
  status: KnowledgeSource["status"];
  sourceFilename?: string;
  mimeType?: string;
  byteSize?: number;
  latestVersion: number;
  readyAt?: string;
  lastProcessedAt?: string;
  failureMessage?: string;
  originalPath?: string | null;
  indexPath: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatSessionRow = Pick<
  KbChatSessions,
  | "collection_id"
  | "created_at"
  | "id"
  | "last_message_at"
  | "owner_user_id"
  | "preview"
  | "title"
  | "updated_at"
>;

export type ChatMessageRow = Pick<
  KbChatMessages,
  | "citations_json"
  | "content"
  | "created_at"
  | "id"
  | "owner_user_id"
  | "role"
  | "session_id"
> & {
  feedback_created_at: Date | string | null;
  feedback_id: string | null;
  feedback_note: string | null;
  feedback_rating: ChatMessageFeedback["rating"] | null;
};

export type BriefingExportRow = Pick<
  KbBriefingExports,
  | "citations_json"
  | "created_at"
  | "document_id"
  | "form_json"
  | "id"
  | "owner_user_id"
  | "source_id"
  | "summary"
  | "title"
>;

export const SOURCE_COLUMNS = [
  "id",
  "owner_user_id",
  "collection_id",
  "document_id",
  "title",
  "summary",
  "excerpt",
  "content_preview",
  "content",
  "tags_json",
  "source_type",
  "status",
  "source_filename",
  "source_url",
  "mime_type",
  "byte_size",
  "latest_version",
  "ready_at",
  "last_processed_at",
  "snapshot_updated_at",
  "failure_message",
  "original_path",
  "index_path",
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

export function nowIso(): string {
  return new Date().toISOString();
}

export function toDbUserId(userId: string): string {
  return userId.trim();
}

export function toIsoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function toOptionalIsoTimestamp(
  value: string | Date | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  return toIsoTimestamp(value);
}

export function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function parseOptionalJson<T>(raw: unknown): T | undefined {
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
    summary: row.summary,
    excerpt: row.excerpt,
    contentPreview: row.content_preview,
    content: row.content,
    tags: parseJsonArray(row.tags_json),
    sourceType: row.source_type as KnowledgeSource["sourceType"],
    status: row.status as KnowledgeSource["status"],
    sourceFilename: row.source_filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    byteSize:
      row.byte_size === null || row.byte_size === undefined
        ? undefined
        : Number(row.byte_size),
    latestVersion: row.latest_version,
    readyAt: toOptionalIsoTimestamp(row.ready_at),
    lastProcessedAt: toOptionalIsoTimestamp(row.last_processed_at),
    failureMessage: row.failure_message ?? undefined,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export function toStoredSourceRecord(
  row: SourceRow,
): StoredKnowledgeSourceRecord {
  return {
    id: row.id,
    userId: String(row.owner_user_id),
    collectionId: row.collection_id,
    documentId: row.document_id,
    title: row.title,
    summary: row.summary,
    excerpt: row.excerpt,
    contentPreview: row.content_preview,
    content: row.content,
    tags: parseJsonArray(row.tags_json),
    sourceType: row.source_type as KnowledgeSource["sourceType"],
    status: row.status as KnowledgeSource["status"],
    sourceFilename: row.source_filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    byteSize:
      row.byte_size === null || row.byte_size === undefined
        ? undefined
        : Number(row.byte_size),
    latestVersion: row.latest_version,
    readyAt: toOptionalIsoTimestamp(row.ready_at),
    lastProcessedAt: toOptionalIsoTimestamp(row.last_processed_at),
    failureMessage: row.failure_message ?? undefined,
    originalPath: row.original_path,
    indexPath: row.index_path,
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
          rating: row.feedback_rating,
          note: row.feedback_note ?? undefined,
          createdAt: toIsoTimestamp(row.feedback_created_at),
        }
      : undefined;

  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as ChatMessage["role"],
    content: row.content,
    citations:
      parseOptionalJson<ChatMessage["citations"]>(row.citations_json) ?? [],
    createdAt: toIsoTimestamp(row.created_at),
    feedback,
  };
}

export function toBriefingExport(row: BriefingExportRow): BriefingExport {
  return {
    id: row.id,
    sourceId: row.source_id,
    documentId: row.document_id,
    title: row.title,
    summary: row.summary,
    form: parseOptionalJson<BriefingExport["form"]>(row.form_json) ?? {
      sourceOrg: "",
      documentCode: "",
      documentTitle: "",
      receivedAt: "",
      briefingOpinion: "",
      pendingQuestions: "",
    },
    citations:
      parseOptionalJson<BriefingExport["citations"]>(row.citations_json) ?? [],
    createdAt: toIsoTimestamp(row.created_at),
  };
}

export type DashboardCounts = Pick<
  DashboardSummary,
  | "chatSessionsCount"
  | "collectionsCount"
  | "failedSourcesCount"
  | "processingSourcesCount"
  | "readySourcesCount"
>;
