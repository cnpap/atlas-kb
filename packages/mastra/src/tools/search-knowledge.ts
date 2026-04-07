import {
  SearchKnowledgeRequestSchema,
  SearchKnowledgeResultSchema,
} from "@atlas-kb/schema";
import { createTool } from "@mastra/core/tools";
import { requireDefaultUser } from "../knowledge";
import { searchKnowledge } from "../knowledge/search";

const SEARCH_KNOWLEDGE_TOOL_ID = "search_knowledge";

export function createSearchKnowledgeTool(
  options: { defaultLimit?: number; lockedCollectionId?: string } = {},
) {
  const description = options.lockedCollectionId
    ? `Search the collection "${options.lockedCollectionId}" and return grounded document snippets.`
    : "Search the collections and return grounded document snippets.";

  return createTool({
    id: SEARCH_KNOWLEDGE_TOOL_ID,
    description,
    inputSchema: SearchKnowledgeRequestSchema,
    outputSchema: SearchKnowledgeResultSchema,
    execute: async (input) => {
      const user = await requireDefaultUser();
      return searchKnowledge(
        {
          ...input,
          limit: input.limit ?? options.defaultLimit,
          collectionId: options.lockedCollectionId ?? input.collectionId,
        },
        {
          userId: user.id,
        },
      );
    },
  });
}
