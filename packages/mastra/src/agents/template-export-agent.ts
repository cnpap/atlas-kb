import { Agent } from "@mastra/core/agent";
import type { AnyWorkspace } from "@mastra/core/workspace";
import { createRuntimeModel } from "../models/runtime-model";

const TEMPLATE_EXPORT_AGENT_ID = "knowledge-template-exporter";

function buildInstructions(args: {
  /** 已格式化好的目录挂载说明文本，会直接拼进 prompt。 */
  directoryMappings: string;
  /** 已挂载参考资料目录的扁平列表，用于在 prompt 里先做总览提示。 */
  referenceMountDirectories: string;
  /** 当前导出任务的事实依据目录，也就是挂载后的 /source。 */
  sourceMountPath: string;
  /** 模板自身配置的系统提示词，来源于模板详情里的 systemPrompt 字段。 */
  systemPrompt: string;
  /** 当前导出所使用的模板名称。 */
  templateName: string;
  /** 模板字段说明文本，会直接拼进 prompt。 */
  fieldDirectives: string;
}): string {
  const templatePrompt = args.systemPrompt.trim();

  return [
    "角色定位：",
    "- 你是模板导出助手，必须基于当前工作空间中的真实文件内容提取所需字段。",
    `- ${args.sourceMountPath} 是本次导出工作的事实依据目录。`,
    "- 字段提取必须优先依据 /source 下的主资料内容。",
    "- /source 之外的其他挂载目录都是参考资料目录，仅作为参考资料了解和辅助判断使用，不能替代 /source 中的事实内容。",
    `- 当前已挂载的参考资料目录：${args.referenceMountDirectories}。`,
    "- 目录信息已明确给出，无需再次列目录。",
    "",
    "工作要求：",
    "- 先阅读 /source 中的主资料，再填写字段。",
    "- /references 下的资料只用于补充格式、术语、范例和上下文，不能替代主资料。",
    "- 可以先用搜索工具定位，再按需读取主资料或参考资料文件。",
    "- 只能依据当前 workspace 中的真实文件，不要编造，不要引用外部知识。",
    "- 每个字段都必须返回字符串；无法确认时返回空字符串。",
    "- 最终只返回结构化输出对象，不要附加解释。",
    "",
    "模板信息：",
    `- 模板名称：${args.templateName}`,
    templatePrompt ? `- 模板系统提示词：\n${templatePrompt}` : "",
    "",
    "字段说明：",
    args.fieldDirectives,
    "",
    "目录挂载关系：",
    args.directoryMappings,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function createTemplateExportAgent(params: {
  /** 已格式化好的目录挂载说明文本，会直接拼进 prompt。 */
  directoryMappings: string;
  /** 已挂载参考资料目录的扁平列表，用于在 prompt 里先做总览提示。 */
  referenceMountDirectories: string;
  /** 当前导出任务的事实依据目录，也就是挂载后的 /source。 */
  sourceMountPath: string;
  /** 模板自身配置的系统提示词，来源于模板详情里的 systemPrompt 字段。 */
  systemPrompt: string;
  /** 当前导出所使用的模板名称。 */
  templateName: string;
  /** 模板字段说明文本，会直接拼进 prompt。 */
  fieldDirectives: string;
  workspace: AnyWorkspace;
}) {
  return new Agent({
    id: TEMPLATE_EXPORT_AGENT_ID,
    name: "Knowledge Template Exporter",
    description: "Extracts template fields from mounted workspace files.",
    instructions: buildInstructions({
      directoryMappings: params.directoryMappings,
      referenceMountDirectories: params.referenceMountDirectories,
      sourceMountPath: params.sourceMountPath,
      systemPrompt: params.systemPrompt,
      templateName: params.templateName,
      fieldDirectives: params.fieldDirectives,
    }),
    model: createRuntimeModel(),
    workspace: params.workspace,
  });
}
