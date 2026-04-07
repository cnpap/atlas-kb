import {
  ApiHttpError,
  ModelProviderConfigurationError,
  ModelProviderPermissionError,
  ModelProviderRateLimitError,
  ModelProviderUnavailableError,
} from "@atlas-kb/errors";
import { getOpenAIBaseUrl, getOpenAIModel } from "./config";

type ModelProviderLogContext = {
  hasOpenAIApiKey: boolean;
  openAIBaseUrl: string;
  openAIModel: string;
};

export class ModelInvocationTimeoutError extends Error {
  readonly phase: "request" | "first-token" | "stream-idle";

  constructor(phase: "request" | "first-token" | "stream-idle") {
    super("知识库回答超时，请稍后重试。");
    this.name = "ModelInvocationTimeoutError";
    this.phase = phase;
  }
}

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

export function getModelProviderLogContext(): ModelProviderLogContext {
  return {
    hasOpenAIApiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    openAIBaseUrl: getOpenAIBaseUrl(),
    openAIModel: getOpenAIModel(),
  };
}

function readErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  const parts = [error.message];

  if (error.cause instanceof Error) {
    parts.push(error.cause.message);
  }

  return parts.join(" ").trim();
}

function logModelProviderIssue(
  action: string,
  details: string,
  error?: unknown,
): void {
  const errorName = error instanceof Error ? error.name : undefined;
  const errorMessage = readErrorText(error);

  console.error("[model-provider] issue", {
    action,
    details,
    errorMessage: errorMessage || undefined,
    errorName,
    ...getModelProviderLogContext(),
  });
}

export function requireChatModelProvider(): void {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return;
  }

  logModelProviderIssue("配置检查", "缺少 OPENAI_API_KEY。");
  throw new ModelProviderConfigurationError(
    "知识库回答暂时不可用，请稍后重试。",
  );
}

export function mapModelProviderError(
  error: unknown,
  action: string,
): ApiHttpError {
  if (error instanceof ApiHttpError) {
    return error;
  }

  const statusCode = extractStatusCode(error);
  const errorText = readErrorText(error);

  if (error instanceof ModelInvocationTimeoutError) {
    logModelProviderIssue(
      action,
      `模型调用在 ${error.phase} 阶段触发本地超时。`,
      error,
    );
    return new ModelProviderUnavailableError(
      "知识库回答超时，请稍后重试。",
      error,
    );
  }

  if (statusCode === 401) {
    logModelProviderIssue(action, "模型服务返回 401。", error);
    return new ModelProviderConfigurationError(
      "知识库回答暂时不可用，请稍后重试。",
      error,
    );
  }

  if (statusCode === 403) {
    logModelProviderIssue(action, "模型服务返回 403。", error);
    return new ModelProviderPermissionError(
      "知识库回答暂时不可用，请稍后重试。",
      error,
    );
  }

  if (statusCode === 429) {
    logModelProviderIssue(action, "模型服务返回 429。", error);
    return new ModelProviderRateLimitError(
      "知识库回答暂时繁忙，请稍后重试。",
      error,
    );
  }

  if (typeof statusCode === "number" && statusCode >= 500) {
    logModelProviderIssue(action, `模型服务返回 ${statusCode}。`, error);
    return new ModelProviderUnavailableError(
      "知识库回答暂时不可用，请稍后重试。",
      error,
    );
  }

  if (errorText) {
    logModelProviderIssue(action, errorText, error);
    return new ModelProviderUnavailableError(
      "知识库回答暂时不可用，请稍后重试。",
      error,
    );
  }

  logModelProviderIssue(action, "模型服务返回未知错误。", error);
  return new ModelProviderUnavailableError(
    "知识库回答暂时不可用，请稍后重试。",
    error,
  );
}

export function throwMappedModelProviderError(
  error: unknown,
  action: string,
): never {
  throw mapModelProviderError(error, action);
}
