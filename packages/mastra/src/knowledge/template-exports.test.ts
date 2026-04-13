import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KnowledgeTemplateDetail } from "@atlas-kb/schema";
import {
  buildTemplateExportChunkId,
  createKnowledgeCollection,
  createKnowledgeSourceRecord,
  ensureDefaultUser,
  generateKnowledgeTemplateExportPayload,
  importKnowledgeFile,
  importKnowledgeText,
  resetKnowledgeRepository,
  resetKnowledgeRuntimeCache,
  setKnowledgeFilesystemFactoryForTests,
  setKnowledgeStoragePrefixFilesystemFactoryForTests,
  waitForPendingKnowledgeImports,
} from "./index";
import { buildMockQdrantResponse } from "./test-qdrant";
import { TestS3LocalFilesystem } from "./test-s3-filesystem";
import { buildMockTikaExtractPayload } from "./test-tika";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalOpenAIModel = process.env.OPENAI_MODEL;
const originalRuntimeProvider = process.env.RUNTIME_PROVIDER;
const originalEmbeddingApiKey = process.env.EMBEDDING_API_KEY;
const originalEmbeddingBaseUrl = process.env.EMBEDDING_BASE_URL;
const originalEmbeddingModel = process.env.EMBEDDING_MODEL;
const originalEmbeddingMinIntervalMs = process.env.EMBEDDING_MIN_INTERVAL_MS;
const originalDataDir = process.env.ATLAS_KB_DATA_DIR;
const originalQdrantUrl = process.env.QDRANT_URL;
const originalS3Endpoint = process.env.ATLAS_KB_S3_ENDPOINT;
const originalS3Region = process.env.ATLAS_KB_S3_REGION;
const originalS3Bucket = process.env.ATLAS_KB_S3_BUCKET;
const originalS3AccessKeyId = process.env.ATLAS_KB_S3_ACCESS_KEY_ID;
const originalS3SecretAccessKey = process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY;
const originalInternalSecret = process.env.ATLAS_KB_INTERNAL_SECRET;
const originalTikaBaseUrl = process.env.ATLAS_KB_TIKA_BASE_URL;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function readJsonRequestBody(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readMessageText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((part) =>
      part && typeof part === "object" && "text" in part
        ? String((part as { text?: unknown }).text ?? "")
        : "",
    )
    .join("\n");
}

function readResponseInputText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      if ("content" in item) {
        return readMessageText((item as { content?: unknown }).content);
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
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

function hasResponseFunctionOutput(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some(
    (item) =>
      Boolean(item) &&
      typeof item === "object" &&
      "type" in item &&
      (item as { type?: unknown }).type === "function_call_output",
  );
}

function buildResponsesToolCall(args: {
  toolArguments: Record<string, unknown>;
  toolCallId: string;
  toolName: string;
}) {
  return jsonResponse({
    id: "resp_tool_call",
    object: "response",
    created_at: Date.now(),
    model: "openai/gpt-5.4",
    output: [
      {
        type: "function_call",
        id: `fc_${args.toolCallId}`,
        call_id: args.toolCallId,
        name: args.toolName,
        arguments: JSON.stringify(args.toolArguments),
      },
    ],
    output_text: "",
    usage: {
      input_tokens: 32,
      output_tokens: 12,
      total_tokens: 44,
    },
  });
}

function buildToolCallResponse(args: {
  toolArguments: Record<string, unknown>;
  toolCallId: string;
  toolName: string;
}) {
  return jsonResponse({
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: args.toolCallId,
              type: "function",
              function: {
                name: args.toolName,
                arguments: JSON.stringify(args.toolArguments),
              },
            },
          ],
        },
      },
    ],
  });
}

function normalizePathSegments(path: string): string[] {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function mockTemplateExportProviders(args: {
  invalidStructuredOutput?: boolean;
  promptBucket: string[];
  sourcePath: string;
  toolPayloadBucket: string[];
  libraryPath: string;
}) {
  let chatStep = 0;
  let responseStep = 0;

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const body = readJsonRequestBody(init?.body);
    const responseInputText = readResponseInputText(body.input);

    if (url.includes("/embeddings")) {
      return jsonResponse({
        data: [
          {
            embedding: [0.11, 0.22, 0.33],
            index: 0,
          },
        ],
      });
    }

    if (url.includes(":6333")) {
      return jsonResponse(buildMockQdrantResponse(url, init?.method || "GET"));
    }

    if (url.includes("/rmeta/text")) {
      return jsonResponse(buildMockTikaExtractPayload(init));
    }

    if (url.includes("/responses")) {
      args.promptBucket.push(responseInputText);

      if (!hasResponseFunctionOutput(body.input)) {
        return buildResponsesToolCall({
          toolCallId: "call_search_context",
          toolName: "mastra_workspace_search",
          toolArguments: {
            query: "预算调整 财务 核对 拟办意见",
            topK: 5,
            mode: "hybrid",
          },
        });
      }

      args.toolPayloadBucket.push(JSON.stringify(body.input));
      responseStep += 1;

      if (responseStep === 1) {
        return buildResponsesToolCall({
          toolCallId: "call_read_source",
          toolName: "mastra_workspace_read_file",
          toolArguments: {
            path: args.sourcePath,
          },
        });
      }

      if (responseStep === 2) {
        return buildResponsesToolCall({
          toolCallId: "call_read_reference",
          toolName: "mastra_workspace_read_file",
          toolArguments: {
            path: args.libraryPath,
          },
        });
      }

      const outputText = args.invalidStructuredOutput
        ? "invalid export payload"
        : JSON.stringify({
            document_title: "关于预算调整的请示",
            opinion: "建议财务部门核对预算依据后办理。",
          });

      return jsonResponse({
        id: "resp_export",
        object: "response",
        created_at: Date.now(),
        model: "openai/gpt-5.4",
        output: [
          {
            type: "message",
            id: "msg_export",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: outputText,
                annotations: [],
              },
            ],
          },
        ],
        output_text: outputText,
        usage: {
          input_tokens: 64,
          output_tokens: 24,
          total_tokens: 88,
        },
      });
    }

    if (url.includes("chat/completions")) {
      const messages = Array.isArray(body.messages) ? body.messages : [];
      args.promptBucket.push(readUnknownText(messages));
      const hasToolReply = messages.some(
        (message) =>
          Boolean(message) &&
          typeof message === "object" &&
          "role" in message &&
          (message as { role?: unknown }).role === "tool",
      );

      if (!hasToolReply) {
        return buildToolCallResponse({
          toolCallId: "call_search_context",
          toolName: "mastra_workspace_search",
          toolArguments: {
            query: "预算调整 财务 核对 拟办意见",
            topK: 5,
            mode: "hybrid",
          },
        });
      }

      args.toolPayloadBucket.push(JSON.stringify(messages));
      chatStep += 1;

      if (chatStep === 1) {
        return buildToolCallResponse({
          toolCallId: "call_read_source",
          toolName: "mastra_workspace_read_file",
          toolArguments: {
            path: args.sourcePath,
          },
        });
      }

      if (chatStep === 2) {
        return buildToolCallResponse({
          toolCallId: "call_read_reference",
          toolName: "mastra_workspace_read_file",
          toolArguments: {
            path: args.libraryPath,
          },
        });
      }

      const outputText = args.invalidStructuredOutput
        ? "invalid export payload"
        : JSON.stringify({
            document_title: "关于预算调整的请示",
            opinion: "建议财务部门核对预算依据后办理。",
          });

      return jsonResponse({
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: outputText,
            },
          },
        ],
      });
    }

    return jsonResponse({
      choices: [
        {
          index: 0,
          message: {
            content: "",
          },
        },
      ],
    });
  }) as typeof fetch;
}

function mockKnowledgeProviders() {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes("/embeddings")) {
      return jsonResponse({
        data: [
          {
            embedding: [0.11, 0.22, 0.33],
            index: 0,
          },
        ],
      });
    }

    if (url.includes(":6333")) {
      return jsonResponse(buildMockQdrantResponse(url, init?.method || "GET"));
    }

    if (url.includes("/rmeta/text")) {
      return jsonResponse(buildMockTikaExtractPayload(init));
    }

    return jsonResponse({
      ok: true,
      body: readJsonRequestBody(init?.body),
    });
  }) as typeof fetch;
}

function createTemplateDetail(): KnowledgeTemplateDetail {
  return {
    id: "template-export-1",
    name: "拟办意见",
    templateType: "xlsx",
    sourceFilename: "拟办意见.xlsx",
    fieldCount: 2,
    referenceLibraryCount: 1,
    parsedAt: "2026-04-08T00:00:00.000Z",
    updatedAt: "2026-04-08T00:00:00.000Z",
    systemPrompt: "请结合资料内容和参考资料库生成拟办意见。",
    fields: [
      {
        id: "field-1",
        name: "document_title",
        label: "文件标题",
        description: "提取当前公文标题",
        sortOrder: 1,
      },
      {
        id: "field-2",
        name: "opinion",
        label: "拟办意见",
        description: "给出拟办建议",
        sortOrder: 2,
      },
    ],
    referenceLibraries: [
      {
        id: "lib-1",
        name: "办公室手册",
        storagePrefix: "ops/manuals",
        fileCount: 1,
      },
    ],
  };
}

describe.serial("@atlas-kb/mastra template export flow", () => {
  let knowledgeDataDir = "";
  let workspaceFilesDir = "";
  let storagePrefixDir = "";

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-export-test-"));
    workspaceFilesDir = join(knowledgeDataDir, "workspace-files");
    storagePrefixDir = join(knowledgeDataDir, "storage-prefix-files");
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    process.env.QDRANT_URL = "http://127.0.0.1:6333";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_MODEL = "gpt-5.4";
    process.env.RUNTIME_PROVIDER = "openai";
    process.env.EMBEDDING_API_KEY = "test-embedding-key";
    process.env.EMBEDDING_BASE_URL = "https://dashscope.test/v1";
    process.env.EMBEDDING_MODEL = "text-embedding-v4";
    process.env.EMBEDDING_MIN_INTERVAL_MS = "1";
    process.env.ATLAS_KB_S3_ENDPOINT = "http://127.0.0.1:9000";
    process.env.ATLAS_KB_S3_REGION = "us-east-1";
    process.env.ATLAS_KB_S3_BUCKET = "atlas-kb-test";
    process.env.ATLAS_KB_S3_ACCESS_KEY_ID = "test-access-key";
    process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.ATLAS_KB_INTERNAL_SECRET = "test-internal-secret";
    process.env.ATLAS_KB_TIKA_BASE_URL = "http://tika.local";
    resetKnowledgeRuntimeCache();
    await resetKnowledgeRepository();
    setKnowledgeFilesystemFactoryForTests(({ userId, collectionId }) => {
      return new TestS3LocalFilesystem({
        basePath: join(workspaceFilesDir, userId, collectionId),
        prefix: `${userId}/${collectionId}`,
      });
    });
    setKnowledgeStoragePrefixFilesystemFactoryForTests(({ storagePrefix }) => {
      return new TestS3LocalFilesystem({
        basePath: join(
          storagePrefixDir,
          ...normalizePathSegments(storagePrefix),
        ),
        prefix: storagePrefix,
      });
    });
    mockKnowledgeProviders();
  });

  afterEach(async () => {
    await waitForPendingKnowledgeImports();
    resetKnowledgeRuntimeCache();
    await resetKnowledgeRepository();

    if (originalDataDir === undefined) {
      delete process.env.ATLAS_KB_DATA_DIR;
    } else {
      process.env.ATLAS_KB_DATA_DIR = originalDataDir;
    }

    if (originalQdrantUrl === undefined) {
      delete process.env.QDRANT_URL;
    } else {
      process.env.QDRANT_URL = originalQdrantUrl;
    }

    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    if (originalOpenAIModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalOpenAIModel;
    }

    if (originalRuntimeProvider === undefined) {
      delete process.env.RUNTIME_PROVIDER;
    } else {
      process.env.RUNTIME_PROVIDER = originalRuntimeProvider;
    }

    if (originalEmbeddingApiKey === undefined) {
      delete process.env.EMBEDDING_API_KEY;
    } else {
      process.env.EMBEDDING_API_KEY = originalEmbeddingApiKey;
    }

    if (originalEmbeddingBaseUrl === undefined) {
      delete process.env.EMBEDDING_BASE_URL;
    } else {
      process.env.EMBEDDING_BASE_URL = originalEmbeddingBaseUrl;
    }

    if (originalEmbeddingModel === undefined) {
      delete process.env.EMBEDDING_MODEL;
    } else {
      process.env.EMBEDDING_MODEL = originalEmbeddingModel;
    }

    if (originalEmbeddingMinIntervalMs === undefined) {
      delete process.env.EMBEDDING_MIN_INTERVAL_MS;
    } else {
      process.env.EMBEDDING_MIN_INTERVAL_MS = originalEmbeddingMinIntervalMs;
    }

    if (originalS3Endpoint === undefined) {
      delete process.env.ATLAS_KB_S3_ENDPOINT;
    } else {
      process.env.ATLAS_KB_S3_ENDPOINT = originalS3Endpoint;
    }

    if (originalS3Region === undefined) {
      delete process.env.ATLAS_KB_S3_REGION;
    } else {
      process.env.ATLAS_KB_S3_REGION = originalS3Region;
    }

    if (originalS3Bucket === undefined) {
      delete process.env.ATLAS_KB_S3_BUCKET;
    } else {
      process.env.ATLAS_KB_S3_BUCKET = originalS3Bucket;
    }

    if (originalS3AccessKeyId === undefined) {
      delete process.env.ATLAS_KB_S3_ACCESS_KEY_ID;
    } else {
      process.env.ATLAS_KB_S3_ACCESS_KEY_ID = originalS3AccessKeyId;
    }

    if (originalS3SecretAccessKey === undefined) {
      delete process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY;
    } else {
      process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY = originalS3SecretAccessKey;
    }

    if (originalInternalSecret === undefined) {
      delete process.env.ATLAS_KB_INTERNAL_SECRET;
    } else {
      process.env.ATLAS_KB_INTERNAL_SECRET = originalInternalSecret;
    }

    if (originalTikaBaseUrl === undefined) {
      delete process.env.ATLAS_KB_TIKA_BASE_URL;
    } else {
      process.env.ATLAS_KB_TIKA_BASE_URL = originalTikaBaseUrl;
    }

    globalThis.fetch = originalFetch;
    setKnowledgeFilesystemFactoryForTests();
    setKnowledgeStoragePrefixFilesystemFactoryForTests();
    await rm(knowledgeDataDir, { force: true, recursive: true });
  });

  it.serial(
    "uses UUID point ids for template export search indexing",
    async () => {
      const sourceChunkId = buildTemplateExportChunkId({
        scope: "source",
        filePath: "/source/预算调整请示.pdf",
        ordinal: 0,
      });
      const referenceChunkId = buildTemplateExportChunkId({
        scope: "reference",
        filePath: "/references/nbyj/history.md",
        ordinal: 3,
      });

      expect(sourceChunkId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(referenceChunkId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(sourceChunkId).not.toBe(referenceChunkId);
    },
  );

  it.serial(
    "learns source and reference libraries into template export context before extraction",
    async () => {
      const promptBucket: string[] = [];
      const toolPayloadBucket: string[] = [];
      const user = await ensureDefaultUser();
      const collection = await createKnowledgeCollection({
        userId: user.id,
        input: {
          id: "template-export-source",
          name: "Template Export Source",
          description: "source docs for template export",
        },
      });
      const importResult = await importKnowledgeFile({
        userId: user.id,
        collectionId: collection.id,
        file: new File(
          [new Uint8Array([0x25, 0x50, 0x44, 0x46])],
          "预算调整请示.pdf",
          {
            type: "application/pdf",
          },
        ),
        input: {},
      });
      await waitForPendingKnowledgeImports();
      const sourceDocumentId = importResult.source.documentId;

      if (!sourceDocumentId) {
        throw new Error("expected imported source documentId");
      }

      await importKnowledgeText({
        userId: user.id,
        collectionId: collection.id,
        input: {
          sourceFilename: "其他资料.txt",
          content: "这份资料不应被挂到 /source 里。",
        },
      });

      const sourcePath = "/source/预算调整请示.pdf";
      const libraryPath = "/references/ops/manuals/guide.md";

      await mkdir(join(storagePrefixDir, "ops", "manuals"), {
        recursive: true,
      });
      await writeFile(
        join(storagePrefixDir, "ops", "manuals", "guide.md"),
        "模板手册中的拟办意见范例：建议财务部门核对预算依据后办理。",
      );

      mockTemplateExportProviders({
        promptBucket,
        toolPayloadBucket,
        sourcePath,
        libraryPath,
      });

      const result = await generateKnowledgeTemplateExportPayload({
        userId: user.id,
        sourceId: importResult.source.id,
        template: createTemplateDetail(),
      });

      expect(result.parameters).toEqual({
        document_title: "关于预算调整的请示",
        opinion: "建议财务部门核对预算依据后办理。",
      });
      const prompt = promptBucket.join("\n");

      expect(prompt).toContain("/source 是本次导出工作的事实依据目录");
      expect(prompt).toContain("/source 之外的其他挂载目录都是参考资料目录");
      expect(prompt).toContain(
        "当前已挂载的参考资料目录：/references/ops/manuals",
      );
      expect(prompt).toContain("参考资料根目录：/references");
      expect(prompt).toContain("参考资料挂载目录：");
      expect(prompt).toContain(
        "/references/ops/manuals：资料库名称=办公室手册；仅供参考",
      );
      expect(prompt).toContain("/source 目录文件：/source/预算调整请示.pdf");
      expect(prompt).not.toContain("/source/其他资料.txt");
      expect(prompt).toContain("请结合资料内容和参考资料库生成拟办意见。");
      expect(prompt).toContain(
        "模板信息：\n- 模板名称：拟办意见\n- 模板系统提示词：\n请结合资料内容和参考资料库生成拟办意见。",
      );
      expect(prompt).toContain("字段说明：");
      expect(prompt).toContain(
        "document_title：字段标签=文件标题；字段说明=提取当前公文标题",
      );
      expect(prompt).toContain(
        "opinion：字段标签=拟办意见；字段说明=给出拟办建议",
      );
      expect(prompt).not.toContain("/__template_export__");
      const toolPayload = toolPayloadBucket.join("\n");

      expect(toolPayload).toContain("mastra_workspace_search");
      expect(toolPayload).toContain("hybrid search");
      expect(toolPayload).toContain(sourcePath);
      expect(toolPayload).toContain(libraryPath);
      expect(toolPayload).toContain("预算调整请示 extracted content");
    },
  );

  it.serial(
    "exports from a processing source when the selected file is already available",
    async () => {
      const promptBucket: string[] = [];
      const toolPayloadBucket: string[] = [];
      const user = await ensureDefaultUser();
      const collection = await createKnowledgeCollection({
        userId: user.id,
        input: {
          id: "template-export-processing-source",
          name: "Processing Source",
          description: "processing source export",
        },
      });
      const sourceFilename = "待处理请示.pdf";
      const sourceBasePath = join(workspaceFilesDir, user.id, collection.id);

      await mkdir(sourceBasePath, {
        recursive: true,
      });
      await writeFile(
        join(sourceBasePath, sourceFilename),
        new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      );

      const source = await createKnowledgeSourceRecord({
        userId: user.id,
        collectionId: collection.id,
        documentId: sourceFilename,
        sourceFilename,
        sourceType: "file",
        mimeType: "application/pdf",
        byteSize: 4,
        status: "processing",
      });

      await mkdir(join(storagePrefixDir, "ops", "manuals"), {
        recursive: true,
      });
      await writeFile(
        join(storagePrefixDir, "ops", "manuals", "guide.md"),
        "模板手册中的拟办意见范例：建议财务部门核对预算依据后办理。",
      );

      mockTemplateExportProviders({
        promptBucket,
        toolPayloadBucket,
        sourcePath: "/source/待处理请示.pdf",
        libraryPath: "/references/ops/manuals/guide.md",
      });

      const result = await generateKnowledgeTemplateExportPayload({
        userId: user.id,
        sourceId: source.id,
        template: createTemplateDetail(),
      });

      expect(result.parameters).toEqual({
        document_title: "关于预算调整的请示",
        opinion: "建议财务部门核对预算依据后办理。",
      });
      expect(promptBucket.join("\n")).toContain(
        "/source 目录文件：/source/待处理请示.pdf",
      );
      expect(toolPayloadBucket.join("\n")).toContain(
        "待处理请示 extracted content",
      );
    },
  );

  it.serial(
    "fails strictly when the model does not return valid JSON",
    async () => {
      const promptBucket: string[] = [];
      const toolPayloadBucket: string[] = [];
      const user = await ensureDefaultUser();
      const collection = await createKnowledgeCollection({
        userId: user.id,
        input: {
          id: "template-export-invalid-json",
          name: "Invalid JSON Source",
          description: "invalid json test",
        },
      });
      const importResult = await importKnowledgeText({
        userId: user.id,
        collectionId: collection.id,
        input: {
          sourceFilename: "预算调整请示.txt",
          content:
            "来文单位为综合办公室，文件标题为关于预算调整的请示，需要财务部门尽快核对预算依据。",
        },
      });
      const sourceDocumentId = importResult.source.documentId;

      if (!sourceDocumentId) {
        throw new Error("expected imported source documentId");
      }

      await mkdir(join(storagePrefixDir, "ops", "manuals"), {
        recursive: true,
      });
      await writeFile(
        join(storagePrefixDir, "ops", "manuals", "guide.md"),
        "模板手册中的拟办意见范例：建议财务部门核对预算依据后办理。",
      );

      mockTemplateExportProviders({
        promptBucket,
        toolPayloadBucket,
        sourcePath: "/source/预算调整请示.txt",
        libraryPath: "/references/ops/manuals/guide.md",
        invalidStructuredOutput: true,
      });

      await expect(
        generateKnowledgeTemplateExportPayload({
          userId: user.id,
          sourceId: importResult.source.id,
          template: createTemplateDetail(),
        }),
      ).rejects.toThrow("模板导出暂时不可用，请稍后重试。");
    },
  );

  it.serial(
    "fails when a reference library is mounted but has no learned files",
    async () => {
      const user = await ensureDefaultUser();
      const collection = await createKnowledgeCollection({
        userId: user.id,
        input: {
          id: "template-export-empty-library",
          name: "Empty Library Source",
          description: "empty library test",
        },
      });
      const importResult = await importKnowledgeText({
        userId: user.id,
        collectionId: collection.id,
        input: {
          sourceFilename: "预算调整请示.txt",
          content: "关于预算调整的请示",
        },
      });

      await mkdir(join(storagePrefixDir, "ops", "manuals"), {
        recursive: true,
      });

      await expect(
        generateKnowledgeTemplateExportPayload({
          userId: user.id,
          sourceId: importResult.source.id,
          template: createTemplateDetail(),
        }),
      ).rejects.toThrow("挂载后没有任何可学习文件");
    },
  );

  it.serial("rejects reference library mount path conflicts", async () => {
    const user = await ensureDefaultUser();
    const collection = await createKnowledgeCollection({
      userId: user.id,
      input: {
        id: "tpl-export-mount-conflict",
        name: "Mount Conflict Source",
        description: "mount conflict test",
      },
    });
    const importResult = await importKnowledgeText({
      userId: user.id,
      collectionId: collection.id,
      input: {
        sourceFilename: "预算调整请示.txt",
        content: "关于预算调整的请示",
      },
    });
    const template = createTemplateDetail();
    template.referenceLibraries = [
      {
        id: "lib-conflict-1",
        name: "冲突资料库一",
        storagePrefix: "ops/manuals",
        fileCount: 1,
      },
      {
        id: "lib-conflict-2",
        name: "冲突资料库二",
        storagePrefix: "ops/manuals/child",
        fileCount: 1,
      },
    ];

    await expect(
      generateKnowledgeTemplateExportPayload({
        userId: user.id,
        sourceId: importResult.source.id,
        template,
      }),
    ).rejects.toThrow("模板资料库挂载路径冲突");
  });
});
