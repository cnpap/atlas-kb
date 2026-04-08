import type { MastraModelConfig } from "@mastra/core/llm";
import { ApiHttpError, ModelProviderUnavailableError } from "@atlas-kb/errors";
import {
  getOpenAIBaseUrl,
  getOpenAIApiKey,
  getOpenAIModel,
} from "../knowledge/config";

const DEFAULT_RUNTIME_PROVIDER = "openai";
const MODEL_TIMEOUT_MESSAGE = "知识库回答超时，请稍后重试。";

type RuntimeModelLogContext = {
  runtimeProvider: string;
  runtimeModel: string;
};

class ModelInvocationTimeoutError extends Error {
  readonly phase: "request" | "first-token" | "stream-idle";

  constructor(phase: "request" | "first-token" | "stream-idle") {
    super(MODEL_TIMEOUT_MESSAGE);
    this.name = "ModelInvocationTimeoutError";
    this.phase = phase;
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getRuntimeModelProvider(): string {
  return readEnv("RUNTIME_PROVIDER") ?? DEFAULT_RUNTIME_PROVIDER;
}

function getConfiguredRuntimeModelId(): string | undefined {
  const provider = getRuntimeModelProvider();

  if (provider === "openai") {
    return getOpenAIModel();
  }

  return readEnv("RUNTIME_MODEL");
}

export function getRuntimeModelLabel(): string {
  return `${getRuntimeModelProvider()}/${getConfiguredRuntimeModelId() ?? "unknown"}`;
}

export function getRuntimeModelLogContext(): RuntimeModelLogContext {
  return {
    runtimeProvider: getRuntimeModelProvider(),
    runtimeModel: getRuntimeModelLabel(),
  };
}

function logRuntimeModelIssue(
  action: string,
  message: string,
  error?: unknown,
): void {
  console.error("[runtime-model] issue", {
    action,
    message,
    errorMessage:
      error instanceof Error && error.message.trim()
        ? error.message
        : undefined,
    errorName: error instanceof Error ? error.name : undefined,
    ...getRuntimeModelLogContext(),
  });
}

export function createRuntimeModel(): MastraModelConfig {
  const provider = getRuntimeModelProvider();

  if (provider === "openai") {
    return {
      providerId: "openai",
      modelId: getOpenAIModel(),
      url: getOpenAIBaseUrl(),
      apiKey: getOpenAIApiKey(),
    };
  }

  if (provider === "alibaba-cn") {
    return {
      providerId: "alibaba-cn",
      modelId: getConfiguredRuntimeModelId() ?? "unknown",
      apiKey: readEnv("DASHSCOPE_API_KEY"),
    };
  }

  return {
    providerId: provider,
    modelId: getConfiguredRuntimeModelId() ?? "unknown",
    apiKey: getOpenAIApiKey(),
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

export function mapRuntimeModelError(
  error: unknown,
  action: string,
): ApiHttpError {
  if (error instanceof ApiHttpError) {
    return error;
  }

  if (error instanceof ModelInvocationTimeoutError) {
    logRuntimeModelIssue(
      action,
      `模型调用在 ${error.phase} 阶段触发本地超时。`,
      error,
    );
    return new ModelProviderUnavailableError(MODEL_TIMEOUT_MESSAGE, error);
  }

  logRuntimeModelIssue(action, readErrorText(error) || "模型调用失败。", error);
  return new ModelProviderUnavailableError(
    "知识库回答暂时不可用，请稍后重试。",
    error,
  );
}
