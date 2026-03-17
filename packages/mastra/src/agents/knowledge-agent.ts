import { Agent } from "@mastra/core/agent";
import { createRuntimeModel } from "../models";
import { createSearchKnowledgeTool } from "../tools";

const KNOWLEDGE_AGENT_ID = "knowledge-assistant";
const KNOWLEDGE_AGENT_PROMPT = `
You are the Atlas KB assistant.

Rules:
- Search the knowledge base before answering.
- Keep answers concise and grounded in retrieved snippets.
- If retrieval is weak, say that evidence is limited.
- Cite the supporting document title in the answer.
`.trim();

export function createKnowledgeAgent() {
  return new Agent({
    id: KNOWLEDGE_AGENT_ID,
    name: "Knowledge Assistant",
    description: "Answers questions from Atlas KB using retrieved snippets.",
    instructions: KNOWLEDGE_AGENT_PROMPT,
    model: createRuntimeModel(),
    tools: {
      search_knowledge: createSearchKnowledgeTool(),
    },
  });
}
