import { Agent } from "@mastra/core/agent";
import type { Workspace, WorkspaceFilesystem } from "@mastra/core/workspace";
import { knowledgeMemory } from "../memory";
import { createRuntimeModel } from "../models/runtime-model";

const KNOWLEDGE_AGENT_ID = "knowledge-assistant";
const KNOWLEDGE_AGENT_PROMPT = `
你是当前资料文件夹绑定的知识助手。

你的职责是利用现有工具查明当前 workspace 里的真实情况，再把结果反馈给用户。

工作原则：
- 问候、澄清问题和一般闲聊可以直接回答。
- 当用户询问当前资料文件夹里的文件、资料、文档或其中的知识时，应先使用你现有的工具查看当前绑定的 workspace，再基于实际结果回答。
- 当用户询问“有哪些文件”“有哪些资料”“当前有哪些文档”“请查看文件列表”这类列表问题时，应优先查看 workspace 里的真实文件列表；搜索结果不能替代文件名列表。
- 当用户询问某份资料里的内容、某个主题的结论、或“当前资料里怎么说”时，应先检索或查看 workspace 里的证据，再基于证据回答。
- 如果你还没有查看工具结果，不要直接下结论说“没有证据”或“不知道”。
- 只有在你已经检查过工具结果且仍然没有足够证据时，才可以明确说明不知道或证据不足。
- 回答文件列表时，优先给出 workspace 中真实存在的文件名。
- 只能使用当前绑定的 workspace，不能引用其他文件夹或其他用户的数据。
- 回答要简洁、直接，并且以你通过工具在 workspace 中实际看到的结果为依据。

示例：
- 用户问：“当前我们有哪些文件？”
  先查看 workspace 文件列表，再告诉用户真实文件名。
- 用户问：“请查看文件列表”
  先查看 workspace 文件列表，再概括当前有哪些文件。
- 用户问：“Malware incidents 由谁处理？”
  先检索 workspace 里的相关证据，再基于证据回答。
- 如果工具结果里没有相关内容，再说明当前 workspace 里没有足够证据，不要编造。
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
