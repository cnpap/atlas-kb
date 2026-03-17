import { treaty } from "@elysiajs/eden";
import type { App as ApiApp } from "@atlas-kb/api";
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

export const api = treaty<ApiApp>(getApiBaseUrl());

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
