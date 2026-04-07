import { createOpenAI } from "@ai-sdk/openai";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { QdrantVector } from "@mastra/qdrant";
import { createRuntimeModel } from "../models";
import {
  getDatabaseUrl,
  getEmbeddingApiKey,
  getEmbeddingBaseUrl,
  getEmbeddingModel,
  getQdrantApiKey,
  getQdrantUrl,
} from "../knowledge/config";

function requireEmbeddingApiKey(): string {
  const apiKey = getEmbeddingApiKey();

  if (!apiKey) {
    throw new Error("缺少 EMBEDDING_API_KEY，无法启用 Mastra memory");
  }

  return apiKey;
}

function createMemoryStorage() {
  return new PostgresStore({
    id: "memory-storage",
    connectionString: getDatabaseUrl(),
    schemaName: "atlas_kb_mastra",
  });
}

function createMemoryVector() {
  return new QdrantVector({
    id: "memory-qdrant",
    url: getQdrantUrl(),
    apiKey: getQdrantApiKey(),
    checkCompatibility: false,
  });
}

function createMemoryEmbedder() {
  const provider = createOpenAI({
    apiKey: requireEmbeddingApiKey(),
    baseURL: getEmbeddingBaseUrl(),
    name: "memory-embedding",
  });

  return provider.embedding(getEmbeddingModel());
}

export function buildKnowledgeMemoryResourceId(
  userId: string,
  collectionId: string,
): string {
  // 这是一个稳定的资源标识，范围是一个用户下的一个资料库。
  // 真正的对话记忆仍然使用 sessionId 作为 threadId，这个值只是为了满足
  // 当前 Mastra 记忆运行时的资源标识要求，并不表示跨会话共享观察记忆。
  return `${userId}:${collectionId}`;
}

export const knowledgeMemory = new Memory({
  storage: createMemoryStorage(),
  vector: createMemoryVector(),
  embedder: createMemoryEmbedder(),
  options: {
    lastMessages: 12,
    semanticRecall: false,
    generateTitle: false,
    observationalMemory: {
      // 本项目使用线程级别的观察记忆，真正的 threadId 会在对话执行时
      // 由 chat session id 传入。
      enabled: true,
      scope: "thread",
      model: createRuntimeModel(),
    },
  },
});

export const memory = {
  knowledgeMemory,
};
