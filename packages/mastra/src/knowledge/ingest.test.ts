import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKnowledgeSourceRecord } from "./repository";
import { buildMockQdrantResponse } from "./test-qdrant";
import { getKnowledgeWorkspace } from "./runtime";
import {
  createKnowledgeCollection,
  createUser,
  importKnowledgeFile,
  retryFailedKnowledgeSourceImports,
  retryKnowledgeSourceImport,
  requireKnowledgeSource,
  resetKnowledgeRepository,
  resetKnowledgeRuntimeCache,
  setKnowledgeFilesystemFactoryForTests,
  updateKnowledgeSource,
  waitForPendingKnowledgeImports,
} from "./index";
import { buildMockTikaExtractPayload } from "./test-tika";
import { TestS3LocalFilesystem } from "./test-s3-filesystem";

const originalFetch = globalThis.fetch;
const originalDataDir = process.env.ATLAS_KB_DATA_DIR;
const originalOpenAIApiKey = process.env.OPENAI_API_KEY;
const originalOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
const originalEmbeddingApiKey = process.env.EMBEDDING_API_KEY;
const originalEmbeddingBaseUrl = process.env.EMBEDDING_BASE_URL;
const originalEmbeddingModel = process.env.EMBEDDING_MODEL;
const originalEmbeddingDimensions = process.env.EMBEDDING_DIMENSIONS;
const originalQdrantUrl = process.env.QDRANT_URL;
const originalQdrantApiKey = process.env.QDRANT_API_KEY;
const originalTikaBaseUrl = process.env.ATLAS_KB_TIKA_BASE_URL;
const originalVisionBaseUrl = process.env.VISION_BASE_URL;
const originalVisionApiKey = process.env.VISION_API_KEY;
const originalVisionModel = process.env.VISION_MODEL;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe.serial("knowledge ingest", () => {
  let knowledgeDataDir = "";
  let workspaceFilesDir = "";

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-ingest-test-"));
    workspaceFilesDir = join(knowledgeDataDir, "workspace-files");
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_BASE_URL = "https://api.openai.test/v1";
    process.env.EMBEDDING_API_KEY = "test-embedding-key";
    process.env.EMBEDDING_BASE_URL = "https://dashscope.test/v1";
    process.env.EMBEDDING_MODEL = "text-embedding-v4";
    delete process.env.EMBEDDING_DIMENSIONS;
    process.env.QDRANT_URL = "http://127.0.0.1:6333";
    delete process.env.QDRANT_API_KEY;
    process.env.ATLAS_KB_TIKA_BASE_URL = "http://tika.local";
    delete process.env.VISION_BASE_URL;
    delete process.env.VISION_API_KEY;
    delete process.env.VISION_MODEL;
    resetKnowledgeRuntimeCache();
    await resetKnowledgeRepository();
    setKnowledgeFilesystemFactoryForTests(({ userId, collectionId }) => {
      return new TestS3LocalFilesystem({
        basePath: join(workspaceFilesDir, userId, collectionId),
        prefix: `${userId}/${collectionId}`,
      });
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

      if (url.includes("/rmeta/text")) {
        return jsonResponse(buildMockTikaExtractPayload(init));
      }

      if (url.includes("/embeddings")) {
        return jsonResponse({
          data: [
            {
              embedding: [0.11, 0.22, 0.33],
            },
          ],
        });
      }

      if (url.includes(":6333")) {
        return jsonResponse(buildMockQdrantResponse(url, init?.method || "GET"));
      }

      return jsonResponse({
        ok: true,
      });
    }) as typeof fetch;
  });

  afterEach(async () => {
    resetKnowledgeRuntimeCache();
    await resetKnowledgeRepository();
    setKnowledgeFilesystemFactoryForTests();

    if (originalDataDir === undefined) {
      delete process.env.ATLAS_KB_DATA_DIR;
    } else {
      process.env.ATLAS_KB_DATA_DIR = originalDataDir;
    }

    if (originalOpenAIApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIApiKey;
    }

    if (originalOpenAIBaseUrl === undefined) {
      delete process.env.OPENAI_BASE_URL;
    } else {
      process.env.OPENAI_BASE_URL = originalOpenAIBaseUrl;
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

    if (originalEmbeddingDimensions === undefined) {
      delete process.env.EMBEDDING_DIMENSIONS;
    } else {
      process.env.EMBEDDING_DIMENSIONS = originalEmbeddingDimensions;
    }

    if (originalQdrantUrl === undefined) {
      delete process.env.QDRANT_URL;
    } else {
      process.env.QDRANT_URL = originalQdrantUrl;
    }

    if (originalQdrantApiKey === undefined) {
      delete process.env.QDRANT_API_KEY;
    } else {
      process.env.QDRANT_API_KEY = originalQdrantApiKey;
    }

    if (originalTikaBaseUrl === undefined) {
      delete process.env.ATLAS_KB_TIKA_BASE_URL;
    } else {
      process.env.ATLAS_KB_TIKA_BASE_URL = originalTikaBaseUrl;
    }

    if (originalVisionBaseUrl === undefined) {
      delete process.env.VISION_BASE_URL;
    } else {
      process.env.VISION_BASE_URL = originalVisionBaseUrl;
    }

    if (originalVisionApiKey === undefined) {
      delete process.env.VISION_API_KEY;
    } else {
      process.env.VISION_API_KEY = originalVisionApiKey;
    }

    if (originalVisionModel === undefined) {
      delete process.env.VISION_MODEL;
    } else {
      process.env.VISION_MODEL = originalVisionModel;
    }

    globalThis.fetch = originalFetch;
  });

  it("renames binary-managed sources and rebuilds their index, but rejects content replacement", async () => {
    const user = await createUser({
      username: "docling-readonly",
      password: "test-pass",
    });
    const collection = await createKnowledgeCollection({
      userId: user.id,
      input: {
        id: "docling-readonly",
        name: "Docling Readonly",
        description: "docling readonly",
      },
    });
    const workspace = await getKnowledgeWorkspace({
      userId: user.id,
      collectionId: collection.id,
    });

    await workspace.filesystem?.writeFile(
      "manual.pdf",
      new TextEncoder().encode("%PDF-1.4 fake pdf body"),
      {
        mimeType: "application/pdf",
        overwrite: false,
      },
    );

    const source = await createKnowledgeSourceRecord({
      userId: user.id,
      collectionId: collection.id,
      documentId: "manual.pdf",
      sourceType: "file",
      content: undefined,
      sourceFilename: "manual.pdf",
      mimeType: "application/pdf",
      byteSize: 32,
      status: "ready",
    });

    await expect(
      updateKnowledgeSource(user.id, source.id, {
        content: "new plain text body",
      }),
    ).rejects.toThrow("不支持编辑正文");

    const updated = await updateKnowledgeSource(user.id, source.id, {
      sourceFilename: "Manual v2",
    });

    expect(updated.status).toBe("processing");
    expect(updated.documentId).toBe("Manual v2.pdf");
    expect(updated.sourceFilename).toBe("Manual v2.pdf");
    expect(updated.content).toBeUndefined();
    expect(updated.mimeType).toBe("application/pdf");

    await waitForPendingKnowledgeImports();

    const refreshed = await requireKnowledgeSource(user.id, source.id);
    expect(refreshed.status).toBe("ready");
    expect(refreshed.documentId).toBe("Manual v2.pdf");
    expect(refreshed.sourceFilename).toBe("Manual v2.pdf");
  });

  it("queues file uploads and completes indexing asynchronously", async () => {
    const user = await createUser({
      username: "queued-upload",
      password: "test-pass",
    });
    const collection = await createKnowledgeCollection({
      userId: user.id,
      input: {
        id: "queued-upload",
        name: "Queued Upload",
        description: "queued upload",
      },
    });

    const importResult = await importKnowledgeFile({
      userId: user.id,
      collectionId: collection.id,
      file: new File(["Atlas queued upload body"], "queued.txt", {
        type: "text/plain",
      }),
      input: {},
    });

    expect(importResult.source.status).toBe("processing");
    expect(importResult.source.content).toBeUndefined();

    await waitForPendingKnowledgeImports();

    const workspace = await getKnowledgeWorkspace({
      userId: user.id,
      collectionId: collection.id,
    });
    const refreshed = await requireKnowledgeSource(
      user.id,
      importResult.source.id,
    );
    expect(refreshed.status).toBe("ready");
    expect(refreshed.content).toBeUndefined();
    const fileContent = await workspace.filesystem?.readFile(
      importResult.source.documentId!,
    );
    expect(
      typeof fileContent === "string"
        ? fileContent
        : new TextDecoder().decode(fileContent),
    ).toBe("Atlas queued upload body");
  });

  it("requeues failed file imports and clears the previous failure state", async () => {
    let failTikaRequest = true;
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

      if (url.includes("/rmeta/text")) {
        if (failTikaRequest) {
          return jsonResponse(
            {
              detail: "Gateway Timeout",
            },
            504,
          );
        }

        return jsonResponse(buildMockTikaExtractPayload(init));
      }

      if (url.includes("/embeddings")) {
        return jsonResponse({
          data: [
            {
              embedding: [0.11, 0.22, 0.33],
            },
          ],
        });
      }

      if (url.includes(":6333")) {
        return jsonResponse(buildMockQdrantResponse(url, init?.method || "GET"));
      }

      return jsonResponse({
        ok: true,
      });
    }) as typeof fetch;

    const user = await createUser({
      username: "retry-upload",
      password: "test-pass",
    });
    const collection = await createKnowledgeCollection({
      userId: user.id,
      input: {
        id: "retry-upload",
        name: "Retry Upload",
        description: "retry upload",
      },
    });

    const importResult = await importKnowledgeFile({
      userId: user.id,
      collectionId: collection.id,
      file: new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "retry.pdf", {
        type: "application/pdf",
      }),
      input: {},
    });

    await waitForPendingKnowledgeImports();

    const failedSource = await requireKnowledgeSource(
      user.id,
      importResult.source.id,
    );
    expect(failedSource.status).toBe("failed");
    expect(failedSource.failureMessage).toBeTruthy();

    const renamedFailedSource = await updateKnowledgeSource(
      user.id,
      importResult.source.id,
      {
        sourceFilename: "Retry PDF",
      },
    );
    expect(renamedFailedSource.status).toBe("processing");
    expect(renamedFailedSource.failureMessage).toBeUndefined();

    await waitForPendingKnowledgeImports();

    const failedRenamedSource = await requireKnowledgeSource(
      user.id,
      importResult.source.id,
    );
    expect(failedRenamedSource.status).toBe("failed");
    expect(failedRenamedSource.failureMessage).toBeTruthy();

    failTikaRequest = false;

    const retriedSource = await retryKnowledgeSourceImport(
      user.id,
      importResult.source.id,
    );
    expect(retriedSource.status).toBe("processing");
    expect(retriedSource.failureMessage).toBeUndefined();

    await waitForPendingKnowledgeImports();

    const completedSource = await requireKnowledgeSource(
      user.id,
      importResult.source.id,
    );
    expect(completedSource.status).toBe("ready");
    expect(completedSource.failureMessage).toBeUndefined();
  });

  it("automatically retries failed file imports every 30 minutes", async () => {
    let failTikaRequest = true;
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

      if (url.includes("/rmeta/text")) {
        if (failTikaRequest) {
          return jsonResponse(
            {
              detail: "Gateway Timeout",
            },
            504,
          );
        }

        return jsonResponse(buildMockTikaExtractPayload(init));
      }

      if (url.includes("/embeddings")) {
        return jsonResponse({
          data: [
            {
              embedding: [0.11, 0.22, 0.33],
            },
          ],
        });
      }

      if (url.includes(":6333")) {
        return jsonResponse(buildMockQdrantResponse(url, init?.method || "GET"));
      }

      return jsonResponse({
        ok: true,
      });
    }) as typeof fetch;

    const user = await createUser({
      username: "auto-retry-upload",
      password: "test-pass",
    });
    const collection = await createKnowledgeCollection({
      userId: user.id,
      input: {
        id: "auto-retry-upload",
        name: "Auto Retry Upload",
        description: "auto retry upload",
      },
    });

    const importResult = await importKnowledgeFile({
      userId: user.id,
      collectionId: collection.id,
      file: new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "auto.pdf", {
        type: "application/pdf",
      }),
      input: {},
    });

    await waitForPendingKnowledgeImports();

    const failedSource = await requireKnowledgeSource(
      user.id,
      importResult.source.id,
    );
    expect(failedSource.status).toBe("failed");
    expect(failedSource.updatedAt).toBeTruthy();

    failTikaRequest = false;

    const earlyRetry = await retryFailedKnowledgeSourceImports({
      now: new Date(Date.parse(failedSource.updatedAt) + 29 * 60 * 1_000),
    });
    expect(earlyRetry.attemptedCount).toBe(0);
    expect(earlyRetry.queuedCount).toBe(0);

    const scheduledRetry = await retryFailedKnowledgeSourceImports({
      now: new Date(Date.parse(failedSource.updatedAt) + 30 * 60 * 1_000),
    });
    expect(scheduledRetry.attemptedCount).toBe(1);
    expect(scheduledRetry.queuedCount).toBe(1);

    await waitForPendingKnowledgeImports();

    const completedSource = await requireKnowledgeSource(
      user.id,
      importResult.source.id,
    );
    expect(completedSource.status).toBe("ready");
    expect(completedSource.failureMessage).toBeUndefined();
  });
});
