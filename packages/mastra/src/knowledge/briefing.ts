import type {
  BriefingExportCreateRequest,
  BriefingField,
  BriefingForm,
  BriefingOpinionData,
} from "@atlas-kb/schema";
import { BadRequestError } from "@atlas-kb/errors";
import {
  createBriefingExport,
  listBriefingExports,
  requireKnowledgeSource,
} from "./repository";
import { getOpenAIApiKey, getOpenAIModel, getOpenAIUrl } from "./config";
import { buildSummary } from "./search-utils";

const BRIEFING_FIELDS: Array<{
  key: keyof BriefingForm;
  label: string;
}> = [
  { key: "sourceOrg", label: "来文单位" },
  { key: "documentCode", label: "文号" },
  { key: "documentTitle", label: "文件标题" },
  { key: "receivedAt", label: "收文时间" },
  { key: "briefingOpinion", label: "拟办意见" },
  { key: "pendingQuestions", label: "待明确事项" },
];

interface OpenAIChatCompletionResponse {
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
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeFieldValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function createFallbackForm(params: {
  content: string;
  summary: string;
  title: string;
}): BriefingForm {
  return {
    sourceOrg: "",
    documentCode: "",
    documentTitle: params.title,
    receivedAt: "",
    briefingOpinion:
      params.summary.trim() ||
      buildSummary(params.content, 220) ||
      "请结合正文内容补充拟办意见。",
    pendingQuestions: "",
  };
}

function buildFields(form: BriefingForm): BriefingField[] {
  return BRIEFING_FIELDS.map((field) => {
    const value = form[field.key] || "";

    return {
      key: field.key,
      label: field.label,
      value,
      status: value.trim() ? "confirmed" : "missing",
      citations: [],
    };
  });
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

async function generateBriefingFormWithModel(params: {
  content: string;
  summary: string;
  title: string;
}): Promise<BriefingForm | undefined> {
  const apiKey = getOpenAIApiKey();

  if (!apiKey) {
    return undefined;
  }

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
            "你是政务办公助手。请从来文内容中提取拟办意见表单，严格返回 JSON 对象，不要输出解释。",
        },
        {
          role: "user",
          content: `请根据以下资料生成 JSON，对象必须包含 sourceOrg、documentCode、documentTitle、receivedAt、briefingOpinion、pendingQuestions 六个字符串字段。无法确认的字段填空字符串。

标题：${params.title}
摘要：${params.summary}
正文：
${params.content.slice(0, 12_000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Briefing request failed with ${response.status}`);
  }

  const payload = (await response.json()) as OpenAIChatCompletionResponse;
  const messageText = readMessageText(payload);

  if (!messageText) {
    return undefined;
  }

  const parsed = extractJsonObject(messageText);

  if (!parsed) {
    return undefined;
  }

  return {
    sourceOrg: normalizeFieldValue(parsed.sourceOrg),
    documentCode: normalizeFieldValue(parsed.documentCode),
    documentTitle:
      normalizeFieldValue(parsed.documentTitle) || params.title.trim(),
    receivedAt: normalizeFieldValue(parsed.receivedAt),
    briefingOpinion: normalizeFieldValue(parsed.briefingOpinion),
    pendingQuestions: normalizeFieldValue(parsed.pendingQuestions),
  };
}

export async function generateBriefingOpinion(params: {
  userId: string;
  sourceId: string;
}): Promise<BriefingOpinionData> {
  const source = await requireKnowledgeSource(params.userId, params.sourceId);

  if (source.status !== "ready") {
    throw new BadRequestError("当前资料尚未准备好，暂时无法生成拟办意见");
  }

  const fallbackForm = createFallbackForm({
    title: source.title,
    summary: source.summary,
    content: source.content,
  });
  const form =
    (await generateBriefingFormWithModel({
      title: source.title,
      summary: source.summary,
      content: source.content,
    }).catch(() => undefined)) ?? fallbackForm;
  const history = await listBriefingExports(params.userId, params.sourceId);

  return {
    source,
    briefing: {
      sourceId: source.id,
      documentId: source.documentId || source.id,
      title: source.title,
      summary: source.summary,
      form,
      fields: buildFields(form),
      citations: [],
      generatedAt: nowIso(),
    },
    history,
  };
}

export async function saveBriefingExport(params: {
  userId: string;
  sourceId: string;
  input: BriefingExportCreateRequest;
}) {
  const source = await requireKnowledgeSource(params.userId, params.sourceId);

  if (!source.documentId) {
    throw new BadRequestError("当前资料还没有可导出的拟办意见结果");
  }

  const exportRecord = await createBriefingExport({
    userId: params.userId,
    sourceId: source.id,
    documentId: source.documentId,
    title: source.title,
    summary: params.input.summary,
    form: params.input.form,
    citations: params.input.citations ?? [],
  });

  return {
    export: exportRecord,
  };
}

export async function getBriefingExportHistory(params: {
  userId: string;
  sourceId: string;
}) {
  await requireKnowledgeSource(params.userId, params.sourceId);

  return {
    exports: await listBriefingExports(params.userId, params.sourceId),
  };
}
