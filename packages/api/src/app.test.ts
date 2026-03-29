import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createUser,
  getDefaultPassword,
  getDefaultUsername,
  resetKnowledgeRepository,
  resetKnowledgeVectorState,
  waitForPendingKnowledgeImports,
} from "@atlas-kb/mastra/knowledge";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";

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

function createSseResponse(chunks: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
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

function mockModelProviders() {
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

    if (body.stream === true) {
      return createSseResponse([
        {
          id: "chatcmpl-stream-1",
          object: "chat.completion.chunk",
          created: 1,
          model: "gpt-5.4",
          choices: [
            {
              index: 0,
              delta: {
                content: "这是基于当前证据生成的流式回答。",
              },
              finish_reason: null,
            },
          ],
        },
      ]);
    }

    return jsonResponse({
      choices: [
        {
          message: {
            content: "这是基于当前证据生成的回答。",
          },
        },
      ],
    });
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as {
    data: T;
    success: boolean;
  };
  return payload.data;
}

async function login(
  app: ReturnType<typeof createApp>,
  params?: {
    password?: string;
    username?: string;
  },
) {
  const response = await app.handle(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: params?.username ?? getDefaultUsername(),
        password: params?.password ?? getDefaultPassword(),
      }),
    }),
  );

  const data = await readJson<{
    expiresAt: string;
    token: string;
    user: {
      id: string;
      username: string;
    };
  }>(response);

  return {
    response,
    ...data,
  };
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

describe("@atlas-kb/api authenticated workspace", () => {
  let knowledgeDataDir = "";

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-api-test-"));
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    process.env.OPENAI_API_KEY = "test-key";
    resetKnowledgeRepository();
    resetKnowledgeVectorState();
    mockModelProviders();
  });

  afterEach(async () => {
    await waitForPendingKnowledgeImports();
    resetKnowledgeRepository();
    resetKnowledgeVectorState();
    globalThis.fetch = originalFetch;

    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    if (originalDataDir === undefined) {
      delete process.env.ATLAS_KB_DATA_DIR;
    } else {
      process.env.ATLAS_KB_DATA_DIR = originalDataDir;
    }

    await rm(knowledgeDataDir, { force: true, recursive: true });
  });

  it("logs in with username/password and protects workspace routes", async () => {
    const app = createApp();
    const loginResult = await login(app);

    expect(loginResult.response.status).toBe(200);
    expect(loginResult.user.username).toBe(getDefaultUsername());

    const meResponse = await app.handle(
      new Request("http://localhost/api/auth/me", {
        headers: authHeaders(loginResult.token),
      }),
    );
    const meData = await readJson<{
      expiresAt: string;
      user: {
        id: string;
        username: string;
      };
    }>(meResponse);

    expect(meResponse.status).toBe(200);
    expect(meData.user.id).toBe(loginResult.user.id);
    expect(meData.user.username).toBe(getDefaultUsername());

    const unauthorizedResponse = await app.handle(
      new Request("http://localhost/api/kb/collections"),
    );

    expect(unauthorizedResponse.status).toBe(401);
  });

  it("completes source edit, search, chat, and feedback in one authenticated flow", async () => {
    const app = createApp();
    const session = await login(app);

    const createCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "产品资料",
          description: "用于验证资料编辑和聊天闭环",
        }),
      }),
    );
    const collectionData = await readJson<{
      collection: {
        id: string;
      };
    }>(createCollectionResponse);

    const importResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/collections/${collectionData.collection.id}/imports/text`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "最初资料",
            content: "旧关键词：系统只会记住旧内容。",
            summary: "初始摘要",
            tags: ["旧版"],
          }),
        },
      ),
    );
    const importData = await readJson<{
      source: {
        id: string;
      };
    }>(importResponse);

    const updateResponse = await app.handle(
      new Request(`http://localhost/api/kb/sources/${importData.source.id}`, {
        method: "PATCH",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "更新后资料",
          summary: "新版摘要",
          tags: ["新版"],
          content: "新关键词：系统现在会优先命中新内容。",
        }),
      }),
    );

    expect(updateResponse.status).toBe(200);

    const searchResponse = await app.handle(
      new Request("http://localhost/api/kb/search", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "新关键词",
          collectionId: collectionData.collection.id,
        }),
      }),
    );
    const searchData = await readJson<{
      hits: Array<{
        sourceId: string;
        title: string;
      }>;
      total: number;
    }>(searchResponse);

    expect(searchResponse.status).toBe(200);
    expect(searchData.total).toBe(1);
    expect(searchData.hits[0]?.sourceId).toBe(importData.source.id);
    expect(searchData.hits[0]?.title).toBe("更新后资料");

    const createSessionResponse = await app.handle(
      new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId: collectionData.collection.id,
        }),
      }),
    );
    const sessionData = await readJson<{
      session: {
        id: string;
      };
    }>(createSessionResponse);

    const replyResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions/${sessionData.session.id}/reply`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "资料里最新的关键词是什么？",
            collectionId: collectionData.collection.id,
            limit: 5,
          }),
        },
      ),
    );
    const replyData = await readJson<{
      assistantMessage: {
        citations: unknown[];
        id: string;
      };
      retrieval: {
        total: number;
      };
      userMessage: {
        content: string;
      };
    }>(replyResponse);

    expect(replyResponse.status).toBe(200);
    expect(replyData.userMessage.content).toContain("最新的关键词");
    expect(replyData.assistantMessage.citations.length).toBeGreaterThan(0);
    expect(replyData.retrieval.total).toBeGreaterThan(0);

    const feedbackResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/messages/${replyData.assistantMessage.id}/feedback`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rating: "up",
          }),
        },
      ),
    );
    const feedbackData = await readJson<{
      rating: string;
    }>(feedbackResponse);

    expect(feedbackResponse.status).toBe(200);
    expect(feedbackData.rating).toBe("up");
  });

  it("imports a file and downloads the original uploaded content", async () => {
    const app = createApp();
    const session = await login(app);

    const createCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "文件资料",
          description: "用于验证文件导入和下载",
        }),
      }),
    );
    const collectionData = await readJson<{
      collection: {
        id: string;
      };
    }>(createCollectionResponse);

    const form = new FormData();
    form.append(
      "file",
      new File(["这是原始文件正文。"], "用户手册.txt", {
        type: "text/plain",
      }),
    );
    form.append("summary", "文件摘要");

    const importResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/collections/${collectionData.collection.id}/imports/file`,
        {
          method: "POST",
          headers: authHeaders(session.token),
          body: form,
        },
      ),
    );
    const importData = await readJson<{
      source: {
        id: string;
        status: string;
      };
    }>(importResponse);

    expect(importResponse.status).toBe(200);
    expect(importData.source.status).toBe("processing");

    await waitForPendingKnowledgeImports();

    const downloadResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/sources/${importData.source.id}/download`,
        {
          headers: authHeaders(session.token),
        },
      ),
    );
    const downloadText = await downloadResponse.text();

    expect(downloadResponse.status).toBe(200);
    expect(downloadText).toContain("这是原始文件正文。");
    expect(downloadResponse.headers.get("Content-Disposition")).toContain(
      "filename=",
    );
  });

  it("enforces user isolation across source access and streaming chat", async () => {
    const app = createApp();
    await createUser({
      username: "beta-user",
      password: "beta-pass",
    });

    const alpha = await login(app);
    const beta = await login(app, {
      username: "beta-user",
      password: "beta-pass",
    });

    const createCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(alpha.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Alpha 私有资料",
          description: "仅 alpha 可见",
        }),
      }),
    );
    const collectionData = await readJson<{
      collection: {
        id: string;
      };
    }>(createCollectionResponse);

    const importResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/collections/${collectionData.collection.id}/imports/text`,
        {
          method: "POST",
          headers: {
            ...authHeaders(alpha.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "Alpha 资料",
            content: "隔离关键词：只有 alpha 能看到。",
          }),
        },
      ),
    );
    const importData = await readJson<{
      source: {
        id: string;
      };
    }>(importResponse);

    const betaSearchResponse = await app.handle(
      new Request("http://localhost/api/kb/search", {
        method: "POST",
        headers: {
          ...authHeaders(beta.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "隔离关键词",
        }),
      }),
    );
    const betaSearchData = await readJson<{
      total: number;
    }>(betaSearchResponse);

    expect(betaSearchResponse.status).toBe(200);
    expect(betaSearchData.total).toBe(0);

    const betaSourceResponse = await app.handle(
      new Request(`http://localhost/api/kb/sources/${importData.source.id}`, {
        headers: authHeaders(beta.token),
      }),
    );

    expect(betaSourceResponse.status).toBe(404);

    const createSessionResponse = await app.handle(
      new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: {
          ...authHeaders(alpha.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId: collectionData.collection.id,
        }),
      }),
    );
    const sessionData = await readJson<{
      session: {
        id: string;
      };
    }>(createSessionResponse);

    const streamResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions/${sessionData.session.id}/reply/stream`,
        {
          method: "POST",
          headers: {
            ...authHeaders(alpha.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "基于私有资料给我一个回答。",
            collectionId: collectionData.collection.id,
            limit: 5,
          }),
        },
      ),
    );
    const streamText = await streamResponse.text();

    expect(streamResponse.status).toBe(200);
    expect(streamText.length).toBeGreaterThan(0);

    const messagesResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions/${sessionData.session.id}/messages`,
        {
          headers: authHeaders(alpha.token),
        },
      ),
    );
    const messagesData = await readJson<{
      messages: Array<{
        role: string;
      }>;
    }>(messagesResponse);

    expect(messagesResponse.status).toBe(200);
    expect(
      messagesData.messages.some((item) => item.role === "assistant"),
    ).toBe(true);
  });

  it("returns sanitized chat errors without leaking provider configuration details", async () => {
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.includes("/embeddings")) {
        const inputValues = Array.isArray(body.input) ? body.input : [];
        return jsonResponse({
          data: inputValues.map((_value, index) => ({
            embedding: [0.11, 0.22, 0.33],
            index,
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

      throw new Error(
        "知识库回答生成 失败。当前 OPENAI_BASE_URL=https://api.duckcoding.ai/v1。当前 OPENAI_MODEL=gpt-5.4。原始错误: The operation timed out.",
      );
    };

    const app = createApp();
    const session = await login(app);

    const createCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: "用于验证聊天错误脱敏",
          name: "错误脱敏",
        }),
      }),
    );
    const collectionData = await readJson<{
      collection: {
        id: string;
      };
    }>(createCollectionResponse);

    const importResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/collections/${collectionData.collection.id}/imports/text`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: "这是一条测试资料。",
            title: "测试资料",
          }),
        },
      ),
    );

    expect(importResponse.status).toBe(200);

    const createSessionResponse = await app.handle(
      new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId: collectionData.collection.id,
        }),
      }),
    );
    const sessionData = await readJson<{
      session: {
        id: string;
      };
    }>(createSessionResponse);

    const replyResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions/${sessionData.session.id}/reply`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            collectionId: collectionData.collection.id,
            query: "这条资料说了什么？",
          }),
        },
      ),
    );
    const payload = (await replyResponse.json()) as {
      error: {
        message: string;
      };
      success: boolean;
    };

    expect(replyResponse.status).toBe(503);
    expect(payload.success).toBe(false);
    expect(payload.error.message).toBe("知识库回答暂时不可用，请稍后重试。");
    expect(payload.error.message.includes("OPENAI_BASE_URL")).toBe(false);
    expect(payload.error.message.includes("OPENAI_MODEL")).toBe(false);
    expect(payload.error.message.includes("原始错误")).toBe(false);
  });
});
