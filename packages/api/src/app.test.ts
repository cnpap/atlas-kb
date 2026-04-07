import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createUser,
  getDefaultPassword,
  getDefaultUsername,
  LocalFilesystem,
  resetKnowledgeRepository,
  resetKnowledgeRuntimeCache,
  setKnowledgeFilesystemFactoryForTests,
  waitForPendingKnowledgeImports,
} from "@atlas-kb/mastra/knowledge";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";

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

function getWorkspaceFilePath(args: {
  collectionId: string;
  relativePath: string;
  rootDir: string;
  userId: string;
}) {
  return join(args.rootDir, args.userId, args.collectionId, args.relativePath);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createSseResponse(chunks: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
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

async function readTextRequestBody(value: unknown): Promise<string> {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }

  if (value instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(value));
  }

  if (value instanceof Blob) {
    return value.text();
  }

  return "";
}

function mockProviders() {
  const templateDetail = {
    id: "template-1",
    name: "拟办意见",
    templateType: "xlsx",
    sourceFilename: "文件阅办单.xlsx",
    fieldCount: 2,
    referenceLibraryCount: 0,
    parsedAt: "2026-04-07T15:10:24.000Z",
    updatedAt: "2026-04-07T15:10:24.000Z",
    systemPrompt: "请提取字段后生成结构化内容。",
    fields: [
      {
        id: "field-1",
        name: "document_title",
        label: "文件标题",
        description: "",
        sortOrder: 1,
        locations: [],
      },
      {
        id: "field-2",
        name: "opinion",
        label: "拟办意见",
        description: "",
        sortOrder: 2,
        locations: [],
      },
    ],
    referenceLibraries: [],
  };
  const adminExportTasks = new Map<
    string,
    {
      canEdit: boolean;
      completedAt?: string;
      createdAt: string;
      exportFile?: {
        byteSize: number;
        createdAt: string;
        downloadUrl: string;
        id: string;
        mimeType: string;
        outputFilename: string;
        templateId: string;
      };
      failedAt?: string;
      failureMessage?: string;
      id: string;
      ownerUserId: string;
      parameters: Record<string, string>;
      sourceId: string;
      sourceTitle: string;
      startedAt?: string;
      status: "completed" | "failed" | "pending" | "processing";
      taskType: string;
      template: typeof templateDetail;
      templateId: string;
      templateName: string;
      updatedAt: string;
    }
  >();
  adminExportTasks.set("task-existing", {
    id: "task-existing",
    ownerUserId: "1",
    sourceId: "source-existing",
    sourceTitle: "既有资料",
    taskType: "template",
    templateId: templateDetail.id,
    templateName: templateDetail.name,
    status: "completed",
    parameters: {
      document_title: "既有标题",
      opinion: "既有拟办意见",
    },
    template: templateDetail,
    canEdit: true,
    createdAt: "2026-04-07T15:14:00.000Z",
    updatedAt: "2026-04-07T15:15:00.000Z",
    completedAt: "2026-04-07T15:15:00.000Z",
    exportFile: {
      id: "export-existing",
      templateId: templateDetail.id,
      outputFilename: "拟办意见.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      byteSize: 128,
      downloadUrl: "http://127.0.0.1:8000/storage/exports/export-existing.xlsx",
      createdAt: "2026-04-07T15:15:00.000Z",
    },
  });

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

    if (url.includes("/api/internal/knowledge-templates?")) {
      return jsonResponse({
        data: [
          {
            id: templateDetail.id,
            name: templateDetail.name,
            templateType: templateDetail.templateType,
            sourceFilename: templateDetail.sourceFilename,
            fieldCount: templateDetail.fieldCount,
            referenceLibraryCount: templateDetail.referenceLibraryCount,
            parsedAt: templateDetail.parsedAt,
            updatedAt: templateDetail.updatedAt,
          },
        ],
      });
    }

    if (url.includes("/api/internal/knowledge-templates/")) {
      return jsonResponse({
        data: templateDetail,
      });
    }

    if (url.includes("/api/internal/knowledge-template-export-tasks")) {
      const parsedUrl = new URL(url);
      const taskIdMatch = parsedUrl.pathname.match(
        /\/api\/internal\/knowledge-template-export-tasks\/([^/?#]+)/,
      );

      if (taskIdMatch?.[1]) {
        const task = adminExportTasks.get(decodeURIComponent(taskIdMatch[1]));

        if (!task) {
          return jsonResponse(
            {
              error: "Not Found",
            },
            404,
          );
        }

        if ((init?.method || "GET").toUpperCase() === "PATCH") {
          task.parameters = {
            ...body.parameters,
          } as Record<string, string>;
          task.updatedAt = "2026-04-07T15:18:00.000Z";
          task.exportFile = {
            id: "export-updated",
            templateId: task.templateId,
            outputFilename: "拟办意见-已更新.xlsx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            byteSize: 256,
            downloadUrl:
              "http://127.0.0.1:8000/storage/exports/export-updated.xlsx",
            createdAt: task.updatedAt,
          };

          return jsonResponse({
            data: task,
          });
        }

        return jsonResponse({
          data: task,
        });
      }

      if ((init?.method || "GET").toUpperCase() === "POST") {
        const createdAt = "2026-04-07T15:16:00.000Z";
        const taskId = `task-${adminExportTasks.size + 1}`;
        const task = {
          id: taskId,
          ownerUserId: String(body.user_id ?? 1),
          sourceId: String(body.source_id ?? "source-1"),
          sourceTitle: "资料一",
          taskType: "template",
          templateId: String(body.template_id ?? templateDetail.id),
          templateName: templateDetail.name,
          status: "pending" as const,
          parameters: {},
          template: templateDetail,
          canEdit: false,
          createdAt,
          updatedAt: createdAt,
        };

        adminExportTasks.set(taskId, task);

        return jsonResponse({
          data: task,
        });
      }

      const taskIds = parsedUrl.searchParams
        .get("task_ids")
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const sourceId = parsedUrl.searchParams.get("source_id")?.trim();
      let tasks = [...adminExportTasks.values()];

      if (taskIds?.length) {
        tasks = tasks.filter((task) => taskIds.includes(task.id));
      }

      if (sourceId) {
        tasks = tasks.filter((task) => task.sourceId === sourceId);
      }

      return jsonResponse({
        data: tasks,
      });
    }

    if (body.stream === true) {
      return createSseResponse([
        {
          choices: [
            {
              delta: {
                content: "这是基于当前证据生成的流式回答。",
              },
              finish_reason: null,
            },
          ],
        },
      ]);
    }

    if (url.includes("/responses")) {
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
                text: `基于证据的回答：${responseInputText || readMessageText(lastMessage?.content)}`,
                annotations: [],
              },
            ],
          },
        ],
        output_text: `基于证据的回答：${responseInputText || readMessageText(lastMessage?.content)}`,
      });
    }

    if (url.includes("chat/completions")) {
      return jsonResponse({
        choices: [
          {
            message: {
              content: `基于证据的回答：${readMessageText(lastMessage?.content)}`,
            },
          },
        ],
      });
    }

    return jsonResponse({
      ok: true,
      body: await readTextRequestBody(init?.body),
    });
  }) as typeof fetch;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as {
    data: T;
    success: boolean;
  };
  return payload.data;
}

async function login(
  app: ReturnType<typeof createApp>,
  params?: {
    password?: string;
    username?: string;
  },
) {
  const response = await app.handle(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: params?.username ?? getDefaultUsername(),
        password: params?.password ?? getDefaultPassword(),
      }),
    }),
  );

  const data = await readJson<{
    token: string;
    user: {
      id: string;
      username: string;
    };
  }>(response);

  return {
    response,
    ...data,
  };
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function uploadFileThroughDirectObjectFlow(params: {
  app: ReturnType<typeof createApp>;
  token: string;
  collectionId: string;
  file: File;
  summary?: string;
  tags?: string[];
  title?: string;
}) {
  const formData = new FormData();
  formData.set("file", params.file);

  if (params.summary?.trim()) {
    formData.set("summary", params.summary.trim());
  }

  if (params.tags?.length) {
    formData.set("tags", params.tags.join(", "));
  }

  if (params.title?.trim()) {
    formData.set("title", params.title.trim());
  }

  const response = await params.app.handle(
    new Request(
      `http://localhost/api/kb/collections/${params.collectionId}/uploads`,
      {
        method: "POST",
        headers: {
          ...authHeaders(params.token),
        },
        body: formData,
      },
    ),
  );

  return {
    confirmResponse: response,
  };
}

describe("@atlas-kb/api knowledge endpoints", () => {
  let knowledgeDataDir = "";
  let workspaceFilesDir = "";

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-api-test-"));
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
    globalThis.fetch = originalFetch;
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

    resetKnowledgeRuntimeCache();
    globalThis.fetch = originalFetch;
    setKnowledgeFilesystemFactoryForTests();
    await rm(knowledgeDataDir, { force: true, recursive: true });
  });

  it("creates a collection, imports text, and searches within it", async () => {
    const app = createApp();
    const session = await login(app);

    const createCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "api-search",
          name: "API Search",
          description: "api test collection",
        }),
      }),
    );
    const collectionData = await readJson<{
      collection: {
        id: string;
      };
    }>(createCollectionResponse);

    const importResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/collections/${collectionData.collection.id}/imports/text`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "Alpha API Doc",
            content: "alpha api keyword appears in this source.",
          }),
        },
      ),
    );
    const imported = await readJson<{
      source: {
        id: string;
        status: string;
      };
    }>(importResponse);

    expect(imported.source.status).toBe("ready");

    const searchResponse = await app.handle(
      new Request("http://localhost/api/kb/search", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "alpha api keyword",
          collectionId: collectionData.collection.id,
        }),
      }),
    );
    const searchData = await readJson<{
      hits: Array<{
        sourceId: string;
        title: string;
      }>;
      total: number;
    }>(searchResponse);

    expect(searchData.total).toBe(1);
    expect(searchData.hits[0]?.title).toBe("Alpha API Doc");
  });

  it("imports one file through the direct object upload flow and returns a download url", async () => {
    const app = createApp();
    const session = await login(app);

    const createCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "api-download",
          name: "API Download",
          description: "download tests",
        }),
      }),
    );
    const collectionData = await readJson<{
      collection: {
        id: string;
      };
    }>(createCollectionResponse);

    const upload = await uploadFileThroughDirectObjectFlow({
      app,
      token: session.token,
      collectionId: collectionData.collection.id,
      file: new File(["downloadable file body"], "downloadable.txt", {
        type: "text/plain",
      }),
    });
    const importData = await readJson<{
      source: {
        id: string;
        documentId: string;
        sourceFilename?: string;
      };
    }>(upload.confirmResponse);

    expect(importData.source.documentId).toBe("downloadable.txt");
    expect(importData.source.sourceFilename).toBe("downloadable.txt");

    const downloadResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/sources/${importData.source.id}/download`,
        {
          headers: authHeaders(session.token),
        },
      ),
    );

    expect(downloadResponse.status).toBe(200);
    const downloadData = await readJson<{
      url: string;
      filename: string;
      mimeType: string;
    }>(downloadResponse);
    expect(downloadData.url).toBeString();
    expect(downloadData.filename).toBe("downloadable.txt");
  });

  it("imports multiple files through the direct object upload flow", async () => {
    const app = createApp();
    const session = await login(app);

    const createCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "api-batch-upload",
          name: "API Batch Upload",
          description: "batch upload tests",
        }),
      }),
    );
    const collectionData = await readJson<{
      collection: {
        id: string;
      };
    }>(createCollectionResponse);

    const firstUpload = await uploadFileThroughDirectObjectFlow({
      app,
      token: session.token,
      collectionId: collectionData.collection.id,
      file: new File(["first body"], "first.txt", {
        type: "text/plain",
      }),
    });
    const secondUpload = await uploadFileThroughDirectObjectFlow({
      app,
      token: session.token,
      collectionId: collectionData.collection.id,
      file: new File(["second body"], "second.txt", {
        type: "text/plain",
      }),
    });

    const firstImport = await readJson<{
      source: {
        documentId: string;
        sourceFilename?: string;
      };
    }>(firstUpload.confirmResponse);
    const secondImport = await readJson<{
      source: {
        documentId: string;
        sourceFilename?: string;
      };
    }>(secondUpload.confirmResponse);

    expect(firstImport.source.documentId).toBe("first.txt");
    expect(firstImport.source.sourceFilename).toBe("first.txt");
    expect(secondImport.source.documentId).toBe("second.txt");
    expect(secondImport.source.sourceFilename).toBe("second.txt");
  });

  it("surfaces validator messages instead of the generic validation error string", async () => {
    const app = createApp();
    const session = await login(app);

    const response = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Missing Description",
        }),
      }),
    );

    expect(response.status).toBe(400);

    const payload = (await response.json()) as {
      error: {
        code: string;
        message: string;
      };
      success: false;
    };

    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(payload.error.message).toContain("description");
  });

  it("requires collectionId when creating a chat session", async () => {
    const app = createApp();
    const session = await login(app);

    const response = await app.handle(
      new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "未绑定文件夹",
        }),
      }),
    );

    expect(response.status).toBe(400);

    const payload = (await response.json()) as {
      error: {
        code: string;
        message: string;
      };
      success: false;
    };

    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(payload.error.message).toContain("collectionId");
  });

  it("lists chat sessions only for the requested collection", async () => {
    const app = createApp();
    const session = await login(app);

    const firstCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "chat-filter-a",
          name: "Chat Filter A",
          description: "chat filter tests a",
        }),
      }),
    );
    const secondCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "chat-filter-b",
          name: "Chat Filter B",
          description: "chat filter tests b",
        }),
      }),
    );
    const firstCollection = await readJson<{
      collection: {
        id: string;
      };
    }>(firstCollectionResponse);
    const secondCollection = await readJson<{
      collection: {
        id: string;
      };
    }>(secondCollectionResponse);

    await app.handle(
      new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId: firstCollection.collection.id,
          title: "A Session",
        }),
      }),
    );
    await app.handle(
      new Request("http://localhost/api/chat/sessions", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId: secondCollection.collection.id,
          title: "B Session",
        }),
      }),
    );

    const listResponse = await app.handle(
      new Request(
        `http://localhost/api/chat/sessions?collectionId=${encodeURIComponent(firstCollection.collection.id)}`,
        {
          headers: authHeaders(session.token),
        },
      ),
    );
    const listData = await readJson<{
      sessions: Array<{
        collectionId: string;
        title: string;
      }>;
    }>(listResponse);

    expect(listData.sessions).toHaveLength(1);
    expect(listData.sessions[0]?.title).toBe("A Session");
    expect(listData.sessions[0]?.collectionId).toBe(
      firstCollection.collection.id,
    );
  });

  it("keeps manual text sources in the workspace filesystem across import, update, and delete", async () => {
    const app = createApp();
    const session = await login(app);

    const createCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "api-text-mirror",
          name: "API Text Mirror",
          description: "text mirror tests",
        }),
      }),
    );
    const collectionData = await readJson<{
      collection: {
        id: string;
      };
    }>(createCollectionResponse);

    const importResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/collections/${collectionData.collection.id}/imports/text`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "Manual Source",
            content: "first manual text body",
          }),
        },
      ),
    );
    const importData = await readJson<{
      source: {
        id: string;
        sourceFilename?: string;
      };
    }>(importResponse);

    expect(importData.source.sourceFilename).toBe("Manual Source.txt");
    const workspaceFilePath = getWorkspaceFilePath({
      rootDir: workspaceFilesDir,
      userId: session.user.id,
      collectionId: collectionData.collection.id,
      relativePath: "Manual Source.txt",
    });
    expect(await readFile(workspaceFilePath, "utf-8")).toBe(
      "first manual text body",
    );

    const updateResponse = await app.handle(
      new Request(`http://localhost/api/kb/sources/${importData.source.id}`, {
        method: "PATCH",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "updated manual text body",
        }),
      }),
    );

    expect(updateResponse.status).toBe(200);
    expect(await readFile(workspaceFilePath, "utf-8")).toBe(
      "updated manual text body",
    );

    const deleteResponse = await app.handle(
      new Request(`http://localhost/api/kb/sources/${importData.source.id}`, {
        method: "DELETE",
        headers: authHeaders(session.token),
      }),
    );

    expect(deleteResponse.status).toBe(200);
    await expect(readFile(workspaceFilePath, "utf-8")).rejects.toThrow();
  });

  it("creates, loads, and updates export tasks through admin-backed endpoints", async () => {
    const app = createApp();
    const session = await login(app);

    const createCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "api-export-tasks",
          name: "API Export Tasks",
          description: "export task tests",
        }),
      }),
    );
    const collectionData = await readJson<{
      collection: {
        id: string;
      };
    }>(createCollectionResponse);

    const importResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/collections/${collectionData.collection.id}/imports/text`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "公文标题",
            summary: "导出测试摘要",
            content: "来文单位为综合办公室，文件标题为关于预算调整的请示。",
          }),
        },
      ),
    );
    const importData = await readJson<{
      source: {
        id: string;
      };
    }>(importResponse);

    const createTaskResponse = await app.handle(
      new Request(
        `http://localhost/api/kb/sources/${importData.source.id}/export-tasks`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateId: "template-1",
          }),
        },
      ),
    );
    const createdTask = await readJson<{
      task: {
        id: string;
        sourceId: string;
        status: string;
      };
    }>(createTaskResponse);

    expect(createdTask.task.sourceId).toBe(importData.source.id);
    expect(createdTask.task.status).toBe("pending");

    const detailResponse = await app.handle(
      new Request("http://localhost/api/kb/export-tasks/task-existing", {
        headers: authHeaders(session.token),
      }),
    );
    const detailData = await readJson<{
      task: {
        canEdit: boolean;
        parameters: Record<string, string>;
        template: {
          fields: Array<{
            name: string;
          }>;
        };
      };
    }>(detailResponse);

    expect(detailData.task.canEdit).toBe(true);
    expect(detailData.task.parameters.opinion).toBe("既有拟办意见");
    expect(detailData.task.template.fields).toHaveLength(2);

    const updateResponse = await app.handle(
      new Request("http://localhost/api/kb/export-tasks/task-existing", {
        method: "PATCH",
        headers: {
          ...authHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parameters: {
            document_title: "更新后的标题",
            opinion: "更新后的拟办意见",
          },
        }),
      }),
    );
    const updatedTask = await readJson<{
      task: {
        exportFile?: {
          outputFilename: string;
        };
        parameters: Record<string, string>;
      };
    }>(updateResponse);

    expect(updatedTask.task.parameters.document_title).toBe("更新后的标题");
    expect(updatedTask.task.parameters.opinion).toBe("更新后的拟办意见");
    expect(updatedTask.task.exportFile?.outputFilename).toBe(
      "拟办意见-已更新.xlsx",
    );
  });

  it("isolates data between authenticated users", async () => {
    const app = createApp();
    const alpha = await login(app);
    await createUser({
      username: "beta-api",
      password: "beta-pass",
    });
    const beta = await login(app, {
      username: "beta-api",
      password: "beta-pass",
    });

    const createCollectionResponse = await app.handle(
      new Request("http://localhost/api/kb/collections", {
        method: "POST",
        headers: {
          ...authHeaders(alpha.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "alpha-only",
          name: "Alpha Only",
          description: "private",
        }),
      }),
    );
    const collectionData = await readJson<{
      collection: {
        id: string;
      };
    }>(createCollectionResponse);

    await app.handle(
      new Request(
        `http://localhost/api/kb/collections/${collectionData.collection.id}/imports/text`,
        {
          method: "POST",
          headers: {
            ...authHeaders(alpha.token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "Private Alpha Doc",
            content: "private alpha token",
          }),
        },
      ),
    );

    const betaSearchResponse = await app.handle(
      new Request("http://localhost/api/kb/search", {
        method: "POST",
        headers: {
          ...authHeaders(beta.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "private alpha token",
          collectionId: collectionData.collection.id,
        }),
      }),
    );

    expect(betaSearchResponse.status).toBe(404);
  });

  it("loads template summaries from admin using the final atlas-kb contract", async () => {
    const app = createApp();
    const session = await login(app);

    const response = await app.handle(
      new Request("http://localhost/api/kb/templates", {
        headers: authHeaders(session.token),
      }),
    );
    const data = await readJson<{
      templates: Array<{
        fieldCount: number;
        parsedAt?: string;
        templateType: string;
        updatedAt: string;
      }>;
    }>(response);

    expect(data.templates).toHaveLength(1);
    expect(data.templates[0]?.templateType).toBe("xlsx");
    expect(data.templates[0]?.fieldCount).toBe(2);
    expect(data.templates[0]?.parsedAt).toBe("2026-04-07T15:10:24.000Z");
    expect(data.templates[0]?.updatedAt).toBe("2026-04-07T15:10:24.000Z");
  });
});
