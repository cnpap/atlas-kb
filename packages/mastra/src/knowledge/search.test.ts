import { describe, expect, it } from "bun:test";
import { answerKnowledgeQuestion, searchKnowledge } from "./search";

describe("@atlas-kb/mastra knowledge search", () => {
  it("returns hits for onboarding queries", () => {
    const result = searchKnowledge({
      query: "customer onboarding",
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.hits[0]?.title).toContain("Onboarding");
  });

  it("returns a mock answer without a model key", async () => {
    const result = await answerKnowledgeQuestion({
      question: "How should onboarding start?",
    });

    expect(result.mode).toBe("mock");
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
});
