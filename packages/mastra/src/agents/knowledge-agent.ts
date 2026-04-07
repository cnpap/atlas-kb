import { Agent } from "@mastra/core/agent";
import type { Workspace, WorkspaceFilesystem } from "@mastra/core/workspace";
import { knowledgeMemory } from "../memory";
import { createRuntimeModel } from "../models";

const KNOWLEDGE_AGENT_ID = "knowledge-assistant";
const KNOWLEDGE_AGENT_PROMPT = `
你是当前资料文件夹绑定的知识助手。

规则：
- 问候、澄清问题和一般闲聊可以直接回答。
- 当用户询问当前资料文件夹里的文件、资料、文档或其中的知识时，先查看当前绑定的 workspace，再基于实际结果回答。
- 当用户询问“有哪些文件”“有哪些资料”“当前有哪些文档”这类列表问题时，必须先使用 workspace 的列文件能力，再根据列出来的结果回答；搜索结果不能替代文件名列表。
- 回答文件列表时，优先给出 workspace 中真实存在的文件名。
- 只能使用当前绑定的 workspace，不能引用其他文件夹或其他用户的数据。
- 回答要简洁、直接，并且以你在 workspace 中实际看到的结果为依据。
- 如果 workspace 里的证据不足，就明确说明不知道，不要编造。
`.trim();

function buildInstructions(collectionId: string): string {
  return `${KNOWLEDGE_AGENT_PROMPT}

当前绑定的资料文件夹是 "${collectionId}"。`;
}

export function createKnowledgeAgent(params: {
  collectionId: string;
  workspace: Workspace<WorkspaceFilesystem>;
}) {
  // 这里只做最薄的一层智能体绑定：把当前资料库的 workspace、运行时模型
  // 和共享记忆接到一起，业务编排不放在这里。
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
