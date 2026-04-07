import { afterEach, describe, expect, it } from "bun:test";
import {
  mapModelProviderError,
  ModelInvocationTimeoutError,
  requireChatModelProvider,
} from "./model-provider";

const originalApiKey = process.env.OPENAI_API_KEY;
const originalBaseUrl = process.env.OPENAI_BASE_URL;
const originalModel = process.env.OPENAI_MODEL;
const originalRuntimeProvider = process.env.RUNTIME_PROVIDER;
const originalRuntimeModel = process.env.RUNTIME_MODEL;
const originalDashScopeApiKey = process.env.DASHSCOPE_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }

  if (originalBaseUrl === undefined) {
    delete process.env.OPENAI_BASE_URL;
  } else {
    process.env.OPENAI_BASE_URL = originalBaseUrl;
  }

  if (originalModel === undefined) {
    delete process.env.OPENAI_MODEL;
  } else {
    process.env.OPENAI_MODEL = originalModel;
  }

  if (originalRuntimeProvider === undefined) {
    delete process.env.RUNTIME_PROVIDER;
  } else {
    process.env.RUNTIME_PROVIDER = originalRuntimeProvider;
  }

  if (originalRuntimeModel === undefined) {
    delete process.env.RUNTIME_MODEL;
  } else {
    process.env.RUNTIME_MODEL = originalRuntimeModel;
  }

  if (originalDashScopeApiKey === undefined) {
    delete process.env.DASHSCOPE_API_KEY;
  } else {
    process.env.DASHSCOPE_API_KEY = originalDashScopeApiKey;
  }
});

describe("@atlas-kb/mastra model provider errors", () => {
  it("does not expose provider configuration details in mapped errors", () => {
    process.env.OPENAI_BASE_URL = "https://api.duckcoding.ai/v1";
    process.env.OPENAI_MODEL = "gpt-5.4";
    process.env.RUNTIME_PROVIDER = "openai";

    const error = mapModelProviderError(
      new Error("The operation timed out."),
      "AI 对话",
    );

    expect(error.message).toBe("知识库回答暂时不可用，请稍后重试。");
    expect(error.message.includes("OPENAI_BASE_URL")).toBe(false);
    expect(error.message.includes("OPENAI_MODEL")).toBe(false);
  });

  it("maps local invocation timeouts to a generic timeout message", () => {
    const error = mapModelProviderError(
      new ModelInvocationTimeoutError("stream-idle"),
      "AI 对话",
    );

    expect(error.message).toBe("知识库回答超时，请稍后重试。");
  });

  it("does not expose missing key diagnostics to callers", () => {
    process.env.RUNTIME_PROVIDER = "openai";
    process.env.OPENAI_MODEL = "gpt-5.4";
    delete process.env.OPENAI_API_KEY;

    expect(() => requireChatModelProvider()).toThrow(
      "知识库回答暂时不可用，请稍后重试。",
    );
  });

  it("uses DashScope key when runtime model points to alibaba-cn", () => {
    process.env.RUNTIME_PROVIDER = "alibaba-cn";
    process.env.RUNTIME_MODEL = "qwen-plus";
    delete process.env.OPENAI_API_KEY;
    process.env.DASHSCOPE_API_KEY = "test-dashscope-key";

    expect(() => requireChatModelProvider()).not.toThrow();
  });
});
