import { describe, expect, it } from "bun:test";
import { success } from "./api";
import {
  AskKnowledgeResponseSchema,
  KnowledgeDocumentDownloadParamsSchema,
  KnowledgeSpacesResponseSchema,
  SearchKnowledgeRequestSchema,
} from "./knowledge";

describe("@atlas-kb/schema knowledge contracts", () => {
  it("rejects blank search queries", () => {
    const result = SearchKnowledgeRequestSchema.safeParse({
      query: "   ",
    });

    expect(result.success).toBeFalse();
  });

  it("parses a knowledge spaces success envelope", () => {
    const payload = success({
      spaces: [
        {
          id: "ops",
          name: "Ops Handbook",
          description: "Runbooks and operational standards",
          documentCount: 2,
          updatedAt: "2026-03-01T10:00:00.000Z",
        },
      ],
    });

    const result = KnowledgeSpacesResponseSchema.parse(payload);
    expect(result.data.spaces).toHaveLength(1);
    expect(result.data.spaces[0]?.id).toBe("ops");
  });

  it("parses download params and enriched citations", () => {
    const downloadParams = KnowledgeDocumentDownloadParamsSchema.parse({
      documentId: "hr-policy",
      spaceId: "departments",
    });
    const askResponse = AskKnowledgeResponseSchema.parse(
      success({
        answer: "人力资源部负责员工入职社保开户。",
        citations: [
          {
            documentId: "hr-policy",
            downloadUrl:
              "/api/kb/spaces/departments/documents/hr-policy/download",
            snippet: "员工入职、社保开户与劳动合同管理由人力资源部统筹。",
            sourceFilename: "hr-policy.md",
            spaceId: "departments",
            title: "人力资源部职责",
          },
        ],
        engine: "lexical",
        mode: "mock",
        question: "员工入职社保开户应该找谁？",
      }),
    );

    expect(downloadParams.documentId).toBe("hr-policy");
    expect(askResponse.data.citations[0]?.downloadUrl).toContain("/download");
    expect(askResponse.data.citations[0]?.spaceId).toBe("departments");
  });
});
