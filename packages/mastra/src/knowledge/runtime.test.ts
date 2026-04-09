import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  fetchKnowledgeEmbeddingVector,
  isRetriableEmbeddingFailure,
  resetKnowledgeRuntimeCache,
} from "./runtime";

const originalFetch = globalThis.fetch;
const originalEmbeddingApiKey = process.env.EMBEDDING_API_KEY;
const originalEmbeddingBaseUrl = process.env.EMBEDDING_BASE_URL;
const originalEmbeddingModel = process.env.EMBEDDING_MODEL;
const originalEmbeddingMaxConcurrency = process.env.EMBEDDING_MAX_CONCURRENCY;
const originalEmbeddingMaxRetries = process.env.EMBEDDING_MAX_RETRIES;
const originalEmbeddingRetryBaseMs = process.env.EMBEDDING_RETRY_BASE_MS;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("knowledge runtime embeddings", () => {
  beforeEach(() => {
    process.env.EMBEDDING_API_KEY = "test-embedding-key";
    process.env.EMBEDDING_BASE_URL =
      "https://dashscope.aliyuncs.com/compatible-mode/v1";
    process.env.EMBEDDING_MODEL = "text-embedding-v4";
    process.env.EMBEDDING_MAX_CONCURRENCY = "1";
    process.env.EMBEDDING_MAX_RETRIES = "1";
    process.env.EMBEDDING_RETRY_BASE_MS = "1";
    resetKnowledgeRuntimeCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;

    if (originalEmbeddingApiKey === undefined) {
      delete process.env.EMBEDDING_API_KEY;
    } else {
      process.env.EMBEDDING_API_KEY = originalEmbeddingApiKey;
    }

    if (originalEmbeddingBaseUrl === undefined) {
      delete process.env.EMBEDDING_BASE_URL;
    } else {
      process.env.EMBEDDING_BASE_URL = originalEmbeddingBaseUrl;
    }

    if (originalEmbeddingModel === undefined) {
      delete process.env.EMBEDDING_MODEL;
    } else {
      process.env.EMBEDDING_MODEL = originalEmbeddingModel;
    }

    if (originalEmbeddingMaxConcurrency === undefined) {
      delete process.env.EMBEDDING_MAX_CONCURRENCY;
    } else {
      process.env.EMBEDDING_MAX_CONCURRENCY = originalEmbeddingMaxConcurrency;
    }

    if (originalEmbeddingMaxRetries === undefined) {
      delete process.env.EMBEDDING_MAX_RETRIES;
    } else {
      process.env.EMBEDDING_MAX_RETRIES = originalEmbeddingMaxRetries;
    }

    if (originalEmbeddingRetryBaseMs === undefined) {
      delete process.env.EMBEDDING_RETRY_BASE_MS;
    } else {
      process.env.EMBEDDING_RETRY_BASE_MS = originalEmbeddingRetryBaseMs;
    }

    resetKnowledgeRuntimeCache();
  });

  it("marks DashScope rate-limit errors as retriable", () => {
    expect(
      isRetriableEmbeddingFailure({
        status: 429,
        details: '{"error":{"code":"limit_requests"}}',
      }),
    ).toBe(true);
  });

  it("retries rate-limited embedding requests", async () => {
    let requestCount = 0;

    globalThis.fetch = (async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return jsonResponse(
          {
            error: {
              code: "limit_requests",
              message: "rate limit",
            },
          },
          429,
        );
      }

      return jsonResponse({
        data: [
          {
            embedding: [0.11, 0.22, 0.33],
          },
        ],
      });
    }) as unknown as typeof fetch;

    await expect(fetchKnowledgeEmbeddingVector("atlas")).resolves.toEqual([
      0.11, 0.22, 0.33,
    ]);
    expect(requestCount).toBe(2);
  });

  it("does not retry non-retriable embedding failures", async () => {
    let requestCount = 0;

    globalThis.fetch = (async () => {
      requestCount += 1;

      return jsonResponse(
        {
          error: {
            code: "invalid_request_error",
            message: "unsupported model",
          },
        },
        400,
      );
    }) as unknown as typeof fetch;

    await expect(fetchKnowledgeEmbeddingVector("atlas")).rejects.toThrow(
      "向量索引创建失败",
    );
    expect(requestCount).toBe(1);
  });
});
