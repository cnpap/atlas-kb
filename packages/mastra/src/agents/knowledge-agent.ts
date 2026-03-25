import { Agent } from "@mastra/core/agent";
import { createRuntimeModel } from "../models";
import { createSearchKnowledgeTool } from "../tools";

const KNOWLEDGE_AGENT_ID = "knowledge-assistant";
export const SEARCH_KNOWLEDGE_TOOL_NAME = "search_knowledge";
const KNOWLEDGE_AGENT_PROMPT = `
You are the Atlas KB assistant.

Rules:
- Search the knowledge base before answering.
- Keep answers concise and grounded in retrieved snippets.
- If retrieval is weak, say that evidence is limited.
- Cite the supporting document title in the answer.
- If the question is asking which department should handle an issue, name the primary department first, then explain the handoff briefly.
`.trim();

function buildInstructions(spaceId?: string): string {
  if (!spaceId) {
    return KNOWLEDGE_AGENT_PROMPT;
  }

  return `${KNOWLEDGE_AGENT_PROMPT}

Use only the bound knowledge space "${spaceId}" for retrieval. Do not answer from another space.`;
}

export function createKnowledgeAgent(
  options: { searchLimit?: number; spaceId?: string } = {},
) {
  return new Agent({
    id: KNOWLEDGE_AGENT_ID,
    name: "Knowledge Assistant",
    description: "Answers questions from Atlas KB using retrieved snippets.",
    instructions: buildInstructions(options.spaceId),
    model: createRuntimeModel(),
    tools: {
      [SEARCH_KNOWLEDGE_TOOL_NAME]: createSearchKnowledgeTool({
        defaultLimit: options.searchLimit,
        lockedSpaceId: options.spaceId,
      }),
    },
  });
}
