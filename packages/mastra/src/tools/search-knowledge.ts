import {
  SearchKnowledgeRequestSchema,
  SearchKnowledgeResultSchema,
} from "@atlas-kb/schema";
import { createTool } from "@mastra/core/tools";
import { searchKnowledge } from "../knowledge/search";

const SEARCH_KNOWLEDGE_TOOL_ID = "search_knowledge";

export function createSearchKnowledgeTool(
  options: { defaultLimit?: number; lockedSpaceId?: string } = {},
) {
  const description = options.lockedSpaceId
    ? `Search the Atlas KB knowledge space "${options.lockedSpaceId}" and return grounded document snippets.`
    : "Search the Atlas KB knowledge spaces and return grounded document snippets.";

  return createTool({
    id: SEARCH_KNOWLEDGE_TOOL_ID,
    description,
    inputSchema: SearchKnowledgeRequestSchema,
    outputSchema: SearchKnowledgeResultSchema,
    execute: async (input) => {
      return searchKnowledge({
        ...input,
        limit: input.limit ?? options.defaultLimit,
        spaceId: options.lockedSpaceId ?? input.spaceId,
      });
    },
  });
}
