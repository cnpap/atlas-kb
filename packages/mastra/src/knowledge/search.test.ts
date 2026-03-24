import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  answerKnowledgeQuestion,
  createChatReply,
  createChatSession,
  createKnowledgeCollection,
  importKnowledgeText,
  resetKnowledgeRepository,
  resetKnowledgeVectorState,
  saveMessageFeedback,
  searchKnowledge,
} from "./index";

describe("@atlas-kb/mastra knowledge flow", () => {
  let knowledgeDataDir = "";
  const originalDataDir = process.env.ATLAS_KB_DATA_DIR;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  const originalDashScopeApiKey = process.env.DASHSCOPE_API_KEY;
  const originalDashScopeBaseUrl = process.env.DASHSCOPE_BASE_URL;
  const originalDashScopeEmbeddingModel = process.env.DASHSCOPE_EMBEDDING_MODEL;

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-mastra-test-"));
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.DASHSCOPE_BASE_URL;
    delete process.env.DASHSCOPE_EMBEDDING_MODEL;
    resetKnowledgeRepository();
    resetKnowledgeVectorState();
  });

  afterEach(async () => {
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

    if (knowledgeDataDir) {
      await rm(knowledgeDataDir, { force: true, recursive: true });
    }
  });

  it("returns lexical hits from imported personal notes", async () => {
    const collection = await createKnowledgeCollection({
      id: "learning-notes",
      name: "学习笔记",
      description: "方法论与复盘",
    });

    const imported = await importKnowledgeText({
      collectionId: collection.id,
      input: {
        title: "复盘方法",
        content: "好的复盘从目标开始，再记录事实、偏差、原因和下一步行动。",
      },
    });
    const result = await searchKnowledge({
      query: "复盘应该怎么开始",
      collectionId: collection.id,
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.engine).toBe("lexical");
    expect(result.hits[0]?.sourceId).toBe(imported.source.id);
    expect(result.hits[0]?.recallPaths).toContain("关键词召回");
    expect(result.usedHitIds).toHaveLength(0);
  });

  it("imports text into a custom collection and retrieves it", async () => {
    const collection = await createKnowledgeCollection({
      id: "writing-system",
      name: "写作系统",
      description: "写作方法论与范例",
    });

    const imported = await importKnowledgeText({
      collectionId: collection.id,
      input: {
        title: "研究整理原则",
        content:
          "第一步先按主题拆解材料，第二步提取可执行动作，第三步把洞察映射到长期项目。",
        tags: ["writing", "research"],
      },
    });

    const result = await searchKnowledge({
      query: "如何把材料映射到长期项目",
      collectionId: collection.id,
      limit: 5,
    });

    expect(imported.source.status).toBe("ready");
    expect(result.total).toBeGreaterThan(0);
    expect(result.hits[0]?.sourceId).toBe(imported.source.id);
    expect(result.hits[0]?.sourceType).toBe("text");
    expect(result.queryVariants.length).toBeGreaterThan(0);
  });

  it("returns a mock grounded answer without provider credentials", async () => {
    const collection = await createKnowledgeCollection({
      id: "answer-evidence",
      name: "回答证据",
      description: "回答规则",
    });

    await importKnowledgeText({
      collectionId: collection.id,
      input: {
        title: "引用原则",
        content: "回答时要明确指出证据来源，并且在证据不足时直接说明不确定。",
      },
    });

    const result = await answerKnowledgeQuestion({
      question: "回答时如何处理证据不足？",
      collectionId: collection.id,
    });

    expect(result.mode).toBe("mock");
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.answer).toContain("我找到了");
  });

  it("creates a chat reply and stores assistant feedback", async () => {
    const collection = await createKnowledgeCollection({
      id: "product-research",
      name: "产品研究",
      description: "用户研究与产品洞察",
    });

    await importKnowledgeText({
      collectionId: collection.id,
      input: {
        title: "用户访谈总结",
        content:
          "用户最大的问题不是缺资料，而是不知道哪些证据值得转化为行动项。好的知识系统应该把证据与行动保持绑定。",
        tags: ["research"],
      },
    });

    const session = await createChatSession({
      title: "研究洞察",
      collectionId: collection.id,
    });
    const reply = await createChatReply({
      sessionId: session.id,
      input: {
        query: "根据现有资料，总结知识系统最该解决的问题。",
        collectionId: collection.id,
      },
    });
    const feedback = await saveMessageFeedback({
      messageId: reply.assistantMessage.id,
      input: {
        rating: "up",
      },
    });

    expect(reply.assistantMessage.citations.length).toBeGreaterThan(0);
    expect(reply.search.total).toBeGreaterThan(0);
    expect(reply.retrieval.usedHitIds.length).toBeGreaterThan(0);
    expect(
      reply.assistantMessage.retrieval?.hits.some((item) => item.usedInAnswer),
    ).toBeTrue();
    expect(feedback.rating).toBe("up");
  });
});
