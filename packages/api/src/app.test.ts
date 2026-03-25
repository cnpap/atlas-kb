import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
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
const originalBaseUrl = process.env.OPENAI_BASE_URL;
const originalDashScopeApiKey = process.env.DASHSCOPE_API_KEY;
const originalDashScopeBaseUrl = process.env.DASHSCOPE_BASE_URL;
const originalDashScopeEmbeddingModel = process.env.DASHSCOPE_EMBEDDING_MODEL;
const originalDataDir = process.env.ATLAS_KB_DATA_DIR;

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createSseResponse(
  chunks: unknown[],
  options: {
    hangAfterChunks?: boolean;
  } = {},
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }

      if (options.hangAfterChunks) {
        return;
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

function mockOpenAIChatProvider(
  options: { hangOnAssistantResponse?: boolean } = {},
) {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const isStreaming = body.stream === true;
    const systemPrompt = readMessageText(messages[0]?.content);
    const lastMessage = messages[messages.length - 1];
    const hasToolMessage = messages.some(
      (message) =>
        message &&
        typeof message === "object" &&
        ((message as { role?: string }).role === "tool" ||
          (message as { role?: string }).role === "function"),
    );

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

    if (isStreaming && !hasToolMessage) {
      const toolArguments = JSON.stringify({
        query: readMessageText(lastMessage?.content),
        limit: 6,
      });

      return createSseResponse([
        {
          id: "chatcmpl-tool-1",
          object: "chat.completion.chunk",
          created: 1,
          model: "gpt-5.4",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: "call_search_1",
                    type: "function",
                    function: {
                      name: "search_knowledge",
                      arguments: "",
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-tool-1",
          object: "chat.completion.chunk",
          created: 1,
          model: "gpt-5.4",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      arguments: toolArguments,
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-tool-1",
          object: "chat.completion.chunk",
          created: 1,
          model: "gpt-5.4",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "tool_calls",
            },
          ],
        },
      ]);
    }

    if (isStreaming && hasToolMessage) {
      return createSseResponse(
        [
          {
            id: "chatcmpl-answer-1",
            object: "chat.completion.chunk",
            created: 1,
            model: "gpt-5.4",
            choices: [
              {
                index: 0,
                delta: {
                  role: "assistant",
                  content:
                    "最关键的原则是把证据和行动绑定，不要只停留在信息收集阶段。",
                },
                finish_reason: null,
              },
            ],
          },
          {
            id: "chatcmpl-answer-1",
            object: "chat.completion.chunk",
            created: 1,
            model: "gpt-5.4",
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: "stop",
              },
            ],
          },
        ],
        {
          hangAfterChunks: options.hangOnAssistantResponse,
        },
      );
    }

    if (!hasToolMessage) {
      return jsonResponse({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_search_1",
                  type: "function",
                  function: {
                    name: "search_knowledge",
                    arguments: JSON.stringify({
                      query: readMessageText(lastMessage?.content),
                      limit: 6,
                    }),
                  },
                },
              ],
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
            content:
              "最关键的原则是把证据和行动绑定，不要只停留在信息收集阶段。",
          },
        },
      ],
    });
  };
}

describe("@atlas-kb/api", () => {
  let knowledgeDataDir = "";

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-api-test-"));
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.DASHSCOPE_BASE_URL;
    delete process.env.DASHSCOPE_EMBEDDING_MODEL;
    globalThis.fetch = originalFetch;
    resetKnowledgeRepository();
    resetKnowledgeVectorState();
  });

  afterEach(async () => {
    await waitForPendingKnowledgeImports();

    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.OPENAI_BASE_URL;
    } else {
      process.env.OPENAI_BASE_URL = originalBaseUrl;
    }

    if (originalDashScopeApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = originalDashScopeApiKey;
    }

    if (originalDashScopeBaseUrl === undefined) {
      delete process.env.DASHSCOPE_BASE_URL;
    } else {
      process.env.DASHSCOPE_BASE_URL = originalDashScopeBaseUrl;
    }

    if (originalDashScopeEmbeddingModel === undefined) {
      delete process.env.DASHSCOPE_EMBEDDING_MODEL;
    } else {
      process.env.DASHSCOPE_EMBEDDING_MODEL = originalDashScopeEmbeddingModel;
    }

    globalThis.fetch = originalFetch;
    resetKnowledgeRepository();
    resetKnowledgeVectorState();

    if (originalDataDir === undefined) {
      delete process.env.ATLAS_KB_DATA_DIR;
    } else {
      process.env.ATLAS_KB_DATA_DIR = originalDataDir;
    }

    if (knowledgeDataDir) {
      await rm(knowledgeDataDir, { force: true, recursive: true });
    }
  });

  it("returns health status", async () => {
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/api/health"),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.success).toBeTrue();
  });

  it("creates a collection, imports text, and finds it through search", async () => {
    const app = createApp();
    const createResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "personal-research",
          name: "个人研究",
          description: "研究资料与访谈记录",
        }),
      }),
    );
    const createPayload = await readJson(createResponse);
    const createData = createPayload.data as {
      collection: {
        id: string;
      };
    };

    expect(createResponse.status).toBe(200);
    expect(createData.collection.id).toBe("personal-research");

    const importResponse = await app.handle(
      new Request(
        "http://localhost/api/kb/collections/personal-research/imports/text",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "访谈行动法",
            content:
              "先把访谈记录拆成主题，再提炼成行动项，最后映射到长期项目列表。",
            tags: ["research", "workflow"],
          }),
        },
      ),
    );
    const importPayload = await readJson(importResponse);
    const importData = importPayload.data as {
      source: {
        id: string;
        status: string;
      };
    };

    expect(importResponse.status).toBe(200);
    expect(importData.source.status).toBe("ready");

    const listResponse = await app.handle(
      new Request(
        "http://localhost/api/kb/collections/personal-research/sources",
      ),
    );
    const listPayload = await readJson(listResponse);
    const listData = listPayload.data as {
      sources: Array<{
        id: string;
      }>;
    };

    expect(listResponse.status).toBe(200);
    expect(
      listData.sources.some((item) => item.id === importData.source.id),
    ).toBeTrue();

    const searchResponse = await app.handle(
      new Request("http://localhost/api/kb/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "如何映射到长期项目",
          collectionId: "personal-research",
        }),
      }),
    );
    const searchPayload = await readJson(searchResponse);
    const searchData = searchPayload.data as {
      total: number;
      hits: Array<{
        sourceId: string;
      }>;
    };

    expect(searchResponse.status).toBe(200);
    expect(searchData.total).toBeGreaterThan(0);
    expect(searchData.hits[0]?.sourceId).toBe(importData.source.id);
  });

  it("imports a file with a unicode filename and downloads the original source", async () => {
    const app = createApp();

    await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "writing",
          name: "写作",
          description: "写作素材",
        }),
      }),
    );

    const form = new FormData();

    form.append(
      "file",
      new File(
        ["# 复盘模板\n\n每次复盘都要写清目标、事实、偏差、下一步行动。"],
        "引用回答规则.md",
        {
          type: "text/markdown",
        },
      ),
    );
    form.append("title", "复盘模板");

    const importResponse = await app.handle(
      new Request("http://localhost/api/kb/collections/writing/imports/file", {
        method: "POST",
        body: form,
      }),
    );
    const importPayload = await readJson(importResponse);
    const importData = importPayload.data as {
      source: {
        id: string;
        status: string;
      };
      job: {
        stage: string;
      };
    };

    expect(importResponse.status).toBe(200);
    expect(importData.source.status).toBe("processing");
    expect(importData.job.stage).toBe("queued");

    await waitForPendingKnowledgeImports();

    const downloadResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/sources/${importData.source.id}/download`,
      ),
    );

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("Content-Type")).toBe("text/markdown");
    expect(downloadResponse.headers.get("Content-Disposition")).toContain(
      "filename*=UTF-8''%E5%BC%95%E7%94%A8%E5%9B%9E%E7%AD%94%E8%A7%84%E5%88%99.md",
    );
    expect(await downloadResponse.text()).toContain("下一步行动");
  });

  it("batch imports files asynchronously and reports rejected files", async () => {
    const app = createApp();

    await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "ops",
          name: "运营资料",
          description: "运营文档",
        }),
      }),
    );

    const form = new FormData();

    form.append(
      "files",
      new File(
        ["# 周会纪要\n\n确定下周的投放节奏与复盘节点。"],
        "周会纪要.md",
        {
          type: "text/markdown",
        },
      ),
    );
    form.append(
      "files",
      new File(["binary"], "预算表.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    form.append("summary", "批量导入测试");
    form.append("tags", "ops, weekly");

    const importResponse = await app.handle(
      new Request("http://localhost/api/kb/collections/ops/imports/files", {
        method: "POST",
        body: form,
      }),
    );
    const importPayload = await readJson(importResponse);
    const importData = importPayload.data as {
      acceptedCount: number;
      rejectedCount: number;
      results: Array<{
        fileName: string;
        accepted: boolean;
        source?: {
          status: string;
        };
        errorMessage?: string;
      }>;
    };

    expect(importResponse.status).toBe(200);
    expect(importData.acceptedCount).toBe(1);
    expect(importData.rejectedCount).toBe(1);
    expect(importData.results[0]?.fileName).toBe("周会纪要.md");
    expect(importData.results[0]?.accepted).toBeTrue();
    expect(importData.results[0]?.source?.status).toBe("processing");
    expect(importData.results[1]?.fileName).toBe("预算表.xlsx");
    expect(importData.results[1]?.accepted).toBeFalse();
    expect(importData.results[1]?.errorMessage).toContain(
      "Unsupported file type",
    );

    const listResponse = await app.handle(
      new Request("http://localhost/api/kb/collections/ops/sources"),
    );
    const listPayload = await readJson(listResponse);
    const listData = listPayload.data as {
      sources: Array<{
        sourceFilename?: string;
      }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listData.sources).toHaveLength(1);
    expect(listData.sources[0]?.sourceFilename).toBe("周会纪要.md");
    expect(listData.sources[0]?.status).toBe("processing");

    await waitForPendingKnowledgeImports();

    const settledListResponse = await app.handle(
      new Request("http://localhost/api/kb/collections/ops/sources"),
    );
    const settledListPayload = await readJson(settledListResponse);
    const settledListData = settledListPayload.data as {
      sources: Array<{
        status: string;
      }>;
    };

    expect(settledListData.sources[0]?.status).toBe("ready");
  });

  it("does not expose url import on the public collection API", async () => {
    const app = createApp();

    await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "reading",
          name: "阅读",
          description: "阅读摘录",
        }),
      }),
    );

    const response = await app.handle(
      new Request("http://localhost/api/kb/collections/reading/imports/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://example.com",
        }),
      }),
    );

    expect(response.status).toBe(404);
  });

  it("creates a chat session, replies with citations, and stores feedback", async () => {
    const app = createApp();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://mock-openai.local/v1";
    mockOpenAIChatProvider();

    await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "product",
          name: "产品资料",
          description: "产品研究与方案",
        }),
      }),
    );

    await app.handle(
      new Request("http://localhost/api/kb/collections/product/imports/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "产品判断标准",
          content: "最关键的是把证据和行动绑定，不要只停留在信息收集阶段。",
        }),
      }),
    );

    const sessionResponse = await app.handle(
      new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId: "product",
          title: "产品策略讨论",
        }),
      }),
    );
    const sessionPayload = await readJson(sessionResponse);
    const sessionData = sessionPayload.data as {
      session: {
        id: string;
      };
    };

    const replyResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions/${sessionData.session.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "根据资料，总结产品判断最关键的原则。",
            collectionId: "product",
          }),
        },
      ),
    );
    const replyPayload = await readJson(replyResponse);
    const replyData = replyPayload.data as {
      assistantMessage: {
        id: string;
        citations: unknown[];
        retrieval?: {
          hits: Array<{
            usedInAnswer: boolean;
          }>;
        };
      };
      retrieval: {
        total: number;
        usedHitIds: string[];
      };
      search: {
        total: number;
      };
    };

    expect(replyResponse.status).toBe(200);
    expect(replyData.search.total).toBeGreaterThan(0);
    expect(replyData.retrieval.total).toBeGreaterThan(0);
    expect(replyData.retrieval.usedHitIds.length).toBeGreaterThan(0);
    expect(replyData.assistantMessage.citations.length).toBeGreaterThan(0);
    expect(
      replyData.assistantMessage.retrieval?.hits.some(
        (item) => item.usedInAnswer,
      ),
    ).toBeTrue();

    const feedbackResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/messages/${replyData.assistantMessage.id}/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rating: "up",
          }),
        },
      ),
    );
    const feedbackPayload = await readJson(feedbackResponse);
    const feedbackData = feedbackPayload.data as {
      rating: string;
    };

    expect(feedbackResponse.status).toBe(200);
    expect(feedbackData.rating).toBe("up");
  });

  it("streams chat reply events and persists the assistant trace", async () => {
    const app = createApp();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://mock-openai.local/v1";
    mockOpenAIChatProvider();

    await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "streaming-product",
          name: "流式产品资料",
          description: "流式聊天测试",
        }),
      }),
    );

    await app.handle(
      new Request(
        "http://localhost/api/kb/collections/streaming-product/imports/text",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "流式判断标准",
            content: "先完成检索，再把证据整理成行动建议。",
          }),
        },
      ),
    );

    const sessionResponse = await app.handle(
      new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId: "streaming-product",
          title: "流式策略讨论",
        }),
      }),
    );
    const sessionPayload = await readJson(sessionResponse);
    const sessionData = sessionPayload.data as {
      session: {
        id: string;
      };
    };

    const streamResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions/${sessionData.session.id}/reply/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "根据资料，给出这次回答的核心原则。",
            collectionId: "streaming-product",
          }),
        },
      ),
    );
    const streamBody = await streamResponse.text();

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("x-vercel-ai-ui-message-stream")).toBe(
      "v1",
    );
    expect(streamBody).toContain('"type":"reply-accepted"');
    expect(streamBody).toContain('"type":"trace"');
    expect(streamBody).toContain('"type":"reply-completed"');
    expect(streamBody).toContain("search_knowledge");
    expect(streamBody).toContain('"title":"正在组织回答"');
    expect(streamBody).toContain('"type":"data-replyAccepted"');
    expect(streamBody).toContain("data:");

    const messagesResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions/${sessionData.session.id}/messages`,
      ),
    );
    const messagesPayload = await readJson(messagesResponse);
    const messagesData = messagesPayload.data as {
      messages: Array<{
        role: string;
        trace?: Array<{
          id: string;
        }>;
      }>;
    };
    const assistantMessage = messagesData.messages.find(
      (item) => item.role === "assistant",
    );

    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.trace?.length ?? 0).toBeGreaterThan(0);
  });

  it("fails fast when answer generation stalls after retrieval", async () => {
    const app = createApp();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://mock-openai.local/v1";
    mockOpenAIChatProvider({
      hangOnAssistantResponse: true,
    });

    await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "timeout-product",
          name: "超时产品资料",
          description: "回答超时测试",
        }),
      }),
    );

    await app.handle(
      new Request(
        "http://localhost/api/kb/collections/timeout-product/imports/text",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "超时判断标准",
            content: "先检索，再组织回答。",
          }),
        },
      ),
    );

    const sessionResponse = await app.handle(
      new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId: "timeout-product",
          title: "超时策略讨论",
        }),
      }),
    );
    const sessionPayload = await readJson(sessionResponse);
    const sessionData = sessionPayload.data as {
      session: {
        id: string;
      };
    };

    const startedAt = Date.now();
    const streamResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions/${sessionData.session.id}/reply/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "根据资料，输出可执行原则。",
            collectionId: "timeout-product",
          }),
        },
      ),
    );
    const streamBody = await streamResponse.text();
    const elapsedMs = Date.now() - startedAt;

    expect(streamResponse.status).toBe(200);
    expect(streamBody).toContain('"type":"reply-error"');
    expect(streamBody).toContain("智能体在组织回答时超时");
    expect(elapsedMs).toBeLessThan(25_000);

    const messagesResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions/${sessionData.session.id}/messages`,
      ),
    );
    const messagesPayload = await readJson(messagesResponse);
    const messagesData = messagesPayload.data as {
      messages: Array<{
        role: string;
      }>;
    };

    expect(
      messagesData.messages.some((item) => item.role === "assistant"),
    ).toBe(false);
  });

  it("returns a clear model provider error when chat credentials are rejected", async () => {
    const app = createApp();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://mock-openai.local/v1";
    globalThis.fetch = async () =>
      jsonResponse(
        {
          error: {
            message: "forbidden",
          },
        },
        403,
      );

    await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "provider-errors",
          name: "模型错误",
          description: "模型配置报错",
        }),
      }),
    );

    await app.handle(
      new Request(
        "http://localhost/api/kb/collections/provider-errors/imports/text",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "错误说明",
            content: "这是一条用于测试模型配置错误的资料。",
          }),
        },
      ),
    );

    const sessionResponse = await app.handle(
      new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId: "provider-errors",
        }),
      }),
    );
    const sessionPayload = await readJson(sessionResponse);
    const sessionData = sessionPayload.data as {
      session: {
        id: string;
      };
    };

    const replyResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions/${sessionData.session.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "测试 provider 403 错误",
            collectionId: "provider-errors",
          }),
        },
      ),
    );
    const replyPayload = await readJson(replyResponse);

    expect(replyResponse.status).toBe(500);
    expect(replyPayload.success).toBeFalse();
    expect(replyPayload.error).toMatchObject({
      code: "MODEL_PROVIDER_PERMISSION_ERROR",
    });
    expect(String(replyPayload.error?.message ?? "")).toContain("OPENAI_MODEL");
  });

  it("keeps legacy ask compatibility for existing callers", async () => {
    const app = createApp();

    await app.handle(
      new Request("http://localhost/api/kb/spaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "legacy-space",
          name: "兼容空间",
          description: "旧接口兼容测试",
        }),
      }),
    );

    const form = new FormData();

    form.append(
      "file",
      new File(
        ["# 兼容文档\n\n旧接口提问时，也应该返回引用和答案。"],
        "legacy.md",
        {
          type: "text/markdown",
        },
      ),
    );
    form.append("title", "兼容文档");

    await app.handle(
      new Request(
        "http://localhost/api/kb/spaces/legacy-space/documents/upload",
        {
          method: "POST",
          body: form,
        },
      ),
    );

    await waitForPendingKnowledgeImports();

    const response = await app.handle(
      new Request("http://localhost/api/kb/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: "旧接口提问时能否返回引用？",
          spaceId: "legacy-space",
        }),
      }),
    );
    const payload = await readJson(response);
    const data = payload.data as {
      citations: unknown[];
      mode: string;
    };

    expect(response.status).toBe(200);
    expect(data.mode).toBe("mock");
    expect(data.citations.length).toBeGreaterThan(0);
  });
});
