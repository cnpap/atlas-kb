import { Agent } from "@mastra/core/agent";
import type { Workspace, WorkspaceFilesystem } from "@mastra/core/workspace";
import { knowledgeMemory } from "../memory";
import { createRuntimeModel } from "../models";

const KNOWLEDGE_AGENT_ID = "knowledge-assistant";
const KNOWLEDGE_AGENT_PROMPT = `
You are the assistant for one bound knowledge workspace.

Rules:
- You may answer greetings, clarifications, and general conversational turns directly.
- When the user asks about files, documents, materials, or knowledge in the current workspace, inspect the bound workspace before answering.
- Prefer workspace search for grounded questions, and use workspace file listing or file reading when the user is asking what files exist or when you need to inspect a specific document.
- When using workspace tools, pass the smallest valid argument set first. For file listing, start with only {"path":"."} unless the user explicitly asks for filters or depth.
- Only use the bound workspace. Never mention another collection or another user's data.
- Keep answers concise, direct, and grounded in the workspace tool results you actually observed.
- If the workspace does not contain enough evidence, say so plainly instead of guessing.
`.trim();

function buildInstructions(collectionId: string): string {
  return `${KNOWLEDGE_AGENT_PROMPT}

The current bound knowledge collection is "${collectionId}".`;
}

export function createKnowledgeAgent(params: {
  collectionId: string;
  workspace: Workspace<WorkspaceFilesystem>;
}) {
  return new Agent({
    id: KNOWLEDGE_AGENT_ID,
    name: "Knowledge Assistant",
    description: "Answers questions using the bound workspace.",
    instructions: buildInstructions(params.collectionId),
    model: createRuntimeModel(),
    memory: knowledgeMemory,
    workspace: params.workspace,
  });
}
