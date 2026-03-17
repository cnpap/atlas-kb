import { describe, expect, it } from "bun:test";
import { success } from "./api";
import {
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
});
