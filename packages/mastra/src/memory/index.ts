import { createOpenAI } from "@ai-sdk/openai";
import type { MastraDBMessage } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { MemoryPG, PostgresStore } from "@mastra/pg";
import { QdrantVector } from "@mastra/qdrant";
import { createRuntimeModel } from "../models/runtime-model";
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

class KnowledgeMemoryStore extends MemoryPG {
  override async saveMessages(
    args: Parameters<MemoryPG["saveMessages"]>[0],
  ): ReturnType<MemoryPG["saveMessages"]> {
    const messages = sanitizeKnowledgeMemoryMessages(args.messages);

    if (messages.length === 0) {
      return {
        messages: [],
      };
    }

    return super.saveMessages({
      messages,
    });
  }
}

function createMemoryStorage() {
  const config = {
    id: "memory-storage",
    connectionString: getDatabaseUrl(),
    schemaName: "atlas_kb_mastra",
  } satisfies ConstructorParameters<typeof PostgresStore>[0];
  const store = new PostgresStore(config);

  store.stores.memory = new KnowledgeMemoryStore({
    client: store.db,
    schemaName: config.schemaName,
  });

  return store;
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

export const KNOWLEDGE_MEMORY_MESSAGE_MAX_CHARS = 8_000;
export const KNOWLEDGE_MEMORY_TRUNCATION_NOTICE =
  "\n[内容过长，已为上下文裁剪]";

type KnowledgeMemoryPart = MastraDBMessage["content"]["parts"][number];

function truncateKnowledgeMemoryText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  if (limit <= KNOWLEDGE_MEMORY_TRUNCATION_NOTICE.length) {
    return KNOWLEDGE_MEMORY_TRUNCATION_NOTICE.slice(0, limit);
  }

  return `${text.slice(0, limit - KNOWLEDGE_MEMORY_TRUNCATION_NOTICE.length)}${KNOWLEDGE_MEMORY_TRUNCATION_NOTICE}`;
}

function sanitizeKnowledgeMemoryPart(
  part: KnowledgeMemoryPart,
  remainingChars: number,
): KnowledgeMemoryPart | null {
  if (part.type !== "text" || remainingChars <= 0 || !part.text.length) {
    return null;
  }

  const { providerMetadata: _providerMetadata, ...restPart } = part;

  return {
    ...restPart,
    text: truncateKnowledgeMemoryText(part.text, remainingChars),
  };
}

export function sanitizeKnowledgeMemoryMessage(
  message: MastraDBMessage,
): MastraDBMessage | null {
  let remainingChars = KNOWLEDGE_MEMORY_MESSAGE_MAX_CHARS;
  const parts: KnowledgeMemoryPart[] = [];

  for (const part of message.content.parts) {
    const sanitizedPart = sanitizeKnowledgeMemoryPart(part, remainingChars);

    if (!sanitizedPart) {
      continue;
    }

    parts.push(sanitizedPart);
    remainingChars -= sanitizedPart.text.length;

    if (remainingChars <= 0) {
      break;
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return {
    ...message,
    content: {
      format: 2,
      parts,
    },
  };
}

export function sanitizeKnowledgeMemoryMessages(
  messages: readonly MastraDBMessage[],
): MastraDBMessage[] {
  return messages.flatMap((message) => {
    const sanitizedMessage = sanitizeKnowledgeMemoryMessage(message);
    return sanitizedMessage ? [sanitizedMessage] : [];
  });
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
      observation: {
        messageTokens: 10_000,
        bufferTokens: 2_000,
        bufferActivation: 0.8,
        blockAfter: 1.15,
      },
      reflection: {
        observationTokens: 24_000,
        bufferActivation: 0.5,
        blockAfter: 1.2,
      },
    },
  },
});

export const memory = {
  knowledgeMemory,
};
