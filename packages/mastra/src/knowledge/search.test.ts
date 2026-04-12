import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKnowledgeAgent } from "../agents";
import {
  answerKnowledgeQuestion,
  createChatReply,
  createChatSession,
  createKnowledgeCollection,
  createUser,
  ensureDefaultUser,
  importKnowledgeText,
  listChatMessages,
  listChatSessions,
  resetKnowledgeRepository,
  resetKnowledgeRuntimeCache,
  saveMessageFeedback,
  searchKnowledge,
  setKnowledgeFilesystemFactoryForTests,
  waitForPendingKnowledgeImports,
} from "./index";
import { importKnowledgeFiles } from "./ingest";
import { buildMockQdrantResponse } from "./test-qdrant";
import { TestS3LocalFilesystem } from "./test-s3-filesystem";
import { buildMockTikaExtractPayload } from "./test-tika";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalOpenAIModel = process.env.OPENAI_MODEL;
const originalRuntimeProvider = process.env.RUNTIME_PROVIDER;
const originalRuntimeModel = process.env.RUNTIME_MODEL;
const originalChatTitleModel = process.env.ATLAS_KB_CHAT_TITLE_MODEL;
const originalEmbeddingApiKey = process.env.EMBEDDING_API_KEY;
const originalEmbeddingMinIntervalMs = process.env.EMBEDDING_MIN_INTERVAL_MS;
const originalDataDir = process.env.ATLAS_KB_DATA_DIR;
const originalQdrantUrl = process.env.QDRANT_URL;
const originalS3Endpoint = process.env.ATLAS_KB_S3_ENDPOINT;
const originalS3Region = process.env.ATLAS_KB_S3_REGION;
const originalS3Bucket = process.env.ATLAS_KB_S3_BUCKET;
const originalS3AccessKeyId = process.env.ATLAS_KB_S3_ACCESS_KEY_ID;
const originalS3SecretAccessKey = process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY;
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

function readChatCompletionMessageContent(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }

  if ("content" in message) {
    return readMessageText((message as { content?: unknown }).content);
  }

  return "";
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
  toolCallId: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
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
  toolCallId: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
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

function buildFinalAnswer(query: string): string {
  if (/leave requests/i.test(query)) {
    return "基于证据的回答：human resources finally records leave requests.";
  }

  if (/malware incidents/i.test(query)) {
    return "基于证据的回答：the infosec team handles malware incidents.";
  }

  if (/contract clause review/i.test(query)) {
    return "基于证据的回答：the legal team owns contract clause review.";
  }

  if (/有哪些文件|哪些资料|哪些文档/.test(query)) {
    return "当前资料包括：请示通知、会议纪要。";
  }

  return `基于证据的回答：${query}`;
}

function parseWorkspaceListFilesResult(result: string): string[] {
  const treeLines = result.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return false;
    }

    if (trimmed === ".") {
      return true;
    }

    return !/^\d+\s+directories?,\s+\d+\s+files?$/.test(trimmed);
  });
  const entries = treeLines
    .map((rawLine) => {
      const line = rawLine.replace(/\t/g, "  ");
      const trimmed = line.trim();

      if (!trimmed) {
        return undefined;
      }

      return {
        depth: Math.floor((line.match(/^\s*/)?.[0].length ?? 0) / 2),
        name: trimmed,
      };
    })
    .filter((value): value is { depth: number; name: string } =>
      Boolean(value),
    );
  const stack: string[] = [];
  const files: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;

    if (entry.name === ".") {
      continue;
    }

    const nextEntry = entries[index + 1];
    const isDirectory = Boolean(nextEntry && nextEntry.depth > entry.depth);

    if (isDirectory) {
      stack[entry.depth] = entry.name.replace(/\/$/, "");
      stack.length = entry.depth + 1;
      continue;
    }

    const path = [...stack.slice(0, entry.depth), entry.name]
      .filter(Boolean)
      .join("/");

    if (path) {
      files.push(path);
    }
  }

  return files;
}

function readToolMessageContent(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }

  if ("content" in message) {
    return readMessageText((message as { content?: unknown }).content);
  }

  return "";
}

function readUnknownText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => readUnknownText(item))
      .filter(Boolean)
      .join("\n");
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  return Object.values(value as Record<string, unknown>)
    .map((item) => readUnknownText(item))
    .filter(Boolean)
    .join("\n");
}

function buildToolDrivenAnswer(args: { messages: unknown[]; query: string }) {
  if (/有哪些文件|哪些资料|哪些文档/.test(args.query)) {
    const listedFiles = args.messages.flatMap((message) => {
      if (!message || typeof message !== "object") {
        return [];
      }

      if (
        "role" in message &&
        (message as { role?: unknown }).role === "tool"
      ) {
        return parseWorkspaceListFilesResult(readToolMessageContent(message));
      }

      if (
        "type" in message &&
        (message as { type?: unknown }).type === "function_call_output"
      ) {
        return parseWorkspaceListFilesResult(
          readUnknownText((message as { output?: unknown }).output),
        );
      }

      return [];
    });
    const fallbackFiles =
      listedFiles.length > 0
        ? listedFiles
        : [
            ...new Set(
              readUnknownText(args.messages).match(
                /[\p{L}\p{N}][\p{L}\p{N} ._()-]*\.(?:txt|md|html|json|csv)/gu,
              ) ?? [],
            ),
          ];

    return fallbackFiles.length > 0
      ? `当前资料包括：${fallbackFiles.join("、")}。`
      : "当前资料文件夹为空。";
  }

  return buildFinalAnswer(args.query);
}

function mockProviders() {
  mockProvidersWithOptions();
}

function mockProvidersWithOptions(options?: {
  bareOpenAIFileListAnswer?: boolean;
}) {
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
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastMessage = messages[messages.length - 1];
    const lastUserMessage = [...messages]
      .reverse()
      .find(
        (message): message is { content?: unknown; role: string } =>
          Boolean(message) &&
          typeof message === "object" &&
          "role" in message &&
          (message as { role?: unknown }).role === "user",
      );
    const query = readChatCompletionMessageContent(lastUserMessage);
    const hasToolReply = messages.some(
      (message) =>
        Boolean(message) &&
        typeof message === "object" &&
        "role" in message &&
        (message as { role?: unknown }).role === "tool",
    );
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

    if (url.includes("chat/completions")) {
      if (!hasToolReply) {
        if (
          options?.bareOpenAIFileListAnswer &&
          /有哪些文件|哪些资料|哪些文档/.test(query)
        ) {
          return jsonResponse({
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: "",
                },
              },
            ],
          });
        }

        if (/有哪些文件|哪些资料|哪些文档/.test(query)) {
          return buildToolCallResponse({
            toolCallId: "call_list_files",
            toolName: "mastra_workspace_list_files",
            toolArguments: {
              path: ".",
            },
          });
        }

        return buildToolCallResponse({
          toolCallId: "call_search",
          toolName: "mastra_workspace_search",
          toolArguments: {
            query,
            topK: 5,
            mode: "hybrid",
          },
        });
      }

      return jsonResponse({
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: buildToolDrivenAnswer({
                messages,
                query,
              }),
            },
          },
        ],
      });
    }

    if (url.includes("/responses")) {
      if (!hasResponseFunctionOutput(body.input)) {
        if (
          options?.bareOpenAIFileListAnswer &&
          /有哪些文件|哪些资料|哪些文档/.test(responseInputText)
        ) {
          return jsonResponse({
            id: "resp_empty",
            object: "response",
            created_at: Date.now(),
            model: "openai/gpt-5.4",
            output: [],
            output_text: "",
            usage: {
              input_tokens: 16,
              output_tokens: 0,
              total_tokens: 16,
            },
          });
        }

        if (/有哪些文件|哪些资料|哪些文档/.test(responseInputText)) {
          return buildResponsesToolCall({
            toolCallId: "call_list_files",
            toolName: "mastra_workspace_list_files",
            toolArguments: {
              path: ".",
            },
          });
        }

        return buildResponsesToolCall({
          toolCallId: "call_search",
          toolName: "mastra_workspace_search",
          toolArguments: {
            query: responseInputText,
            topK: 5,
            mode: "hybrid",
          },
        });
      }

      const answer = /有哪些文件|哪些资料|哪些文档/.test(responseInputText)
        ? buildToolDrivenAnswer({
            messages: Array.isArray(body.input) ? body.input : [],
            query: responseInputText,
          })
        : buildFinalAnswer(responseInputText);

      return jsonResponse({
        id: "resp_test",
        object: "response",
        created_at: Date.now(),
        model: "openai/gpt-5.4",
        output: [
          {
            type: "message",
            id: "msg_test",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: answer,
                annotations: [],
              },
            ],
          },
        ],
        output_text: answer,
        usage: {
          input_tokens: 48,
          output_tokens: 24,
          total_tokens: 72,
        },
      });
    }

    return jsonResponse({
      choices: [
        {
          index: 0,
          message: {
            content: buildFinalAnswer(
              query || readMessageText(lastMessage?.content),
            ),
          },
        },
      ],
    });
  }) as typeof fetch;
}

describe.serial("@atlas-kb/mastra workspace search flow", () => {
  let knowledgeDataDir = "";
  let workspaceFilesDir = "";

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-mastra-test-"));
    workspaceFilesDir = join(knowledgeDataDir, "workspace-files");
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    process.env.QDRANT_URL = "http://127.0.0.1:6333";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_MODEL = "gpt-5.4";
    process.env.ATLAS_KB_CHAT_TITLE_MODEL = "qwen-flash";
    process.env.RUNTIME_PROVIDER = "openai";
    delete process.env.RUNTIME_MODEL;
    process.env.EMBEDDING_API_KEY = "test-embedding-key";
    process.env.EMBEDDING_MIN_INTERVAL_MS = "1";
    process.env.ATLAS_KB_S3_ENDPOINT = "http://127.0.0.1:9000";
    process.env.ATLAS_KB_S3_REGION = "us-east-1";
    process.env.ATLAS_KB_S3_BUCKET = "atlas-kb-test";
    process.env.ATLAS_KB_S3_ACCESS_KEY_ID = "test-access-key";
    process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.ATLAS_KB_TIKA_BASE_URL = "http://tika.local";
    resetKnowledgeRuntimeCache();
    await resetKnowledgeRepository();
    setKnowledgeFilesystemFactoryForTests(({ userId, collectionId }) => {
      return new TestS3LocalFilesystem({
        basePath: join(workspaceFilesDir, userId, collectionId),
        prefix: `${userId}/${collectionId}`,
      });
    });
    mockProviders();
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

    if (originalChatTitleModel === undefined) {
      delete process.env.ATLAS_KB_CHAT_TITLE_MODEL;
    } else {
      process.env.ATLAS_KB_CHAT_TITLE_MODEL = originalChatTitleModel;
    }

    if (originalRuntimeProvider === undefined) {
      delete process.env.RUNTIME_PROVIDER;
    } else {
      process.env.RUNTIME_PROVIDER = originalRuntimeProvider;
    }

    if (originalRuntimeModel === undefined) {
      delete process.env.RUNTIME_MODEL;
    } else {
      process.env.RUNTIME_MODEL = originalRuntimeModel;
    }

    if (originalEmbeddingApiKey === undefined) {
      delete process.env.EMBEDDING_API_KEY;
    } else {
      process.env.EMBEDDING_API_KEY = originalEmbeddingApiKey;
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

    if (originalTikaBaseUrl === undefined) {
      delete process.env.ATLAS_KB_TIKA_BASE_URL;
    } else {
      process.env.ATLAS_KB_TIKA_BASE_URL = originalTikaBaseUrl;
    }

    globalThis.fetch = originalFetch;
    setKnowledgeFilesystemFactoryForTests();
    await rm(knowledgeDataDir, { force: true, recursive: true });
  });

  it.serial(
    "returns hits only from the requested collection and current user",
    async () => {
      const alpha = await ensureDefaultUser();
      const beta = await createUser({
        username: "beta-search",
        password: "beta-pass",
      });

      const alphaCollection = await createKnowledgeCollection({
        userId: alpha.id,
        input: {
          id: "alpha-search",
          name: "Alpha Search",
          description: "alpha private notes",
        },
      });
      const betaCollection = await createKnowledgeCollection({
        userId: beta.id,
        input: {
          id: "beta-search",
          name: "Beta Search",
          description: "beta private notes",
        },
      });

      await importKnowledgeText({
        userId: alpha.id,
        collectionId: alphaCollection.id,
        input: {
          title: "Alpha Doc",
          content: "alpha unique keyword is only visible to alpha user.",
        },
      });
      await importKnowledgeText({
        userId: beta.id,
        collectionId: betaCollection.id,
        input: {
          title: "Beta Doc",
          content: "beta unique keyword is only visible to beta user.",
        },
      });

      const alphaResult = await searchKnowledge(
        {
          query: "alpha unique keyword",
          collectionId: alphaCollection.id,
        },
        {
          userId: alpha.id,
        },
      );

      expect(alphaResult.total).toBe(1);
      expect(alphaResult.hits[0]?.title).toBe("Alpha Doc");
      expect(alphaResult.hits[0]?.collectionId).toBe(alphaCollection.id);
    },
  );

  it.serial("answers from searched citations", async () => {
    const user = await ensureDefaultUser();
    const collection = await createKnowledgeCollection({
      userId: user.id,
      input: {
        id: "workspace-answer",
        name: "Workspace Answer",
        description: "answer tests",
      },
    });

    await importKnowledgeText({
      userId: user.id,
      collectionId: collection.id,
      input: {
        title: "制度说明",
        summary: "请假流程说明",
        content:
          "Leave requests are reviewed by the department manager and finally recorded by human resources.",
      },
    });

    const result = await answerKnowledgeQuestion(
      {
        question: "Who finally records leave requests?",
        collectionId: collection.id,
      },
      {
        userId: user.id,
      },
    );

    expect(result.answer).toBeTruthy();
    expect(result.mode).toBe("model");
    await expect(listChatSessions(user.id)).resolves.toHaveLength(0);
  });

  it.serial(
    "persists assistant replies when creating a chat reply",
    async () => {
      const user = await ensureDefaultUser();
      const collection = await createKnowledgeCollection({
        userId: user.id,
        input: {
          id: "chat-search",
          name: "Chat Search",
          description: "chat tests",
        },
      });

      await importKnowledgeText({
        userId: user.id,
        collectionId: collection.id,
        input: {
          title: "部门职责",
          content:
            "Malware incidents on office devices are handled by the infosec team.",
        },
      });

      const session = await createChatSession({
        userId: user.id,
        collectionId: collection.id,
      });

      const reply = await createChatReply({
        userId: user.id,
        sessionId: session.id,
        input: {
          query: "Who handles malware incidents?",
        },
      });
      const messages = await listChatMessages(user.id, session.id);

      expect(reply.assistantMessage.content).toBeTruthy();
      expect(reply.assistantMessage.createdAt).toBeTruthy();
      expect(messages).toHaveLength(2);
      expect(messages[0]?.role).toBe("user");
      expect(messages[0]?.content).toBe("Who handles malware incidents?");
      expect(messages[1]?.role).toBe("assistant");
      expect(messages[1]?.content).toBe(reply.assistantMessage.content);
    },
  );

  it.serial(
    "reuses a single placeholder session for the same collection",
    async () => {
      const user = await ensureDefaultUser();
      const collection = await createKnowledgeCollection({
        userId: user.id,
        input: {
          id: "chat-placeholder-singleton",
          name: "Chat Placeholder Singleton",
          description: "placeholder chat tests",
        },
      });

      const [firstSession, secondSession] = await Promise.all([
        createChatSession({
          userId: user.id,
          collectionId: collection.id,
        }),
        createChatSession({
          userId: user.id,
          collectionId: collection.id,
        }),
      ]);
      const sessions = await listChatSessions(user.id, collection.id);

      expect(firstSession.id).toBe(secondSession.id);
      expect(
        sessions.filter((session) => session.title === "新建会话"),
      ).toHaveLength(1);
    },
  );

  it.serial(
    "renames the placeholder session after the first reply and truncates the generated title",
    async () => {
      const user = await ensureDefaultUser();
      const collection = await createKnowledgeCollection({
        userId: user.id,
        input: {
          id: "chat-title-generation",
          name: "Chat Title Generation",
          description: "chat title tests",
        },
      });

      await importKnowledgeText({
        userId: user.id,
        collectionId: collection.id,
        input: {
          title: "通知说明",
          content: "Budget adjustments should be reviewed by the finance team.",
        },
      });

      const session = await createChatSession({
        userId: user.id,
        collectionId: collection.id,
      });
      const longQuery =
        "关于预算调整审批流程和跨部门协同安排的详细说明需要怎么整理归档并形成正式口径";

      delete process.env.OPENAI_API_KEY;

      const reply = await createChatReply({
        userId: user.id,
        sessionId: session.id,
        input: {
          query: longQuery,
        },
      });

      expect(reply.session.title).toBe(longQuery.slice(0, 30));
      expect(reply.session.title).not.toBe("新建会话");
      expect(reply.session.title.includes("对话")).toBe(false);
      expect(reply.session.title.length).toBeLessThanOrEqual(30);
    },
  );

  it.serial(
    "lists workspace files through the native workspace tool",
    async () => {
      const user = await ensureDefaultUser();
      const collection = await createKnowledgeCollection({
        userId: user.id,
        input: {
          id: "chat-list-files",
          name: "Chat List Files",
          description: "file listing tests",
        },
      });

      const fileImport = await importKnowledgeFiles({
        userId: user.id,
        collectionId: collection.id,
        files: [
          new File(
            ["2026 年机关党建工作会议通知。"],
            "2026年全市机关党的建设工作暨纪检工作会议通知.txt",
            {
              type: "text/plain",
            },
          ),
        ],
        input: {},
      });

      const session = await createChatSession({
        userId: user.id,
        collectionId: collection.id,
      });

      const reply = await createChatReply({
        userId: user.id,
        sessionId: session.id,
        input: {
          query: "我们现在有哪些文件？",
        },
      });

      expect(fileImport.results[0]?.accepted).toBe(true);
      expect(reply.assistantMessage.content).toContain(
        "2026年全市机关党的建设工作暨纪检工作会议通知.txt",
      );
    },
  );

  it.serial(
    "guides the knowledge agent to investigate with tools before concluding",
    async () => {
      const agent = createKnowledgeAgent({
        assistantRole: {
          id: "builtin-default-knowledge-assistant",
          name: "政策研判助手",
          systemPrompt: "回答前先抽出关键事实。",
          stylePrompt: "先给结论，再列依据。",
          isBuiltin: true,
          isDefault: true,
        },
        collectionId: "research-space",
        workspace: {} as never,
      });
      const instructions = await agent.getInstructions();
      const text = Array.isArray(instructions)
        ? instructions
            .map((item) => {
              if (typeof item === "string") {
                return item;
              }

              return "content" in item ? JSON.stringify(item.content) : "";
            })
            .join("\n")
        : typeof instructions === "string"
          ? instructions
          : "content" in instructions
            ? JSON.stringify(instructions.content)
            : "";

      expect(String(text)).toContain(
        "先使用你现有的工具查看当前工作区中的实际内容",
      );
      expect(String(text)).toContain("角色定位：");
      expect(String(text)).toContain("工作流程：");
      expect(String(text)).toContain("当前角色：政策研判助手");
      expect(String(text)).toContain("角色补充要求：");
      expect(String(text)).toContain("表达风格要求：");
      expect(String(text)).toContain("底层约束：");
      expect(String(text)).toContain(
        "如果你还没有查看工具结果，不要直接下结论",
      );
      expect(String(text)).toContain("请查看文件列表");
      expect(String(text)).toContain("不要主动暴露内部标识、集合 id");
      expect(String(text)).not.toContain(
        '当前绑定的资料文件夹是 "research-space"',
      );
      expect(String(text)).not.toContain("当前优先文件：");
    },
  );

  it.serial(
    "keeps private roles style-only when no role supplement prompt is configured",
    async () => {
      const agent = createKnowledgeAgent({
        assistantRole: {
          id: "private-role-1",
          name: "我的审校风格",
          systemPrompt: "",
          stylePrompt: "使用正式短句，先给结论。",
          isBuiltin: false,
          isDefault: false,
        },
        collectionId: "research-space",
        workspace: {} as never,
      });
      const instructions = await agent.getInstructions();
      const text = Array.isArray(instructions)
        ? instructions
            .map((item) => {
              if (typeof item === "string") {
                return item;
              }

              return "content" in item ? JSON.stringify(item.content) : "";
            })
            .join("\n")
        : typeof instructions === "string"
          ? instructions
          : "content" in instructions
            ? JSON.stringify(instructions.content)
            : "";

      expect(String(text)).toContain("当前角色：我的审校风格");
      expect(String(text)).toContain("表达风格要求：");
      expect(String(text)).not.toContain("角色补充要求：");
    },
  );

  it.serial(
    "logs diagnostics when gpt-5.4 returns an empty file-list answer without using tools",
    async () => {
      mockProvidersWithOptions({
        bareOpenAIFileListAnswer: true,
      });

      const user = await ensureDefaultUser();
      const collection = await createKnowledgeCollection({
        userId: user.id,
        input: {
          id: "gpt54-empty-file-list",
          name: "GPT 5.4 Empty File List",
          description: "fallback diagnostics",
        },
      });

      await importKnowledgeText({
        userId: user.id,
        collectionId: collection.id,
        input: {
          title: "请示通知",
          content: "first document body",
        },
      });

      const session = await createChatSession({
        userId: user.id,
        collectionId: collection.id,
      });

      const originalConsoleError = console.error;
      const errorLogs: unknown[][] = [];
      console.error = (...args: unknown[]) => {
        errorLogs.push(args);
      };

      try {
        const reply = await createChatReply({
          userId: user.id,
          sessionId: session.id,
          input: {
            query: "当前我们有哪些文件？",
          },
        });

        expect(reply.assistantMessage.content).toBe(
          "没有在当前资料文件夹中找到能直接回答该问题的证据。你可以换个问法，或者先导入更相关的资料。",
        );
      } finally {
        console.error = originalConsoleError;
      }

      expect(errorLogs.length).toBeGreaterThan(0);
      expect(String(errorLogs[0]?.[0])).toContain(
        "[knowledge-agent] empty-evidence fallback",
      );
      expect(JSON.stringify(errorLogs[0]?.[1])).toContain("openai/gpt-5.4");
      expect(JSON.stringify(errorLogs[0]?.[1])).toContain(collection.id);
    },
  );

  it.serial("saves feedback on assistant replies", async () => {
    const user = await ensureDefaultUser();
    const collection = await createKnowledgeCollection({
      userId: user.id,
      input: {
        id: "feedback-space",
        name: "Feedback Space",
        description: "feedback tests",
      },
    });

    await importKnowledgeText({
      userId: user.id,
      collectionId: collection.id,
      input: {
        title: "部门职责",
        content: "Supplier contract clause review is owned by the legal team.",
      },
    });

    const session = await createChatSession({
      userId: user.id,
      collectionId: collection.id,
    });
    const reply = await createChatReply({
      userId: user.id,
      sessionId: session.id,
      input: {
        query: "Who owns contract clause review?",
      },
    });

    const feedback = await saveMessageFeedback({
      userId: user.id,
      messageId: reply.assistantMessage.id,
      input: {
        rating: "up",
      },
    });

    expect(feedback.rating).toBe("up");
  });

  it.serial(
    "maps listed workspace files back to real workspace filenames",
    async () => {
      const user = await ensureDefaultUser();
      const collection = await createKnowledgeCollection({
        userId: user.id,
        input: {
          id: "catalog-space",
          name: "Catalog Space",
          description: "catalog tests",
        },
      });

      await importKnowledgeText({
        userId: user.id,
        collectionId: collection.id,
        input: {
          title: "请示通知",
          content: "first document body",
        },
      });
      await importKnowledgeText({
        userId: user.id,
        collectionId: collection.id,
        input: {
          title: "会议纪要",
          content: "second document body",
        },
      });

      const session = await createChatSession({
        userId: user.id,
        collectionId: collection.id,
      });
      const reply = await createChatReply({
        userId: user.id,
        sessionId: session.id,
        input: {
          query: "我们有哪些文件？",
        },
      });

      expect(reply.assistantMessage.content).toContain("请示通知.txt");
      expect(reply.assistantMessage.content).toContain("会议纪要.txt");
    },
  );
});
