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
      enabled: true,
      scope: "thread",
      model: createRuntimeModel(),
    },
  },
});

export const memory = {
  knowledgeMemory,
};
