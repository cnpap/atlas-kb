import type { KnowledgeTemplateDetail } from "@atlas-kb/schema";
import { BadRequestError } from "@atlas-kb/errors";
import { requireKnowledgeSource } from "./repository";
import { buildSummary } from "./search-utils";
import { getOpenAIApiKey, getOpenAIModel, getOpenAIUrl } from "./config";

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
};

function normalizeFieldValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readMessageText(
  payload: OpenAIChatCompletionResponse,
): string | undefined {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim() || undefined;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  return (
    content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .trim() || undefined
  );
}

function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return undefined;
  }

  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function createFallbackParameters(args: {
  source: Awaited<ReturnType<typeof requireKnowledgeSource>>;
  template: KnowledgeTemplateDetail;
}): Record<string, string> {
  const summary =
    args.source.summary.trim() || buildSummary(args.source.content, 280);

  return Object.fromEntries(
    args.template.fields.map((field) => {
      const name = field.name.toLowerCase();
      const label = field.label.toLowerCase();

      if (name.includes("title") || label.includes("标题")) {
        return [field.name, args.source.title];
      }

      if (
        name.includes("summary") ||
        name.includes("opinion") ||
        label.includes("摘要") ||
        label.includes("拟办")
      ) {
        return [field.name, summary];
      }

      return [field.name, ""];
    }),
  );
}

async function generateWithModel(args: {
  source: Awaited<ReturnType<typeof requireKnowledgeSource>>;
  template: KnowledgeTemplateDetail;
}): Promise<Record<string, string> | undefined> {
  const apiKey = getOpenAIApiKey();

  if (!apiKey) {
    return undefined;
  }

  const fieldSpecs = args.template.fields
    .map(
      (field) =>
        `- ${field.name}: ${field.label}${field.description ? `（${field.description}）` : ""}`,
    )
    .join("\n");

  const response = await fetch(getOpenAIUrl("chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            args.template.systemPrompt.trim() ||
            "你是知识库导出助手。请根据文件内容提取模板字段，严格返回 JSON 对象，不要输出解释。",
        },
        {
          role: "user",
          content: `请根据以下模板字段生成 JSON，对象 key 必须与字段 name 完全一致，value 必须为字符串；无法确认时填空字符串。

模板名称：${args.template.name}
字段列表：
${fieldSpecs}

资料标题：${args.source.title}
资料摘要：${args.source.summary}
资料正文：
${args.source.content.slice(0, 12000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Template export request failed with ${response.status}`);
  }

  const payload = (await response.json()) as OpenAIChatCompletionResponse;
  const text = readMessageText(payload);

  if (!text) {
    return undefined;
  }

  const parsed = extractJsonObject(text);

  if (!parsed) {
    return undefined;
  }

  return Object.fromEntries(
    args.template.fields.map((field) => [
      field.name,
      normalizeFieldValue(parsed[field.name]),
    ]),
  );
}

export async function generateKnowledgeTemplateExportPayload(args: {
  sourceId: string;
  template: KnowledgeTemplateDetail;
  userId: string;
}): Promise<{
  citations: [];
  parameters: Record<string, string>;
  summary: string;
}> {
  const source = await requireKnowledgeSource(args.userId, args.sourceId);

  if (source.status !== "ready") {
    throw new BadRequestError("当前资料尚未准备好，暂时无法执行导出任务");
  }

  const parameters =
    (await generateWithModel({
      source,
      template: args.template,
    }).catch(() => undefined)) ??
    createFallbackParameters({
      source,
      template: args.template,
    });

  return {
    parameters,
    summary: source.summary.trim() || buildSummary(source.content, 280),
    citations: [],
  };
}
