import { treaty } from "@elysiajs/eden";
import type { App as ApiApp } from "@atlas-kb/api";
import type {
  AskKnowledgeRequest,
  AskKnowledgeResult,
  KnowledgeDocumentsData,
  KnowledgeSpaceCreateRequest,
  KnowledgeSpaceMutationData,
  KnowledgeSpacesData,
  KnowledgeUploadData,
  LoginRequest,
  LoginResult,
  Session,
} from "@atlas-kb/schema";
import { getApiBaseUrl } from "./env";
import { getAuthToken } from "./auth";

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

export const api = treaty<ApiApp>(getApiBaseUrl());

function createAuthHeaders(): { authorization: string } {
  const token = getAuthToken();

  if (!token) {
    throw new Error("请先登录");
  }

  return {
    authorization: `Bearer ${token}`,
  };
}

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

export function unwrapSuccess<T>(payload: unknown): T {
  const envelope = payload as SuccessEnvelope<T> | FailureEnvelope | null;
  if (!envelope) throw new Error("空响应载荷");
  if (!envelope.success) throw new Error(envelope.error.message);
  return envelope.data;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "请求失败";
}

export async function loginRequest(body: LoginRequest): Promise<LoginResult> {
  const response = await api.api.auth.login.post(body);
  return unwrapSuccess<LoginResult>(response.data);
}

export async function fetchCurrentSession(): Promise<Session> {
  const response = await api.api.auth.me.get({
    headers: createAuthHeaders(),
  });
  return unwrapSuccess<Session>(response.data);
}

export async function getKnowledgeSpaces(): Promise<KnowledgeSpacesData> {
  const response = await api.api.kb.spaces.get({
    headers: createAuthHeaders(),
  });
  return unwrapSuccess<KnowledgeSpacesData>(response.data);
}

export async function createKnowledgeSpaceRequest(
  body: KnowledgeSpaceCreateRequest,
): Promise<KnowledgeSpaceMutationData> {
  const response = await api.api.kb.spaces.post(body, {
    headers: createAuthHeaders(),
  });
  return unwrapSuccess<KnowledgeSpaceMutationData>(response.data);
}

export async function getKnowledgeDocuments(
  spaceId: string,
): Promise<KnowledgeDocumentsData> {
  const response = await api.api.kb.spaces({ spaceId }).documents.get({
    headers: createAuthHeaders(),
  });
  return unwrapSuccess<KnowledgeDocumentsData>(response.data);
}

export function getKnowledgeDocumentDownloadUrl(params: {
  documentId: string;
  spaceId: string;
}): string {
  return resolveApiUrl(
    `/api/kb/spaces/${encodeURIComponent(params.spaceId)}/documents/${encodeURIComponent(params.documentId)}/download`,
  );
}

export async function uploadKnowledgeDocumentRequest(params: {
  file: File;
  spaceId: string;
  summary?: string;
  tags?: string;
  title?: string;
}): Promise<KnowledgeUploadData> {
  const response = await api.api.kb
    .spaces({ spaceId: params.spaceId })
    .documents.upload.post(
      {
        file: params.file,
        summary: params.summary,
        tags: params.tags,
        title: params.title,
      },
      {
        headers: createAuthHeaders(),
      },
    );
  return unwrapSuccess<KnowledgeUploadData>(response.data);
}

export async function downloadKnowledgeDocumentRequest(params: {
  downloadUrl: string;
  filename?: string;
}): Promise<void> {
  const response = await fetch(resolveApiUrl(params.downloadUrl), {
    headers: createAuthHeaders(),
  });

  if (!response.ok) {
    let errorMessage = "文档下载失败";
    try {
      const payload = (await response.json()) as FailureEnvelope;
      if (!payload.success) errorMessage = payload.error.message;
    } catch {
      errorMessage = `文档下载失败 (状态码: ${response.status})`;
    }
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const resolvedFilename =
    params.filename ||
    parseDownloadFilename(response.headers.get("Content-Disposition")) ||
    "download";

  link.href = objectUrl;
  link.download = resolvedFilename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function askKnowledgeQuestion(
  body: AskKnowledgeRequest,
): Promise<AskKnowledgeResult> {
  const response = await api.api.kb.ask.post(body, {
    headers: createAuthHeaders(),
  });
  return unwrapSuccess<AskKnowledgeResult>(response.data);
}
