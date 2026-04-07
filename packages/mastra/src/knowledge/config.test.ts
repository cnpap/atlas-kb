import { afterEach, describe, expect, it } from "bun:test";
import {
  getOpenAIBaseUrl,
  getOpenAIUrl,
  getRuntimeModel,
  getRuntimeModelLabel,
  getRuntimeModelProvider,
  resetKnowledgeConfigCache,
} from "./config";

const originalOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
const originalOpenAIModel = process.env.OPENAI_MODEL;
const originalRuntimeProvider = process.env.RUNTIME_PROVIDER;
const originalRuntimeModel = process.env.RUNTIME_MODEL;
const originalOpenAIApiKey = process.env.OPENAI_API_KEY;
const originalDashScopeApiKey = process.env.DASHSCOPE_API_KEY;

afterEach(() => {
  if (originalOpenAIBaseUrl === undefined) {
    delete process.env.OPENAI_BASE_URL;
  } else {
    process.env.OPENAI_BASE_URL = originalOpenAIBaseUrl;
  }

  if (originalOpenAIModel === undefined) {
    delete process.env.OPENAI_MODEL;
  } else {
    process.env.OPENAI_MODEL = originalOpenAIModel;
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

  if (originalOpenAIApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAIApiKey;
  }

  if (originalDashScopeApiKey === undefined) {
    delete process.env.DASHSCOPE_API_KEY;
  } else {
    process.env.DASHSCOPE_API_KEY = originalDashScopeApiKey;
  }

  resetKnowledgeConfigCache();
});

describe("@atlas-kb/mastra knowledge config", () => {
  it("uses the configured OPENAI_BASE_URL when building chat URLs", () => {
    process.env.OPENAI_BASE_URL = "https://api.duckcoding.ai";

    expect(getOpenAIBaseUrl()).toBe("https://api.duckcoding.ai/v1");
    expect(getOpenAIUrl("chat/completions")).toBe(
      "https://api.duckcoding.ai/v1/chat/completions",
    );
  });

  it("uses OPENAI_* settings when runtime provider is openai", () => {
    process.env.RUNTIME_PROVIDER = "openai";
    process.env.RUNTIME_MODEL = "qwen-plus";
    process.env.OPENAI_MODEL = "gpt-5.4";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_BASE_URL = "https://api.duckcoding.ai/v1";

    expect(getRuntimeModelProvider()).toBe("openai");
    expect(getRuntimeModelLabel()).toBe("openai/gpt-5.4");
    expect(getRuntimeModel()).toEqual({
      providerId: "openai",
      modelId: "gpt-5.4",
      url: "https://api.duckcoding.ai/v1",
      apiKey: "test-openai-key",
    });
  });

  it("uses runtime provider and runtime model for non-openai providers", () => {
    process.env.RUNTIME_PROVIDER = "alibaba-cn";
    process.env.RUNTIME_MODEL = "qwen3.6-plus";
    process.env.DASHSCOPE_API_KEY = "test-dashscope-key";

    expect(getRuntimeModelProvider()).toBe("alibaba-cn");
    expect(getRuntimeModelLabel()).toBe("alibaba-cn/qwen3.6-plus");
    expect(getRuntimeModel()).toEqual({
      providerId: "alibaba-cn",
      modelId: "qwen3.6-plus",
      apiKey: "test-dashscope-key",
    });
  });

  it("requires a runtime model for non-openai providers", () => {
    process.env.RUNTIME_PROVIDER = "alibaba-cn";
    delete process.env.RUNTIME_MODEL;

    expect(() => getRuntimeModel()).toThrow(
      "Missing required runtime model for provider: alibaba-cn",
    );
  });
});
