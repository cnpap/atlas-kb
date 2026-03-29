import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  answerKnowledgeQuestion,
  createChatReply,
  createChatSession,
  createKnowledgeCollection,
  createUser,
  ensureDefaultUser,
  importKnowledgeText,
  resetKnowledgeRepository,
  resetKnowledgeVectorState,
  saveMessageFeedback,
  searchKnowledge,
  waitForPendingKnowledgeImports,
} from "./index";
import { streamModelAnswerFromCitations } from "./search";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalDataDir = process.env.ATLAS_KB_DATA_DIR;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function readMessageText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((part) =>
      part && typeof part === "object" && "text" in part
        ? String((part as { text?: unknown }).text ?? "")
        : "",
    )
    .join("\n");
}

function mockOpenAIChatProvider() {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const systemPrompt = readMessageText(messages[0]?.content);
    const lastMessage = messages[messages.length - 1];

    if (url.includes("/embeddings")) {
      const inputValues = Array.isArray(body.input) ? body.input : [];

      return jsonResponse({
        data: inputValues.map((_value, index) => ({
          index,
          embedding: [0.11, 0.22, 0.33],
        })),
      });
    }

    if (url.includes(":6333/collections/")) {
      if (url.includes("/points/query")) {
        return jsonResponse({
          result: {
            points: [],
          },
        });
      }

      return jsonResponse({
        result: {
          status: "ok",
        },
      });
    }

    if (systemPrompt.includes("Rewrite the search query")) {
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                queries: [readMessageText(lastMessage?.content)],
              }),
            },
          },
        ],
      });
    }

    return jsonResponse({
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "最关键的新结论是系统只会返回当前用户自己的证据。",
          },
        },
      ],
    });
  };
}

function createDelayedSseResponse(
  chunks: Array<{
    body: unknown;
    delayMs: number;
  }>,
): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          await Bun.sleep(chunk.delayMs);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk.body)}\n\n`),
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
      },
    },
  );
}

describe("@atlas-kb/mastra knowledge flow", () => {
  let knowledgeDataDir = "";

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-mastra-test-"));
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = originalFetch;
    resetKnowledgeRepository();
    resetKnowledgeVectorState();
    mockOpenAIChatProvider();
  });

  afterEach(async () => {
    await waitForPendingKnowledgeImports();
    resetKnowledgeRepository();
    resetKnowledgeVectorState();

    if (originalDataDir === undefined) {
      delete process.env.ATLAS_KB_DATA_DIR;
    } else {
      process.env.ATLAS_KB_DATA_DIR = originalDataDir;
    }

    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    globalThis.fetch = originalFetch;
    await rm(knowledgeDataDir, { force: true, recursive: true });
  });

  it("returns lexical hits only for the current user", async () => {
    const alpha = await ensureDefaultUser();
    const beta = await createUser({
      username: "beta-search",
      password: "beta-pass",
    });

    const alphaCollection = await createKnowledgeCollection({
      userId: alpha.id,
      input: {
        id: "alpha-search",
        name: "Alpha Search",
        description: "alpha private notes",
      },
    });
    await importKnowledgeText({
      userId: alpha.id,
      collectionId: alphaCollection.id,
      input: {
        title: "Alpha Doc",
        content: "隔离搜索关键词：只有 alpha 可以检索到。",
      },
    });

    const alphaResult = await searchKnowledge(
      {
        query: "隔离搜索关键词",
      },
      {
        userId: alpha.id,
      },
    );
    const betaResult = await searchKnowledge(
      {
        query: "隔离搜索关键词",
      },
      {
        userId: beta.id,
      },
    );

    expect(alphaResult.total).toBe(1);
    expect(alphaResult.hits[0]?.title).toBe("Alpha Doc");
    expect(betaResult.total).toBe(0);
  });

  it("answers grounded questions from the current user's collection", async () => {
    const user = await ensureDefaultUser();
    const collection = await createKnowledgeCollection({
      userId: user.id,
      input: {
        id: "grounded-answer",
        name: "Grounded Answer",
        description: "用于验证 grounded answer",
      },
    });

    await importKnowledgeText({
      userId: user.id,
      collectionId: collection.id,
      input: {
        title: "Grounded Doc",
        content: "核心结论：检索和回答必须绑定到同一份真实证据。",
      },
    });

    const result = await answerKnowledgeQuestion(
      {
        question: "这份资料里的核心结论是什么？",
        collectionId: collection.id,
      },
      {
        userId: user.id,
      },
    );

    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.answer).toContain("当前用户自己的证据");
  });

  it("creates chat replies and stores assistant feedback within one user scope", async () => {
    const user = await ensureDefaultUser();
    const collection = await createKnowledgeCollection({
      userId: user.id,
      input: {
        id: "chat-scope",
        name: "Chat Scope",
        description: "用于验证聊天闭环",
      },
    });

    await importKnowledgeText({
      userId: user.id,
      collectionId: collection.id,
      input: {
        title: "Chat Doc",
        content: "聊天结论：回答必须引用当前 collection 里的资料。",
      },
    });

    const session = await createChatSession({
      userId: user.id,
      collectionId: collection.id,
    });
    const reply = await createChatReply({
      userId: user.id,
      sessionId: session.id,
      input: {
        query: "基于资料告诉我聊天结论",
        collectionId: collection.id,
      },
    });

    expect(reply.assistantMessage.citations.length).toBeGreaterThan(0);
    expect(reply.retrieval.total).toBeGreaterThan(0);

    const feedback = await saveMessageFeedback({
      userId: user.id,
      messageId: reply.assistantMessage.id,
      input: {
        rating: "up",
      },
    });

    expect(feedback.rating).toBe("up");
  });

  it("allows a long-running stream as long as chunks keep arriving before the idle timeout", async () => {
    const result = await streamModelAnswerFromCitations({
      citations: [
        {
          chunkId: "chunk-1",
          collectionId: "collection-1",
          sourceId: "source-1",
          snippet: "这是第一段证据。",
          title: "证据一",
        },
      ],
      fetchImpl: async () =>
        createDelayedSseResponse([
          {
            body: {
              choices: [
                {
                  delta: {
                    content: "第一段",
                  },
                  finish_reason: null,
                  index: 0,
                },
              ],
              created: 1,
              id: "chunk-1",
              model: "gpt-5.4",
              object: "chat.completion.chunk",
            },
            delayMs: 5,
          },
          {
            body: {
              choices: [
                {
                  delta: {
                    content: "第二段",
                  },
                  finish_reason: "stop",
                  index: 0,
                },
              ],
              created: 2,
              id: "chunk-2",
              model: "gpt-5.4",
              object: "chat.completion.chunk",
            },
            delayMs: 35,
          },
        ]),
      question: "总结一下证据",
      responseTimeoutMs: 20,
      streamIdleTimeoutMs: 60,
    });

    expect(result.answer).toBe("第一段第二段");
  });

  it("fails with a generic timeout message when a stream goes idle", async () => {
    await expect(
      streamModelAnswerFromCitations({
        citations: [
          {
            chunkId: "chunk-1",
            collectionId: "collection-1",
            sourceId: "source-1",
            snippet: "这是第一段证据。",
            title: "证据一",
          },
        ],
        fetchImpl: async () =>
          createDelayedSseResponse([
            {
              body: {
                choices: [
                  {
                    delta: {
                      content: "第一段",
                    },
                    finish_reason: null,
                    index: 0,
                  },
                ],
                created: 1,
                id: "chunk-1",
                model: "gpt-5.4",
                object: "chat.completion.chunk",
              },
              delayMs: 5,
            },
            {
              body: {
                choices: [
                  {
                    delta: {
                      content: "第二段",
                    },
                    finish_reason: "stop",
                    index: 0,
                  },
                ],
                created: 2,
                id: "chunk-2",
                model: "gpt-5.4",
                object: "chat.completion.chunk",
              },
              delayMs: 50,
            },
          ]),
        question: "总结一下证据",
        responseTimeoutMs: 20,
        streamIdleTimeoutMs: 20,
      }),
    ).rejects.toThrow("知识库回答超时，请稍后重试。");
  });
});
