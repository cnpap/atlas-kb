import { createKnowledgeAgent } from "./knowledge-agent";

export { createKnowledgeAgent } from "./knowledge-agent";
export { SEARCH_KNOWLEDGE_TOOL_NAME } from "./knowledge-agent";

export function createAgents() {
  return {
    knowledgeAssistant: createKnowledgeAgent(),
  };
}
