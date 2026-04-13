import type {
  AssistantRole,
  AssistantRoleCreateRequest,
  AssistantRoleOrderRequest,
  AssistantRoleUpdateRequest,
  ChatMessage,
  ChatMessageFeedback,
  ChatMessageFeedbackRequest,
  ChatReplyStreamBody,
  ChatReplyStreamDataEvent,
  ChatSession,
  ChatSessionCreateRequest,
  ChatSessionUpdateRequest,
  KnowledgeCollection,
  KnowledgeCollectionCreateRequest,
  KnowledgeCollectionUpdateRequest,
  KnowledgeExportTask,
  KnowledgeExportTaskCreateRequest,
  KnowledgeExportTaskDetail,
  KnowledgeExportTaskUpdateRequest,
  KnowledgeImportData,
  KnowledgeSource,
  KnowledgeSourceUpdateRequest,
  KnowledgeTemplateSummary,
  KnowledgeTextImportRequest,
  LoginRequest,
  LoginResult,
  Session,
} from "@atlas-kb/schema";
import { ChatReplyStreamDataEventSchema } from "@atlas-kb/schema";
import {
  isDataUIPart,
  parseJsonEventStream,
  readUIMessageStream,
  type UIMessage,
  uiMessageChunkSchema,
} from "ai";
import {
  clearAuthToken,
  getAuthToken,
  notifyAuthExpired,
} from "./auth-storage";
import {
  type ChatReplyProgressState,
  reduceChatReplyProgressEvents,
} from "./chat-stream-progress";
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

type ChatReplyStreamUIMessage = UIMessage<
  never,
  {
    event: ChatReplyStreamDataEvent;
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

export async function switchActiveWorkspaceRequest(params: {
  collectionId: string;
}): Promise<LoginResult> {
  return requestJson<LoginResult>("/api/auth/active-workspace", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function listKnowledgeCollections(): Promise<{
  collections: KnowledgeCollection[];
}> {
  return requestJson<{ collections: KnowledgeCollection[] }>(
    "/api/kb/collections",
  );
}

export async function listAssistantRolesRequest(): Promise<{
  roles: AssistantRole[];
  activeRoleId: string;
}> {
  return requestJson<{
    roles: AssistantRole[];
    activeRoleId: string;
  }>("/api/kb/assistant-roles");
}

export async function createAssistantRoleRequest(
  body: AssistantRoleCreateRequest,
): Promise<{ role: AssistantRole }> {
  return requestJson<{ role: AssistantRole }>("/api/kb/assistant-roles", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateAssistantRoleRequest(params: {
  roleId: string;
  body: AssistantRoleUpdateRequest;
}): Promise<{ role: AssistantRole }> {
  return requestJson<{ role: AssistantRole }>(
    `/api/kb/assistant-roles/${encodeURIComponent(params.roleId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(params.body),
    },
  );
}

export async function deleteAssistantRoleRequest(
  roleId: string,
): Promise<void> {
  await requestJson<{ ok: true }>(
    `/api/kb/assistant-roles/${encodeURIComponent(roleId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function selectActiveAssistantRoleRequest(
  roleId: string,
): Promise<{ activeRoleId: string }> {
  return requestJson<{ activeRoleId: string }>(
    "/api/kb/assistant-roles/active",
    {
      method: "PATCH",
      body: JSON.stringify({
        roleId,
      }),
    },
  );
}

export async function reorderAssistantRolesRequest(
  body: AssistantRoleOrderRequest,
): Promise<void> {
  await requestJson<{ ok: true }>("/api/kb/assistant-roles/order", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function createKnowledgeCollectionRequest(
  body: KnowledgeCollectionCreateRequest,
): Promise<{ collection: KnowledgeCollection }> {
  return requestJson<{ collection: KnowledgeCollection }>(
    "/api/kb/collections",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function updateKnowledgeCollectionRequest(params: {
  collectionId: string;
  body: KnowledgeCollectionUpdateRequest;
}): Promise<{ collection: KnowledgeCollection }> {
  return requestJson<{ collection: KnowledgeCollection }>(
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
): Promise<{ collection: KnowledgeCollection; sources: KnowledgeSource[] }> {
  return requestJson<{
    collection: KnowledgeCollection;
    sources: KnowledgeSource[];
  }>(`/api/kb/collections/${encodeURIComponent(collectionId)}/sources`);
}

export async function updateKnowledgeSourceRequest(params: {
  sourceId: string;
  body: KnowledgeSourceUpdateRequest;
}): Promise<{ source: KnowledgeSource }> {
  return requestJson<{ source: KnowledgeSource }>(
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

export async function retryKnowledgeSourceImportRequest(
  sourceId: string,
): Promise<{ source: KnowledgeSource }> {
  return requestJson<{ source: KnowledgeSource }>(
    `/api/kb/sources/${encodeURIComponent(sourceId)}/retry`,
    {
      method: "POST",
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

export async function listChatSessionsRequest(
  collectionId: string,
): Promise<{ sessions: ChatSession[] }> {
  return requestJson<{ sessions: ChatSession[] }>(
    `/api/chat/sessions?collectionId=${encodeURIComponent(collectionId)}`,
  );
}

export async function createChatSessionRequest(
  body: ChatSessionCreateRequest,
): Promise<{ session: ChatSession }> {
  return requestJson<{ session: ChatSession }>("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateChatSessionRequest(params: {
  sessionId: string;
  body: ChatSessionUpdateRequest;
}): Promise<{ session: ChatSession }> {
  return requestJson<{ session: ChatSession }>(
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
): Promise<{ session: ChatSession; messages: ChatMessage[] }> {
  return requestJson<{ session: ChatSession; messages: ChatMessage[] }>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
  );
}

export async function streamChatReplyRequest(params: {
  sessionId: string;
  body: ChatReplyStreamBody;
  onUpdate: (options: {
    content: string;
    events: ChatReplyStreamDataEvent[];
    progress: ChatReplyProgressState | null;
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

  let processedEventCount = 0;

  for await (const message of readUIMessageStream<ChatReplyStreamUIMessage>({
    stream: parsedStream,
    terminateOnError: true,
  })) {
    const nextEvents = getStreamDataEvents(message);
    const events = nextEvents.slice(processedEventCount);
    processedEventCount = nextEvents.length;

    params.onUpdate({
      content: getStreamMessageContent(message),
      events,
      progress: reduceChatReplyProgressEvents(nextEvents),
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

export async function uploadKnowledgeFileRequest(params: {
  collectionId: string;
  file: File;
}): Promise<KnowledgeImportData> {
  const formData = new FormData();
  formData.set("file", params.file);

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

export async function listKnowledgeTemplatesRequest(): Promise<{
  templates: KnowledgeTemplateSummary[];
}> {
  return requestJson<{ templates: KnowledgeTemplateSummary[] }>(
    "/api/kb/templates",
  );
}

export async function listKnowledgeExportTasksRequest(params?: {
  sourceId?: string;
}): Promise<{ tasks: KnowledgeExportTask[] }> {
  const search = new URLSearchParams();

  if (params?.sourceId) {
    search.set("sourceId", params.sourceId);
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return requestJson<{ tasks: KnowledgeExportTask[] }>(
    `/api/kb/export-tasks${suffix}`,
  );
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

export async function fetchKnowledgeExportTaskRequest(
  taskId: string,
): Promise<{ task: KnowledgeExportTaskDetail }> {
  return requestJson<{ task: KnowledgeExportTaskDetail }>(
    `/api/kb/export-tasks/${encodeURIComponent(taskId)}`,
  );
}

export async function updateKnowledgeExportTaskRequest(params: {
  taskId: string;
  body: KnowledgeExportTaskUpdateRequest;
}): Promise<{ task: KnowledgeExportTaskDetail }> {
  return requestJson<{ task: KnowledgeExportTaskDetail }>(
    `/api/kb/export-tasks/${encodeURIComponent(params.taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(params.body),
    },
  );
}

export async function downloadKnowledgeExportTaskRequest(params: {
  filename?: string;
  taskId: string;
}): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(
    resolveRequestUrl(
      `/api/kb/export-tasks/${encodeURIComponent(params.taskId)}/download`,
      token,
      "GET",
    ),
    {
      headers: {
        Accept: "*/*",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );

  if (response.status === 401) {
    clearAuthToken();
    notifyAuthExpired();
  }

  if (!response.ok) {
    throw new Error(`导出结果下载失败 (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = params.filename || "export-result";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}
