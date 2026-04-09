import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKnowledgeSourceRecord } from "./repository";
import { getKnowledgeWorkspace } from "./runtime";
import {
  createKnowledgeCollection,
  createUser,
  importKnowledgeFile,
  LocalFilesystem,
  requireKnowledgeSource,
  resetKnowledgeRepository,
  resetKnowledgeRuntimeCache,
  setKnowledgeFilesystemFactoryForTests,
  updateKnowledgeSource,
  waitForPendingKnowledgeImports,
} from "./index";

const originalDataDir = process.env.ATLAS_KB_DATA_DIR;
const originalOpenAIApiKey = process.env.OPENAI_API_KEY;
const originalOpenAIBaseUrl = process.env.OPENAI_BASE_URL;
const originalEmbeddingApiKey = process.env.EMBEDDING_API_KEY;
const originalEmbeddingDimensions = process.env.EMBEDDING_DIMENSIONS;
const originalQdrantUrl = process.env.QDRANT_URL;
const originalQdrantApiKey = process.env.QDRANT_API_KEY;
const originalDoclingBaseUrl = process.env.DOCLING_BASE_URL;
const originalDoclingConvertPath = process.env.DOCLING_CONVERT_PATH;
const originalVisionBaseUrl = process.env.VISION_BASE_URL;
const originalVisionApiKey = process.env.VISION_API_KEY;
const originalVisionModel = process.env.VISION_MODEL;

describe("knowledge ingest", () => {
  let knowledgeDataDir = "";
  let workspaceFilesDir = "";

  beforeEach(async () => {
    knowledgeDataDir = await mkdtemp(join(tmpdir(), "atlas-kb-ingest-test-"));
    workspaceFilesDir = join(knowledgeDataDir, "workspace-files");
    process.env.ATLAS_KB_DATA_DIR = knowledgeDataDir;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.EMBEDDING_DIMENSIONS;
    delete process.env.QDRANT_URL;
    delete process.env.QDRANT_API_KEY;
    delete process.env.DOCLING_BASE_URL;
    delete process.env.DOCLING_CONVERT_PATH;
    delete process.env.VISION_BASE_URL;
    delete process.env.VISION_API_KEY;
    delete process.env.VISION_MODEL;
    resetKnowledgeRuntimeCache();
    await resetKnowledgeRepository();
    setKnowledgeFilesystemFactoryForTests(({ userId, collectionId }) => {
      return new LocalFilesystem({
        basePath: join(workspaceFilesDir, userId, collectionId),
      });
    });
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

    if (originalDoclingBaseUrl === undefined) {
      delete process.env.DOCLING_BASE_URL;
    } else {
      process.env.DOCLING_BASE_URL = originalDoclingBaseUrl;
    }

    if (originalDoclingConvertPath === undefined) {
      delete process.env.DOCLING_CONVERT_PATH;
    } else {
      process.env.DOCLING_CONVERT_PATH = originalDoclingConvertPath;
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
  });

  it("allows metadata-only updates for docling-managed sources but rejects content replacement", async () => {
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
      title: "Manual",
      summary: "Original summary",
      content: "Extracted manual body",
      tags: ["ops"],
      sourceFilename: "manual.pdf",
      mimeType: "application/pdf",
      byteSize: 32,
      status: "ready",
    });

    await expect(
      updateKnowledgeSource(user.id, source.id, {
        content: "new plain text body",
      }),
    ).rejects.toThrow("只支持更新标题、摘要和标签");

    const updated = await updateKnowledgeSource(user.id, source.id, {
      title: "Manual v2",
      summary: "Updated summary",
      tags: ["ops", "security"],
    });

    expect(updated.title).toBe("Manual v2");
    expect(updated.summary).toBe("Updated summary");
    expect(updated.tags).toEqual(["ops", "security"]);
    expect(updated.content).toBe("Extracted manual body");
    expect(updated.mimeType).toBe("application/pdf");
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
    expect(importResult.source.content).toContain("后台解析");

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
    expect(refreshed.content).toBe("Atlas queued upload body");
    const fileContent = await workspace.filesystem?.readFile(
      importResult.source.documentId!,
    );
    expect(
      typeof fileContent === "string"
        ? fileContent
        : new TextDecoder().decode(fileContent),
    ).toBe("Atlas queued upload body");
  });
});
