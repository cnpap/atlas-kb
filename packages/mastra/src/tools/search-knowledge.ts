import {
  SearchKnowledgeRequestSchema,
  SearchKnowledgeResultSchema,
} from "@atlas-kb/schema";
import { createTool } from "@mastra/core/tools";
import { searchKnowledge } from "../knowledge/search";

const SEARCH_KNOWLEDGE_TOOL_ID = "search_knowledge";

export function createSearchKnowledgeTool() {
  return createTool({
    id: SEARCH_KNOWLEDGE_TOOL_ID,
    description:
      "Search the seeded Atlas KB documents and return grounded document snippets.",
    inputSchema: SearchKnowledgeRequestSchema,
    outputSchema: SearchKnowledgeResultSchema,
    execute: async (input) => {
      return searchKnowledge(input);
    },
  });
}
