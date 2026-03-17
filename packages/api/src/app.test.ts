import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  resetKnowledgeRepository,
  resetKnowledgeVectorState,
} from "@atlas-kb/mastra/knowledge";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalBaseUrl = process.env.OPENAI_BASE_URL;
const originalDashScopeApiKey = process.env.DASHSCOPE_API_KEY;
const originalDashScopeBaseUrl = process.env.DASHSCOPE_BASE_URL;
const originalDashScopeEmbeddingModel = process.env.DASHSCOPE_EMBEDDING_MODEL;
const originalDataDir = process.env.ATLAS_KB_DATA_DIR;

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function loginAndGetAuthHeader(
  app: ReturnType<typeof createApp>,
): Promise<Record<string, string>> {
  const response = await app.handle(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "admin@atlas-kb.local",
        password: "atlas-kb-dev",
      }),
    }),
  );
  const payload = await readJson(response);
  const data = payload.data as {
    token: string;
  };

  expect(response.status).toBe(200);

  return {
    Authorization: `Bearer ${data.token}`,
  };
}

describe("@atlas-kb/api", () => {
  let knowledgeDataDir = "";

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-api-test-"));
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.DASHSCOPE_BASE_URL;
    delete process.env.DASHSCOPE_EMBEDDING_MODEL;
    globalThis.fetch = originalFetch;
    resetKnowledgeRepository();
    resetKnowledgeVectorState();
  });

  afterEach(async () => {
    process.env.OPENAI_API_KEY = originalApiKey;
    if (originalBaseUrl === undefined) {
      delete process.env.OPENAI_BASE_URL;
    } else {
      process.env.OPENAI_BASE_URL = originalBaseUrl;
    }
    if (originalDashScopeApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = originalDashScopeApiKey;
    }
    if (originalDashScopeBaseUrl === undefined) {
      delete process.env.DASHSCOPE_BASE_URL;
    } else {
      process.env.DASHSCOPE_BASE_URL = originalDashScopeBaseUrl;
    }
    if (originalDashScopeEmbeddingModel === undefined) {
      delete process.env.DASHSCOPE_EMBEDDING_MODEL;
    } else {
      process.env.DASHSCOPE_EMBEDDING_MODEL = originalDashScopeEmbeddingModel;
    }
    globalThis.fetch = originalFetch;
    resetKnowledgeRepository();
    resetKnowledgeVectorState();

    if (originalDataDir === undefined) {
      delete process.env.ATLAS_KB_DATA_DIR;
    } else {
      process.env.ATLAS_KB_DATA_DIR = originalDataDir;
    }

    if (knowledgeDataDir) {
      await rm(knowledgeDataDir, { force: true, recursive: true });
    }
  });

  it("returns health status", async () => {
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/api/health"),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.success).toBeTrue();
  });

  it("returns a session for valid login credentials", async () => {
    const app = createApp();
    const authHeaders = await loginAndGetAuthHeader(app);
    const response = await app.handle(
      new Request("http://localhost/api/auth/me", {
        headers: authHeaders,
      }),
    );
    const payload = await readJson(response);
    const data = payload.data as {
      user: {
        email: string;
        role: string;
      };
    };

    expect(response.status).toBe(200);
    expect(data.user.email).toBe("admin@atlas-kb.local");
    expect(data.user.role).toBe("admin");
  });

  it("returns 404 for an unknown knowledge space", async () => {
    const app = createApp();
    const authHeaders = await loginAndGetAuthHeader(app);
    const response = await app.handle(
      new Request("http://localhost/api/kb/spaces/unknown/documents", {
        headers: authHeaders,
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(404);
    expect(payload.success).toBeFalse();
  });

  it("uploads a document into a knowledge space", async () => {
    const app = createApp();
    const authHeaders = await loginAndGetAuthHeader(app);
    const form = new FormData();

    form.append(
      "file",
      new File(
        [
          "# Incident Notes\n\nEscalate to the incident commander within ten minutes and capture mitigations in the status channel.",
        ],
        "incident-notes.md",
        {
          type: "text/markdown",
        },
      ),
    );
    form.append("tags", "incident, operations");
    form.append("title", "Incident Notes");

    const uploadResponse = await app.handle(
      new Request("http://localhost/api/kb/spaces/ops/documents/upload", {
        method: "POST",
        headers: authHeaders,
        body: form,
      }),
    );
    const uploadPayload = await readJson(uploadResponse);
    const uploadData = uploadPayload.data as {
      document: {
        id: string;
        title: string;
      };
      engine: string;
      indexed: boolean;
    };

    expect(uploadResponse.status).toBe(200);
    expect(uploadData.document.title).toBe("Incident Notes");
    expect(uploadData.indexed).toBeFalse();
    expect(uploadData.engine).toBe("lexical");

    const listResponse = await app.handle(
      new Request("http://localhost/api/kb/spaces/ops/documents", {
        headers: authHeaders,
      }),
    );
    const listPayload = await readJson(listResponse);
    const listData = listPayload.data as {
      documents: Array<{
        id: string;
      }>;
    };

    expect(listResponse.status).toBe(200);
    expect(
      listData.documents.some(
        (document) => document.id === uploadData.document.id,
      ),
    ).toBeTrue();
  });

  it("returns a mock ask response without a model key", async () => {
    const app = createApp();
    const authHeaders = await loginAndGetAuthHeader(app);
    const response = await app.handle(
      new Request("http://localhost/api/kb/ask", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: "How should onboarding start?",
        }),
      }),
    );
    const payload = await readJson(response);
    const data = payload.data as {
      citations: unknown[];
      engine: string;
      mode: string;
    };

    expect(response.status).toBe(200);
    expect(data.mode).toBe("mock");
    expect(data.engine).toBe("lexical");
    expect(data.citations.length).toBeGreaterThan(0);
  });

  it("returns a model ask response when the provider call succeeds", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://gateway.example/v1";
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/embeddings")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                embedding: [0.1, 0.2, 0.3],
                index: 0,
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (url.endsWith("/chat/completions")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Use short quotations and cite the source title.",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (url.endsWith("/collections/atlas_kb_chunks")) {
        return new Response(
          JSON.stringify({
            status: "already_exists",
          }),
          {
            status: 409,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (url.includes("/collections/atlas_kb_chunks/points?wait=true")) {
        return new Response(
          JSON.stringify({
            status: "ok",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (url.endsWith("/collections/atlas_kb_chunks/points/query")) {
        return new Response(
          JSON.stringify({
            result: {
              points: [],
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      return originalFetch(input, init);
    };

    const app = createApp();
    const authHeaders = await loginAndGetAuthHeader(app);
    const response = await app.handle(
      new Request("http://localhost/api/kb/ask", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: "How should answers cite evidence?",
        }),
      }),
    );
    const payload = await readJson(response);
    const data = payload.data as {
      answer: string;
      engine: string;
      mode: string;
    };

    expect(response.status).toBe(200);
    expect(data.mode).toBe("model");
    expect(data.engine).toBe("lexical");
    expect(data.answer).toContain("cite the source title");
  });

  it("returns an upstream error when a configured provider rejects ask", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://gateway.example/v1";
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/embeddings")) {
        return new Response("unauthorized", { status: 401 });
      }

      if (url.endsWith("/chat/completions")) {
        expect(init?.method).toBe("POST");
        return new Response("unauthorized", { status: 401 });
      }

      if (url.endsWith("/collections/atlas_kb_chunks/points/query")) {
        return new Response(
          JSON.stringify({
            result: {
              points: [],
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      return originalFetch(input, init);
    };

    const app = createApp();
    const authHeaders = await loginAndGetAuthHeader(app);
    const response = await app.handle(
      new Request("http://localhost/api/kb/ask", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: "How should answers cite evidence?",
        }),
      }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(502);
    expect(payload.success).toBeFalse();
    expect((payload.error as { code: string }).code).toBe(
      "UPSTREAM_SERVICE_ERROR",
    );
  });
});
