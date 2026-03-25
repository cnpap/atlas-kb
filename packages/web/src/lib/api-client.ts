import {
  isDataUIPart,
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessage,
} from "ai";
import { ChatReplyStreamDataEventSchema } from "@atlas-kb/schema";
import type {
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
  KnowledgeBatchImportData,
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

function resolveApiUrl(path: string): string {
  return new URL(path, getApiBaseUrl()).toString();
}

function parseDownloadFilename(headerValue: string | null): string | undefined {
  if (!headerValue) return undefined;
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
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
    return parsed.success ? [parsed.data] : [];
  });
}

async function getStreamRequestError(response: Response): Promise<Error> {
  try {
    const payload = (await response.clone().json()) as FailureEnvelope;

    if (!payload.success) {
      return new Error(payload.error.message);
    }
  } catch {
    const text = (await response.text()).trim();

    if (text) {
      return new Error(text);
    }
  }

  return new Error(`请求失败 (${response.status})`);
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

export async function importKnowledgeFilesRequest(params: {
  collectionId: string;
  files: File[];
  summary?: string;
  tags?: string[];
}): Promise<KnowledgeBatchImportData> {
  const form = new FormData();

  for (const file of params.files) {
    form.append("files", file);
  }

  if (params.summary) form.append("summary", params.summary);
  if (params.tags?.length) form.append("tags", params.tags.join(", "));

  return requestJson<KnowledgeBatchImportData>(
    `/api/kb/collections/${encodeURIComponent(params.collectionId)}/imports/files`,
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
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.body),
    },
  );

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
    parseDownloadFilename(response.headers.get("Content-Disposition")) ||
    params.filename ||
    "atlas-kb-download";

  link.href = objectUrl;
  link.download = resolvedFilename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
