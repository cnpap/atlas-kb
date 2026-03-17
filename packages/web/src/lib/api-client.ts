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
    throw new Error("Please sign in first");
  }

  return {
    authorization: `Bearer ${token}`,
  };
}

export function unwrapSuccess<T>(payload: unknown): T {
  const envelope = payload as SuccessEnvelope<T> | FailureEnvelope | null;

  if (!envelope) {
    throw new Error("Empty response payload");
  }

  if (!envelope.success) {
    throw new Error(envelope.error.message);
  }

  return envelope.data;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed";
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

export async function askKnowledgeQuestion(
  body: AskKnowledgeRequest,
): Promise<AskKnowledgeResult> {
  const response = await api.api.kb.ask.post(body, {
    headers: createAuthHeaders(),
  });

  return unwrapSuccess<AskKnowledgeResult>(response.data);
}
