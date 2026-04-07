import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  answerKnowledgeQuestion,
  createChatReply,
  createChatSession,
  createKnowledgeCollection,
  createUser,
  ensureDefaultUser,
  importKnowledgeFiles,
  importKnowledgeText,
  LocalFilesystem,
  resetKnowledgeRepository,
  resetKnowledgeRuntimeCache,
  saveMessageFeedback,
  searchKnowledge,
  setKnowledgeFilesystemFactoryForTests,
  waitForPendingKnowledgeImports,
} from "./index";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalEmbeddingApiKey = process.env.EMBEDDING_API_KEY;
const originalDataDir = process.env.ATLAS_KB_DATA_DIR;
const originalQdrantUrl = process.env.QDRANT_URL;
const originalS3Endpoint = process.env.ATLAS_KB_S3_ENDPOINT;
const originalS3Region = process.env.ATLAS_KB_S3_REGION;
const originalS3Bucket = process.env.ATLAS_KB_S3_BUCKET;
const originalS3AccessKeyId = process.env.ATLAS_KB_S3_ACCESS_KEY_ID;
const originalS3SecretAccessKey = process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY;

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
      return jsonResponse({
        result: {
          points: [],
          status: "ok",
        },
      });
    }

    if (url.includes("chat/completions")) {
      if (!hasToolReply) {
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

describe("@atlas-kb/mastra workspace search flow", () => {
  let knowledgeDataDir = "";
  let workspaceFilesDir = "";

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-mastra-test-"));
    workspaceFilesDir = join(knowledgeDataDir, "workspace-files");
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    process.env.QDRANT_URL = "http://127.0.0.1:6333";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.EMBEDDING_API_KEY = "test-embedding-key";
    process.env.ATLAS_KB_S3_ENDPOINT = "http://127.0.0.1:9000";
    process.env.ATLAS_KB_S3_REGION = "us-east-1";
    process.env.ATLAS_KB_S3_BUCKET = "atlas-kb-test";
    process.env.ATLAS_KB_S3_ACCESS_KEY_ID = "test-access-key";
    process.env.ATLAS_KB_S3_SECRET_ACCESS_KEY = "test-secret-key";
    resetKnowledgeRuntimeCache();
    await resetKnowledgeRepository();
    setKnowledgeFilesystemFactoryForTests(({ userId, collectionId }) => {
      return new LocalFilesystem({
        basePath: join(workspaceFilesDir, userId, collectionId),
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

    if (originalEmbeddingApiKey === undefined) {
      delete process.env.EMBEDDING_API_KEY;
    } else {
      process.env.EMBEDDING_API_KEY = originalEmbeddingApiKey;
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

    globalThis.fetch = originalFetch;
    setKnowledgeFilesystemFactoryForTests();
    await rm(knowledgeDataDir, { force: true, recursive: true });
  });

  it("returns hits only from the requested collection and current user", async () => {
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
  });

  it("answers from searched citations", async () => {
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
  });

  it("persists assistant replies when creating a chat reply", async () => {
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

    expect(reply.assistantMessage.content).toBeTruthy();
    expect(reply.assistantMessage.createdAt).toBeTruthy();
  });

  it("lists workspace files through the native workspace tool", async () => {
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
  });

  it("saves feedback on assistant replies", async () => {
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

  it("maps listed workspace files back to real workspace filenames", async () => {
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
  });
});
