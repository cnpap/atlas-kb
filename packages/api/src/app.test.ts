import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  resetKnowledgeRepository,
  resetKnowledgeVectorState,
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
    process.env.OPENAI_API_KEY = originalApiKey;

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

  it("imports a file and downloads the original source", async () => {
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
        "retrospective.md",
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
      };
    };

    expect(importResponse.status).toBe(200);

    const downloadResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/sources/${importData.source.id}/download`,
      ),
    );

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("Content-Type")).toBe("text/markdown");
    expect(await downloadResponse.text()).toContain("下一步行动");
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
