import {
  BadRequestError,
  ModelProviderUnavailableError,
} from "@atlas-kb/errors";
import type {
  KnowledgeExportTaskGenerateResult,
  KnowledgeTemplateDetail,
} from "@atlas-kb/schema";
import { buildKnowledgeTemplateExportStructuredOutputSchema } from "@atlas-kb/schema";
import {
  type AnyWorkspace,
  Workspace,
  type WorkspaceFilesystem,
} from "@mastra/core/workspace";
import { createTemplateExportAgent } from "../agents";
import { mapRuntimeModelError } from "../models/runtime-model";
import { requireKnowledgeSource } from "./repository";
import {
  createKnowledgeCollectionFilesystem,
  createKnowledgeStoragePrefixFilesystem,
} from "./runtime";
import { buildSummary } from "./search-utils";

const TEMPLATE_EXPORT_TIMEOUT_MS = 20_000;
const TEMPLATE_EXPORT_TIMEOUT_MESSAGE = "模板导出超时，请稍后重试。";
const TEMPLATE_EXPORT_SOURCE_MOUNT_PATH = "/source";

class TemplateExportTimeoutError extends Error {
  constructor() {
    super(TEMPLATE_EXPORT_TIMEOUT_MESSAGE);
    this.name = "TemplateExportTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TemplateExportTimeoutError());
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizeFieldValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readUnknownText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => readUnknownText(item)).join("\n");
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  return Object.values(value as Record<string, unknown>)
    .map((item) => readUnknownText(item))
    .filter(Boolean)
    .join("\n");
}

function extractJsonObjectText(text: string): string | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return undefined;
  }

  return text.slice(start, end + 1);
}

function normalizePathSegments(path: string): string[] {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function normalizeMountPath(storagePrefix: string): string {
  const segments = normalizePathSegments(storagePrefix);

  if (segments.length === 0) {
    throw new BadRequestError(
      "模板资料库缺少有效的存储前缀，无法创建导出工作区",
    );
  }

  return `/${segments.join("/")}`;
}

function buildWorkspaceRelativePath(path: string): string {
  const segments = normalizePathSegments(path);

  if (segments.length === 0) {
    throw new BadRequestError(
      "当前资料缺少可读取的工作区文件路径，无法执行导出",
    );
  }

  return segments.join("/");
}

function hasMountPathConflict(left: string, right: string): boolean {
  return (
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`)
  );
}

function buildTemplateFieldDirectives(
  template: KnowledgeTemplateDetail,
): string {
  return template.fields
    .map((field) => {
      const description = field.description.trim() || "无";
      return `- ${field.name}: 字段标签=${field.label}；字段说明=${description}`;
    })
    .join("\n");
}

function buildReferenceLibraryMounts(args: {
  template: KnowledgeTemplateDetail;
  userId: string;
}): {
  lines: string[];
  mounts: Record<string, WorkspaceFilesystem>;
} {
  const mounts: Record<string, WorkspaceFilesystem> = {};
  const registeredPaths = [TEMPLATE_EXPORT_SOURCE_MOUNT_PATH];
  const lines: string[] = [];

  for (const library of args.template.referenceLibraries) {
    const mountPath = normalizeMountPath(library.storagePrefix);

    if (registeredPaths.some((path) => hasMountPathConflict(path, mountPath))) {
      throw new BadRequestError(
        `模板资料库挂载路径冲突：${mountPath}，无法创建导出工作区`,
      );
    }

    registeredPaths.push(mountPath);
    mounts[mountPath] = createKnowledgeStoragePrefixFilesystem({
      userId: args.userId,
      storagePrefix: library.storagePrefix,
      readOnly: true,
    });
    lines.push(
      `- 资料库名称：${library.name}；挂载前缀：${mountPath}；存储前缀：${library.storagePrefix}`,
    );
  }

  return {
    mounts,
    lines,
  };
}

function buildTemplateExportWorkspace(args: {
  source: Awaited<ReturnType<typeof requireKnowledgeSource>>;
  template: KnowledgeTemplateDetail;
  userId: string;
}): {
  libraryMappings: string;
  sourcePath: string;
  workspace: AnyWorkspace;
} {
  const sourceRelativePath = buildWorkspaceRelativePath(
    args.source.documentId ?? args.source.sourceFilename ?? "",
  );
  const sourcePath = `${TEMPLATE_EXPORT_SOURCE_MOUNT_PATH}/${sourceRelativePath}`;
  const referenceLibraries = buildReferenceLibraryMounts({
    template: args.template,
    userId: args.userId,
  });

  const workspace = new Workspace({
    id: `template-export:${args.userId}:${args.source.id}:${args.template.id}`,
    name: `${args.template.name} Export Workspace`,
    mounts: {
      [TEMPLATE_EXPORT_SOURCE_MOUNT_PATH]: createKnowledgeCollectionFilesystem({
        userId: args.userId,
        collectionId: args.source.collectionId,
        readOnly: true,
      }),
      ...referenceLibraries.mounts,
    },
  });

  return {
    workspace,
    sourcePath,
    libraryMappings: [
      `- 当前待导出资料所属资料库：${TEMPLATE_EXPORT_SOURCE_MOUNT_PATH}`,
      ...referenceLibraries.lines,
    ].join("\n"),
  };
}

function mapStructuredOutputToParameters(args: {
  output: Record<string, unknown>;
  template: KnowledgeTemplateDetail;
}) {
  return Object.fromEntries(
    args.template.fields.map((field) => [
      field.name,
      normalizeFieldValue(args.output[field.name]),
    ]),
  );
}

function mapTemplateExportError(error: unknown) {
  if (error instanceof TemplateExportTimeoutError) {
    return new ModelProviderUnavailableError(
      TEMPLATE_EXPORT_TIMEOUT_MESSAGE,
      error,
    );
  }

  const mapped = mapRuntimeModelError(error, "模板导出");

  if (mapped instanceof ModelProviderUnavailableError) {
    return new ModelProviderUnavailableError(
      "模板导出暂时不可用，请稍后重试。",
      error,
    );
  }

  return mapped;
}

function resolveStructuredOutput(args: {
  output: {
    object: unknown;
    response: unknown;
    text: string;
  };
  template: KnowledgeTemplateDetail;
}): Record<string, unknown> {
  const schema = buildKnowledgeTemplateExportStructuredOutputSchema(
    args.template.fields,
  );

  if (args.output.object && typeof args.output.object === "object") {
    const parsed = schema.safeParse(args.output.object);

    if (parsed.success) {
      return parsed.data as Record<string, unknown>;
    }
  }

  const text = args.output.text.trim();

  if (!text) {
    const responseText = readUnknownText(args.output.response);
    const responseJsonText = extractJsonObjectText(responseText);

    if (!responseJsonText) {
      throw new Error("模板导出未返回有效的结构化结果");
    }

    const responseParsed = schema.safeParse(
      JSON.parse(responseJsonText) as unknown,
    );

    if (!responseParsed.success) {
      throw new Error("模板导出未返回有效的结构化结果");
    }

    return responseParsed.data as Record<string, unknown>;
  }

  const parsedJson = JSON.parse(text) as unknown;
  const parsed = schema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error("模板导出未返回有效的结构化结果");
  }

  return parsed.data as Record<string, unknown>;
}

async function generateWithAgent(args: {
  source: Awaited<ReturnType<typeof requireKnowledgeSource>>;
  template: KnowledgeTemplateDetail;
  userId: string;
}): Promise<Record<string, string>> {
  const { workspace, sourcePath, libraryMappings } =
    buildTemplateExportWorkspace(args);

  try {
    await workspace.init();

    const agent = createTemplateExportAgent({
      workspace,
      sourcePath,
      libraryMappings,
      templateName: args.template.name,
      systemPrompt: args.template.systemPrompt,
      fieldDirectives: buildTemplateFieldDirectives(args.template),
    });
    const structuredOutputSchema =
      buildKnowledgeTemplateExportStructuredOutputSchema(args.template.fields);
    const options = {
      maxSteps: 8,
      modelSettings: {
        temperature: 0,
      },
      structuredOutput: {
        schema: structuredOutputSchema,
        jsonPromptInjection: true,
        instructions:
          "只返回结构化 JSON 对象。所有字段值都必须是字符串，无法确认时返回空字符串。",
      },
    };
    const output = await withTimeout(
      agent.generate(
        `请基于当前 workspace 中的真实文件内容，完成模板《${args.template.name}》的字段提取。`,
        options,
      ),
      TEMPLATE_EXPORT_TIMEOUT_MS,
    );

    return mapStructuredOutputToParameters({
      template: args.template,
      output: resolveStructuredOutput({
        template: args.template,
        output,
      }),
    });
  } catch (error) {
    throw mapTemplateExportError(error);
  } finally {
    await workspace.destroy().catch(() => undefined);
  }
}

export async function generateKnowledgeTemplateExportPayload(args: {
  sourceId: string;
  template: KnowledgeTemplateDetail;
  userId: string;
}): Promise<KnowledgeExportTaskGenerateResult> {
  const source = await requireKnowledgeSource(args.userId, args.sourceId);

  if (source.status !== "ready") {
    throw new BadRequestError("当前资料尚未准备好，暂时无法执行导出任务");
  }

  return {
    parameters: await generateWithAgent({
      source,
      template: args.template,
      userId: args.userId,
    }),
    summary: source.summary.trim() || buildSummary(source.content, 280),
    citations: [],
  };
}
