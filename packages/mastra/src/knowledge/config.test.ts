import { afterEach, describe, expect, it } from "bun:test";
import {
  getOpenAIBaseUrl,
  getOpenAIUrl,
  resetKnowledgeConfigCache,
} from "./config";

const originalOpenAIBaseUrl = process.env.OPENAI_BASE_URL;

afterEach(() => {
  if (originalOpenAIBaseUrl === undefined) {
    delete process.env.OPENAI_BASE_URL;
  } else {
    process.env.OPENAI_BASE_URL = originalOpenAIBaseUrl;
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
});
