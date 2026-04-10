import { afterEach, describe, expect, it } from "bun:test";
import {
  getChatTitleBaseUrl,
  getChatTitleModel,
  getOpenAIBaseUrl,
  getOpenAIUrl,
  resetKnowledgeConfigCache,
} from "./config";

const originalOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
const originalOpenAIModel = process.env.OPENAI_MODEL;
const originalEmbeddingBaseUrl = process.env.EMBEDDING_BASE_URL;
const originalRuntimeProvider = process.env.RUNTIME_PROVIDER;
const originalRuntimeModel = process.env.RUNTIME_MODEL;
const originalChatTitleModel = process.env.ATLAS_KB_CHAT_TITLE_MODEL;

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

  if (originalEmbeddingBaseUrl === undefined) {
    delete process.env.EMBEDDING_BASE_URL;
  } else {
    process.env.EMBEDDING_BASE_URL = originalEmbeddingBaseUrl;
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

  if (originalChatTitleModel === undefined) {
    delete process.env.ATLAS_KB_CHAT_TITLE_MODEL;
  } else {
    process.env.ATLAS_KB_CHAT_TITLE_MODEL = originalChatTitleModel;
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

  it("uses the dedicated chat title model when configured", () => {
    process.env.OPENAI_MODEL = "gpt-5.4";
    process.env.ATLAS_KB_CHAT_TITLE_MODEL = "qwen-flash";

    expect(getChatTitleModel()).toBe("qwen-flash");
  });

  it("uses the DashScope compatible base url for alibaba chat titles", () => {
    process.env.RUNTIME_PROVIDER = "alibaba-cn";
    process.env.RUNTIME_MODEL = "qwen3.6-plus";
    process.env.EMBEDDING_BASE_URL =
      "https://dashscope.aliyuncs.com/compatible-mode/v1";

    expect(getChatTitleBaseUrl()).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    );
  });
});
