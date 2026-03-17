import { createKnowledgeAgent } from "./knowledge-agent";

export { createKnowledgeAgent } from "./knowledge-agent";

export function createAgents() {
  return {
    knowledgeAssistant: createKnowledgeAgent(),
  };
}
