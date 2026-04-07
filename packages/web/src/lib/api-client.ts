import {
  isDataUIPart,
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessage,
} from "ai";
import { ChatReplyStreamDataEventSchema } from "@atlas-kb/schema";
import type {
  BriefingExport,
  BriefingExportCreateRequest,
  BriefingExportData,
  BriefingExportsData,
  BriefingOpinionData,
  ChatMessageFeedback,
  ChatMessageFeedbackRequest,
  ChatMessagesData,
  ChatReplyFinal,
  ChatReplyRequest,
  ChatReplyStreamBody,
  ChatReplyStreamDataEvent,
  ChatSessionCreateRequest,
  ChatSessionsData,
  ChatSessionUpdateRequest,
  DashboardSummary,
  HealthData,
  KnowledgeCollectionCreateRequest,
  KnowledgeCollectionData,
  KnowledgeCollectionUpdateRequest,
  KnowledgeCollectionsData,
  KnowledgeExportTask,
  KnowledgeExportTaskCreateRequest,
  KnowledgeExportTasksData,
  KnowledgeImportData,
  KnowledgeSourceData,
  KnowledgeSourceUpdateRequest,
  KnowledgeSourcesData,
  KnowledgeTemplateData,
  KnowledgeTemplatesData,
  KnowledgeTextImportRequest,
  LoginRequest,
  LoginResult,
  SearchKnowledgeRequest,
  SearchKnowledgeResult,
  Session,
} from "@atlas-kb/schema";
import {
  clearAuthToken,
  getAuthToken,
  notifyAuthExpired,
} from "./auth-storage";
import { getApiBaseUrl } from "./env";

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface FailureEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

type JsonPayload<T> = SuccessEnvelope<T> | FailureEnvelope;

type ReplyAcceptedEvent = Extract<
  ChatReplyStreamDataEvent,
  { type: "reply-accepted" }
>;
type TraceStreamEvent = Extract<ChatReplyStreamDataEvent, { type: "trace" }>;
type ReplyCompletedEvent = Extract<
  ChatReplyStreamDataEvent,
  { type: "reply-completed" }
>;
type ReplyErrorEvent = Extract<
  ChatReplyStreamDataEvent,
  { type: "reply-error" }
>;

type ChatReplyStreamUIMessage = UIMessage<
  never,
  {
    replyAccepted: ReplyAcceptedEvent;
    trace: TraceStreamEvent;
    replyCompleted: ReplyCompletedEvent;
    replyError: ReplyErrorEvent;
  }
>;

const INTERNAL_PROVIDER_ERROR_PATTERN =
  /OPENAI_BASE_URL|OPENAI_MODEL|OPENAI_API_KEY|API Key|中转服务|原始错误/i;
const TIMEOUT_ERROR_PATTERN = /timed out|timeout|ETIMEDOUT|AbortError/i;

function resolveApiUrl(path: string): string {
  return new URL(path, getApiBaseUrl()).toString();
}

function resolveRequestUrl(
  path: string,
  token: string,
  method?: string,
): string {
  const url = new URL(path, getApiBaseUrl());
  const normalizedMethod = method?.toUpperCase() || "GET";

  if (token && normalizedMethod === "GET") {
    url.searchParams.set("_", String(Date.now()));
  }

  return url.toString();
}

function sanitizeErrorMessage(message: string): string {
  const normalized = message.trim();

  if (!normalized) {
    return "请求失败";
  }

  if (
    INTERNAL_PROVIDER_ERROR_PATTERN.test(normalized) &&
    TIMEOUT_ERROR_PATTERN.test(normalized)
  ) {
    return "知识库回答超时，请稍后重试。";
  }

  if (INTERNAL_PROVIDER_ERROR_PATTERN.test(normalized)) {
    return "知识库回答暂时不可用，请稍后重试。";
  }

  return normalized;
}

async function readPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as JsonPayload<T>;

  if (!payload) {
    throw new Error("空响应载荷");
  }

  if (!payload.success) {
    throw new Error(sanitizeErrorMessage(payload.error.message));
  }

  return payload.data;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(resolveRequestUrl(path, token, init?.method), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) {
    clearAuthToken();
    notifyAuthExpired();
  }

  if (!response.ok) {
    try {
      return await readPayload<T>(response);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(`请求失败 (${response.status})`);
    }
  }

  return readPayload<T>(response);
}

async function requestFormData<T>(path: string, body: FormData): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(resolveRequestUrl(path, token, "POST"), {
    method: "POST",
    body,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 401) {
    clearAuthToken();
    notifyAuthExpired();
  }

  if (!response.ok) {
    return readPayload<T>(response);
  }

  return readPayload<T>(response);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message);
  }

  return "请求失败";
}

function getStreamMessageContent(message: ChatReplyStreamUIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getStreamDataEvents(
  message: ChatReplyStreamUIMessage,
): ChatReplyStreamDataEvent[] {
  return message.parts.flatMap((part) => {
    if (!isDataUIPart(part)) {
      return [];
    }

    const parsed = ChatReplyStreamDataEventSchema.safeParse(part.data);
    if (!parsed.success) {
      return [];
    }

    const event: ChatReplyStreamDataEvent =
      parsed.data.type === "reply-error"
        ? {
            ...parsed.data,
            message: sanitizeErrorMessage(parsed.data.message),
          }
        : parsed.data;

    return [event];
  });
}

function getAuthorizedHeaders(
  overrides?: HeadersInit,
  contentType?: string,
): HeadersInit {
  const token = getAuthToken();

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(overrides ?? {}),
  };
}

async function getStreamRequestError(response: Response): Promise<Error> {
  try {
    const payload = (await response.clone().json()) as FailureEnvelope;

    if (!payload.success) {
      return new Error(sanitizeErrorMessage(payload.error.message));
    }
  } catch {
    const text = (await response.text()).trim();

    if (text) {
      return new Error(sanitizeErrorMessage(text));
    }
  }

  return new Error(`请求失败 (${response.status})`);
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return requestJson<DashboardSummary>("/api/dashboard/summary");
}

export async function loginRequest(body: LoginRequest): Promise<LoginResult> {
  return requestJson<LoginResult>("/api/auth/login", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function fetchCurrentSessionRequest(): Promise<Session> {
  return requestJson<Session>("/api/auth/me");
}

export async function fetchHealthStatus(): Promise<HealthData> {
  return requestJson<HealthData>("/api/health");
}

export async function listKnowledgeCollections(): Promise<KnowledgeCollectionsData> {
  return requestJson<KnowledgeCollectionsData>("/api/kb/collections");
}

export async function createKnowledgeCollectionRequest(
  body: KnowledgeCollectionCreateRequest,
): Promise<KnowledgeCollectionData> {
  return requestJson<KnowledgeCollectionData>("/api/kb/collections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateKnowledgeCollectionRequest(params: {
  collectionId: string;
  body: KnowledgeCollectionUpdateRequest;
}): Promise<KnowledgeCollectionData> {
  return requestJson<KnowledgeCollectionData>(
    `/api/kb/collections/${encodeURIComponent(params.collectionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(params.body),
    },
  );
}

export async function deleteKnowledgeCollectionRequest(
  collectionId: string,
): Promise<void> {
  await requestJson<{ ok: true }>(
    `/api/kb/collections/${encodeURIComponent(collectionId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchKnowledgeCollectionSources(
  collectionId: string,
): Promise<KnowledgeSourcesData> {
  return requestJson<KnowledgeSourcesData>(
    `/api/kb/collections/${encodeURIComponent(collectionId)}/sources`,
  );
}

export async function fetchKnowledgeSource(
  sourceId: string,
): Promise<KnowledgeSourceData> {
  return requestJson<KnowledgeSourceData>(
    `/api/kb/sources/${encodeURIComponent(sourceId)}`,
  );
}

export async function updateKnowledgeSourceRequest(params: {
  sourceId: string;
  body: KnowledgeSourceUpdateRequest;
}): Promise<KnowledgeSourceData> {
  return requestJson<KnowledgeSourceData>(
    `/api/kb/sources/${encodeURIComponent(params.sourceId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(params.body),
    },
  );
}

export async function deleteKnowledgeSourceRequest(
  sourceId: string,
): Promise<void> {
  await requestJson<{ ok: true }>(
    `/api/kb/sources/${encodeURIComponent(sourceId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function importKnowledgeTextRequest(params: {
  collectionId: string;
  body: KnowledgeTextImportRequest;
}): Promise<KnowledgeImportData> {
  return requestJson<KnowledgeImportData>(
    `/api/kb/collections/${encodeURIComponent(params.collectionId)}/imports/text`,
    {
      method: "POST",
      body: JSON.stringify(params.body),
    },
  );
}

export async function searchKnowledgeRequest(
  body: SearchKnowledgeRequest,
): Promise<SearchKnowledgeResult> {
  return requestJson<SearchKnowledgeResult>("/api/kb/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listChatSessionsRequest(
  collectionId: string,
): Promise<ChatSessionsData> {
  return requestJson<ChatSessionsData>(
    `/api/chat/sessions?collectionId=${encodeURIComponent(collectionId)}`,
  );
}

export async function createChatSessionRequest(
  body: ChatSessionCreateRequest,
): Promise<{ session: ChatSessionsData["sessions"][number] }> {
  return requestJson<{ session: ChatSessionsData["sessions"][number] }>(
    "/api/chat/sessions",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function updateChatSessionRequest(params: {
  sessionId: string;
  body: ChatSessionUpdateRequest;
}): Promise<{ session: ChatSessionsData["sessions"][number] }> {
  return requestJson<{ session: ChatSessionsData["sessions"][number] }>(
    `/api/chat/sessions/${encodeURIComponent(params.sessionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(params.body),
    },
  );
}

export async function deleteChatSessionRequest(
  sessionId: string,
): Promise<void> {
  await requestJson<{ ok: true }>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchChatMessagesRequest(
  sessionId: string,
): Promise<ChatMessagesData> {
  return requestJson<ChatMessagesData>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
  );
}

export async function replyChatSessionRequest(params: {
  sessionId: string;
  body: ChatReplyRequest;
}): Promise<ChatReplyFinal> {
  return requestJson<ChatReplyFinal>(
    `/api/chat/sessions/${encodeURIComponent(params.sessionId)}/reply`,
    {
      method: "POST",
      body: JSON.stringify(params.body),
    },
  );
}

export async function streamChatReplyRequest(params: {
  sessionId: string;
  body: ChatReplyStreamBody;
  onUpdate: (options: {
    content: string;
    events: ChatReplyStreamDataEvent[];
  }) => void;
}): Promise<void> {
  const response = await fetch(
    resolveApiUrl(
      `/api/chat/sessions/${encodeURIComponent(params.sessionId)}/reply/stream`,
    ),
    {
      method: "POST",
      headers: getAuthorizedHeaders(
        {
          Accept: "text/event-stream",
        },
        "application/json",
      ),
      body: JSON.stringify(params.body),
    },
  );

  if (response.status === 401) {
    clearAuthToken();
    notifyAuthExpired();
  }

  if (!response.ok) {
    throw await getStreamRequestError(response);
  }

  if (!response.body) {
    throw new Error("AI 对话流未返回可读取的数据");
  }

  const parsedStream = parseJsonEventStream({
    stream: response.body,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (!chunk.success) {
          throw chunk.error;
        }

        controller.enqueue(chunk.value);
      },
    }),
  );

  for await (const message of readUIMessageStream<ChatReplyStreamUIMessage>({
    stream: parsedStream,
    terminateOnError: true,
  })) {
    params.onUpdate({
      content: getStreamMessageContent(message),
      events: getStreamDataEvents(message),
    });
  }
}

export async function sendChatFeedbackRequest(params: {
  messageId: string;
  body: ChatMessageFeedbackRequest;
}): Promise<ChatMessageFeedback> {
  return requestJson<ChatMessageFeedback>(
    `/api/chat/messages/${encodeURIComponent(params.messageId)}/feedback`,
    {
      method: "POST",
      body: JSON.stringify(params.body),
    },
  );
}

export async function fetchBriefingOpinionRequest(
  sourceId: string,
): Promise<BriefingOpinionData> {
  return requestJson<BriefingOpinionData>(
    `/api/kb/sources/${encodeURIComponent(sourceId)}/briefing`,
  );
}

export async function fetchBriefingExportHistoryRequest(
  sourceId: string,
): Promise<BriefingExportsData> {
  return requestJson<BriefingExportsData>(
    `/api/kb/sources/${encodeURIComponent(sourceId)}/exports`,
  );
}

export async function createBriefingExportRequest(params: {
  sourceId: string;
  body: BriefingExportCreateRequest;
}): Promise<BriefingExportData> {
  return requestJson<BriefingExportData>(
    `/api/kb/sources/${encodeURIComponent(params.sourceId)}/exports`,
    {
      method: "POST",
      body: JSON.stringify(params.body),
    },
  );
}

export function downloadBriefingExportFile(exportRecord: BriefingExport): void {
  const payload = {
    id: exportRecord.id,
    sourceId: exportRecord.sourceId,
    documentId: exportRecord.documentId,
    title: exportRecord.title,
    summary: exportRecord.summary,
    form: exportRecord.form,
    citations: exportRecord.citations,
    createdAt: exportRecord.createdAt,
  };
  const safeStem = exportRecord.title
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const timestamp = exportRecord.createdAt
    .replace(/[:]/g, "-")
    .replace(/\.\d+Z$/, "Z");
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = `${safeStem || "briefing-export"}-${timestamp}.json`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function uploadKnowledgeFileRequest(params: {
  collectionId: string;
  file: File;
  title?: string;
  summary?: string;
  tags?: string[];
}): Promise<KnowledgeImportData> {
  const formData = new FormData();
  formData.set("file", params.file);

  if (params.title?.trim()) {
    formData.set("title", params.title.trim());
  }

  if (params.summary?.trim()) {
    formData.set("summary", params.summary.trim());
  }

  if (params.tags?.length) {
    formData.set("tags", params.tags.join(", "));
  }

  return requestFormData<KnowledgeImportData>(
    `/api/kb/collections/${encodeURIComponent(params.collectionId)}/uploads`,
    formData,
  );
}

export async function downloadKnowledgeSourceRequest(params: {
  sourceId: string;
  filename?: string;
}): Promise<void> {
  const downloadInfo = await requestJson<{
    url: string;
    filename: string;
    mimeType: string;
  }>(`/api/kb/sources/${encodeURIComponent(params.sourceId)}/download`);

  const link = document.createElement("a");
  link.href = downloadInfo.url;
  link.download = params.filename || downloadInfo.filename;
  link.style.display = "none";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function listKnowledgeTemplatesRequest(): Promise<KnowledgeTemplatesData> {
  return requestJson<KnowledgeTemplatesData>("/api/kb/templates");
}

export async function fetchKnowledgeTemplateRequest(
  templateId: string,
): Promise<KnowledgeTemplateData> {
  return requestJson<KnowledgeTemplateData>(
    `/api/kb/templates/${encodeURIComponent(templateId)}`,
  );
}

export async function listKnowledgeExportTasksRequest(params?: {
  sourceId?: string;
}): Promise<KnowledgeExportTasksData> {
  const search = new URLSearchParams();

  if (params?.sourceId) {
    search.set("sourceId", params.sourceId);
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return requestJson<KnowledgeExportTasksData>(`/api/kb/export-tasks${suffix}`);
}

export async function createKnowledgeExportTaskRequest(params: {
  sourceId: string;
  body: KnowledgeExportTaskCreateRequest;
}): Promise<{ task: KnowledgeExportTask }> {
  return requestJson<{ task: KnowledgeExportTask }>(
    `/api/kb/sources/${encodeURIComponent(params.sourceId)}/export-tasks`,
    {
      method: "POST",
      body: JSON.stringify(params.body),
    },
  );
}
