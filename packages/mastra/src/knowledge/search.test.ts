import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createKnowledgeSpace,
  answerKnowledgeQuestion,
  resetKnowledgeRepository,
  resetKnowledgeVectorState,
  searchKnowledge,
  uploadKnowledgeDocument,
} from "./index";

describe("@atlas-kb/mastra knowledge search", () => {
  let knowledgeDataDir = "";
  const originalDataDir = process.env.ATLAS_KB_DATA_DIR;
  const originalDashScopeApiKey = process.env.DASHSCOPE_API_KEY;
  const originalDashScopeBaseUrl = process.env.DASHSCOPE_BASE_URL;
  const originalDashScopeEmbeddingModel = process.env.DASHSCOPE_EMBEDDING_MODEL;

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-mastra-test-"));
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    delete process.env.OPENAI_API_KEY;
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

  it("returns hits for onboarding queries", async () => {
    const result = await searchKnowledge({
      query: "customer onboarding",
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.hits[0]?.title).toContain("Onboarding");
    expect(result.engine).toBe("lexical");
  });

  it("returns a mock answer without a model key", async () => {
    const result = await answerKnowledgeQuestion({
      question: "How should onboarding start?",
    });

    expect(result.mode).toBe("mock");
    expect(result.engine).toBe("lexical");
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.answer).toContain("Atlas KB");
  });

  it("returns a model answer when the OpenAI call succeeds", async () => {
    const result = await answerKnowledgeQuestion(
      {
        question: "How should answers present evidence?",
      },
      {
        apiKey: "test-key",
        baseUrl: "https://gateway.example/v1",
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content:
                      "Use short quotations, cite the document title, and stay inside the retrieved context.",
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
      },
    );

    expect(result.mode).toBe("model");
    expect(result.answer).toContain("cite the document title");
  });

  it("returns uploaded source metadata for Chinese department queries", async () => {
    await createKnowledgeSpace({
      id: "departments",
      name: "部门职责库",
      description: "用于部门归口判断的样本知识库",
    });

    await uploadKnowledgeDocument({
      file: new File(
        [
          "# 人力资源部职责\n\n人力资源部负责员工入职手续办理、社保开户、劳动合同管理、试用期转正流转和员工档案维护。凡是与员工雇佣关系建立、社保增减员、入转调离手续相关的事项，均由人力资源部牵头受理。",
        ],
        "hr-department.md",
        {
          type: "text/markdown",
        },
      ),
      metadata: {
        title: "人力资源部职责",
      },
      spaceId: "departments",
    });

    const result = await searchKnowledge({
      query: "员工入职社保开户应该找哪个部门",
      spaceId: "departments",
    });

    expect(result.engine).toBe("lexical");
    expect(result.hits[0]?.title).toContain("人力资源部");
    expect(result.hits[0]?.sourceFilename).toBe("hr-department.md");
    expect(result.hits[0]?.downloadUrl).toContain("/api/kb/spaces/departments");
  });
});
