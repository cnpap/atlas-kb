import type {
  ChatMessageFeedback,
  ChatMessageFeedbackRequest,
  ChatMessagesData,
  ChatReplyFinal,
  ChatReplyRequest,
  ChatSessionCreateRequest,
  ChatSessionsData,
  ChatSessionUpdateRequest,
  DashboardSummary,
  HealthData,
  KnowledgeCollectionCreateRequest,
  KnowledgeCollectionData,
  KnowledgeCollectionUpdateRequest,
  KnowledgeCollectionsData,
  KnowledgeImportData,
  KnowledgeImportJobsData,
  KnowledgeSourceData,
  KnowledgeSourceUpdateRequest,
  KnowledgeSourcesData,
  KnowledgeTextImportRequest,
  SearchKnowledgeRequest,
  SearchKnowledgeResult,
} from "@atlas-kb/schema";
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

function resolveApiUrl(path: string): string {
  return new URL(path, getApiBaseUrl()).toString();
}

function parseDownloadFilename(headerValue: string | null): string | undefined {
  if (!headerValue) return undefined;
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const basicMatch = headerValue.match(/filename="([^"]+)"/i);
  return basicMatch?.[1];
}

async function readPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as JsonPayload<T>;

  if (!payload) {
    throw new Error("空响应载荷");
  }

  if (!payload.success) {
    throw new Error(payload.error.message);
  }

  return payload.data;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });

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

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "请求失败";
}

export function getKnowledgeSourceDownloadUrl(sourceId: string): string {
  return resolveApiUrl(
    `/api/kb/sources/${encodeURIComponent(sourceId)}/download`,
  );
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return requestJson<DashboardSummary>("/api/dashboard/summary");
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

export async function refreshKnowledgeSourceRequest(
  sourceId: string,
): Promise<KnowledgeImportData> {
  return requestJson<KnowledgeImportData>(
    `/api/kb/sources/${encodeURIComponent(sourceId)}/refresh`,
    {
      method: "POST",
    },
  );
}

export async function reprocessKnowledgeSourceRequest(
  sourceId: string,
): Promise<KnowledgeImportData> {
  return requestJson<KnowledgeImportData>(
    `/api/kb/sources/${encodeURIComponent(sourceId)}/reprocess`,
    {
      method: "POST",
    },
  );
}

export async function importKnowledgeFileRequest(params: {
  collectionId: string;
  file: File;
  title?: string;
  summary?: string;
  tags?: string[];
}): Promise<KnowledgeImportData> {
  const form = new FormData();

  form.append("file", params.file);
  if (params.title) form.append("title", params.title);
  if (params.summary) form.append("summary", params.summary);
  if (params.tags?.length) form.append("tags", params.tags.join(", "));

  return requestJson<KnowledgeImportData>(
    `/api/kb/collections/${encodeURIComponent(params.collectionId)}/imports/file`,
    {
      method: "POST",
      body: form,
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

export async function listImportJobsRequest(): Promise<KnowledgeImportJobsData> {
  return requestJson<KnowledgeImportJobsData>("/api/kb/imports");
}

export async function searchKnowledgeRequest(
  body: SearchKnowledgeRequest,
): Promise<SearchKnowledgeResult> {
  return requestJson<SearchKnowledgeResult>("/api/kb/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listChatSessionsRequest(): Promise<ChatSessionsData> {
  return requestJson<ChatSessionsData>("/api/chat/sessions");
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

export async function downloadKnowledgeSourceRequest(params: {
  sourceId: string;
  filename?: string;
}): Promise<void> {
  const response = await fetch(getKnowledgeSourceDownloadUrl(params.sourceId));

  if (!response.ok) {
    let errorMessage = "资料下载失败";

    try {
      const payload = (await response.json()) as FailureEnvelope;
      if (!payload.success) {
        errorMessage = payload.error.message;
      }
    } catch {
      errorMessage = `资料下载失败 (${response.status})`;
    }

    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const resolvedFilename =
    params.filename ||
    parseDownloadFilename(response.headers.get("Content-Disposition")) ||
    "atlas-kb-download";

  link.href = objectUrl;
  link.download = resolvedFilename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
