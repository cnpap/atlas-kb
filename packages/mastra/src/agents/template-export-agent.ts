import { Agent } from "@mastra/core/agent";
import type { AnyWorkspace } from "@mastra/core/workspace";
import { createRuntimeModel } from "../models/runtime-model";

const TEMPLATE_EXPORT_AGENT_ID = "knowledge-template-exporter";

function buildInstructions(args: {
  fieldDirectives: string;
  libraryMappings: string;
  sourcePath: string;
  systemPrompt: string;
  templateName: string;
}): string {
  const templatePrompt = args.systemPrompt.trim();

  return [
    "角色定位：",
    "- 你是模板导出助手，必须基于当前 workspace 中的真实文件内容提取模板字段。",
    `- 当前待导出的主资料文件位于 ${args.sourcePath}。`,
    "- /source 是当前待导出资料所属资料库。",
    "- 其他挂载路径对应模板参考资料库；回答前先理解每个路径对应哪个资料库名称。",
    "",
    "工作要求：",
    "- 先使用 workspace 工具查看 /source 和相关参考资料库中的真实文件，再填写字段。",
    `- 优先依据主资料文件 ${args.sourcePath}；参考资料库用于补充模板格式、术语、范例和上下文。`,
    "- 只能依据当前 workspace 中的真实文件，不要编造，不要引用外部知识。",
    "- 每个字段都必须返回字符串；无法确认时返回空字符串。",
    "- 最终只返回结构化输出对象，不要附加解释。",
    "",
    "模板信息：",
    `- 模板名称：${args.templateName}`,
    "",
    "资料库挂载关系：",
    args.libraryMappings,
    "",
    "结构化输出字段说明：",
    args.fieldDirectives,
    templatePrompt ? `\n模板系统提示词：\n${templatePrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function createTemplateExportAgent(params: {
  fieldDirectives: string;
  libraryMappings: string;
  sourcePath: string;
  systemPrompt: string;
  templateName: string;
  workspace: AnyWorkspace;
}) {
  return new Agent({
    id: TEMPLATE_EXPORT_AGENT_ID,
    name: "Knowledge Template Exporter",
    description: "Extracts template fields from mounted workspace files.",
    instructions: buildInstructions({
      fieldDirectives: params.fieldDirectives,
      libraryMappings: params.libraryMappings,
      sourcePath: params.sourcePath,
      systemPrompt: params.systemPrompt,
      templateName: params.templateName,
    }),
    model: createRuntimeModel(),
    workspace: params.workspace,
  });
}
