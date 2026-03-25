import {
  ApiHttpError,
  ModelProviderConfigurationError,
  ModelProviderPermissionError,
  ModelProviderRateLimitError,
  ModelProviderUnavailableError,
} from "@atlas-kb/errors";
import { getOpenAIBaseUrl, getOpenAIModel } from "./config";

function readNumericField(
  value: unknown,
  key: "status" | "statusCode",
): number | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === "number" ? candidate : undefined;
}

function extractStatusCode(error: unknown): number | undefined {
  const directStatus =
    readNumericField(error, "status") ?? readNumericField(error, "statusCode");

  if (directStatus) {
    return directStatus;
  }

  if (!error || typeof error !== "object") {
    return undefined;
  }

  const cause = (error as Record<string, unknown>).cause;
  const causeStatus =
    readNumericField(cause, "status") ?? readNumericField(cause, "statusCode");

  if (causeStatus) {
    return causeStatus;
  }

  const response = (error as Record<string, unknown>).response;
  const responseStatus =
    readNumericField(response, "status") ??
    readNumericField(response, "statusCode");

  if (responseStatus) {
    return responseStatus;
  }

  if (!(error instanceof Error)) {
    return undefined;
  }

  const match = error.message.match(/\bstatus(?: code)?\s+(\d{3})\b/i);

  if (!match) {
    return undefined;
  }

  return Number.parseInt(match[1] || "", 10) || undefined;
}

function buildProviderContext(): string {
  return [
    `当前 OPENAI_BASE_URL=${getOpenAIBaseUrl()}。`,
    `当前 OPENAI_MODEL=${getOpenAIModel()}。`,
    "请确认该中转服务可正常透传官方 OpenAI API，且该模型对当前 API Key 可用。",
  ].join(" ");
}

export function requireChatModelProvider(): void {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return;
  }

  throw new ModelProviderConfigurationError(
    `${buildProviderContext()} 缺少 OPENAI_API_KEY，聊天不会再回退到 mock 回答。`,
  );
}

export function mapModelProviderError(
  error: unknown,
  action: string,
): ApiHttpError {
  if (error instanceof ApiHttpError) {
    return error;
  }

  const context = buildProviderContext();
  const statusCode = extractStatusCode(error);

  if (statusCode === 401) {
    return new ModelProviderConfigurationError(
      `${action} 被模型服务拒绝，返回 401。${context} 请检查 OPENAI_API_KEY 是否正确。`,
      error,
    );
  }

  if (statusCode === 403) {
    return new ModelProviderPermissionError(
      `${action} 被模型服务拒绝，返回 403。${context} 如果使用第三方 OpenAI-compatible 服务，通常还需要显式设置 OPENAI_MODEL。`,
      error,
    );
  }

  if (statusCode === 429) {
    return new ModelProviderRateLimitError(
      `${action} 触发模型服务限流，返回 429。${context}`,
      error,
    );
  }

  if (typeof statusCode === "number" && statusCode >= 500) {
    return new ModelProviderUnavailableError(
      `${action} 失败，模型服务返回 ${statusCode}。${context}`,
      error,
    );
  }

  if (error instanceof Error && error.message.trim()) {
    return new ModelProviderUnavailableError(
      `${action} 失败。${context} 原始错误: ${error.message.trim()}`,
      error,
    );
  }

  return new ModelProviderUnavailableError(`${action} 失败。${context}`, error);
}

export function throwMappedModelProviderError(
  error: unknown,
  action: string,
): never {
  throw mapModelProviderError(error, action);
}
