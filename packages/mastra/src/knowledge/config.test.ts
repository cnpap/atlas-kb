import { afterEach, describe, expect, it } from "bun:test";
import {
  getChatTitleBaseUrl,
  getChatTitleModel,
  getOpenAIBaseUrl,
  getOpenAIUrl,
  getKnowledgeS3PublicEndpoint,
  resetKnowledgeConfigCache,
  validateKnowledgeStorageConfig,
} from "./config";

const originalOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
const originalOpenAIModel = process.env.OPENAI_MODEL;
const originalEmbeddingBaseUrl = process.env.EMBEDDING_BASE_URL;
const originalRuntimeProvider = process.env.RUNTIME_PROVIDER;
const originalRuntimeModel = process.env.RUNTIME_MODEL;
const originalChatTitleModel = process.env.ATLAS_KB_CHAT_TITLE_MODEL;
const originalS3Endpoint = process.env.ATLAS_KB_S3_ENDPOINT;
const originalS3PublicEndpoint = process.env.ATLAS_KB_S3_PUBLIC_ENDPOINT;
const originalS3Region = process.env.ATLAS_KB_S3_REGION;
const originalS3Bucket = process.env.ATLAS_KB_S3_BUCKET;
const originalS3AccessKeyId = process.env.ATLAS_KB_S3_ACCESS_KEY_ID;
const originalS3SecretAccessKey = process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY;
const originalInternalSecret = process.env.ATLAS_KB_INTERNAL_SECRET;
const originalTikaBaseUrl = process.env.ATLAS_KB_TIKA_BASE_URL;
const originalEmbeddingApiKey = process.env.EMBEDDING_API_KEY;
const originalEmbeddingModel = process.env.EMBEDDING_MODEL;
const originalQdrantUrl = process.env.QDRANT_URL;

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

  if (originalS3Endpoint === undefined) {
    delete process.env.ATLAS_KB_S3_ENDPOINT;
  } else {
    process.env.ATLAS_KB_S3_ENDPOINT = originalS3Endpoint;
  }

  if (originalS3PublicEndpoint === undefined) {
    delete process.env.ATLAS_KB_S3_PUBLIC_ENDPOINT;
  } else {
    process.env.ATLAS_KB_S3_PUBLIC_ENDPOINT = originalS3PublicEndpoint;
  }

  if (originalS3Region === undefined) {
    delete process.env.ATLAS_KB_S3_REGION;
  } else {
    process.env.ATLAS_KB_S3_REGION = originalS3Region;
  }

  if (originalS3Bucket === undefined) {
    delete process.env.ATLAS_KB_S3_BUCKET;
  } else {
    process.env.ATLAS_KB_S3_BUCKET = originalS3Bucket;
  }

  if (originalS3AccessKeyId === undefined) {
    delete process.env.ATLAS_KB_S3_ACCESS_KEY_ID;
  } else {
    process.env.ATLAS_KB_S3_ACCESS_KEY_ID = originalS3AccessKeyId;
  }

  if (originalS3SecretAccessKey === undefined) {
    delete process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY;
  } else {
    process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY = originalS3SecretAccessKey;
  }

  if (originalInternalSecret === undefined) {
    delete process.env.ATLAS_KB_INTERNAL_SECRET;
  } else {
    process.env.ATLAS_KB_INTERNAL_SECRET = originalInternalSecret;
  }

  if (originalTikaBaseUrl === undefined) {
    delete process.env.ATLAS_KB_TIKA_BASE_URL;
  } else {
    process.env.ATLAS_KB_TIKA_BASE_URL = originalTikaBaseUrl;
  }

  if (originalEmbeddingApiKey === undefined) {
    delete process.env.EMBEDDING_API_KEY;
  } else {
    process.env.EMBEDDING_API_KEY = originalEmbeddingApiKey;
  }

  if (originalEmbeddingModel === undefined) {
    delete process.env.EMBEDDING_MODEL;
  } else {
    process.env.EMBEDDING_MODEL = originalEmbeddingModel;
  }

  if (originalQdrantUrl === undefined) {
    delete process.env.QDRANT_URL;
  } else {
    process.env.QDRANT_URL = originalQdrantUrl;
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

  it("uses the dedicated public S3 endpoint for download links when configured", () => {
    process.env.ATLAS_KB_S3_ENDPOINT = "http://rustfs:9000";
    process.env.ATLAS_KB_S3_PUBLIC_ENDPOINT = "http://192.168.99.209:9000";

    expect(getKnowledgeS3PublicEndpoint()).toBe("http://192.168.99.209:9000");
  });

  it("falls back to the internal S3 endpoint for download links", () => {
    process.env.ATLAS_KB_S3_ENDPOINT = "http://rustfs:9000";
    delete process.env.ATLAS_KB_S3_PUBLIC_ENDPOINT;

    expect(getKnowledgeS3PublicEndpoint()).toBe("http://rustfs:9000");
  });

  it("requires hybrid retrieval config at startup", () => {
    process.env.ATLAS_KB_S3_ENDPOINT = "http://rustfs:9000";
    process.env.ATLAS_KB_S3_REGION = "us-east-1";
    process.env.ATLAS_KB_S3_BUCKET = "atlas-kb-test";
    process.env.ATLAS_KB_S3_ACCESS_KEY_ID = "test-access-key";
    process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.ATLAS_KB_INTERNAL_SECRET = "test-internal-secret";
    process.env.ATLAS_KB_TIKA_BASE_URL = "http://tika.local";
    process.env.QDRANT_URL = "http://127.0.0.1:6333";
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.EMBEDDING_MODEL;

    expect(() => validateKnowledgeStorageConfig()).toThrow(
      "Atlas KB requires hybrid retrieval configuration",
    );
  });
});
