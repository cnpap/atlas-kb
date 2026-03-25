import { BadRequestError } from "@atlas-kb/errors";
import type {
  KnowledgeBatchFileImportRequest,
  KnowledgeBatchImportData,
  KnowledgeBatchImportItem,
  KnowledgeCollection,
  KnowledgeFileImportRequest,
  KnowledgeImportJob,
  KnowledgeRetrievalEngine,
  KnowledgeSource,
  KnowledgeSourceUpdateRequest,
  KnowledgeTextImportRequest,
  KnowledgeUrlImportRequest,
  KnowledgeUploadMetadata,
} from "@atlas-kb/schema";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { getKnowledgeUploadsDir } from "./config";
import { replaceKnowledgeSourceVectorIndex } from "./qdrant";
import {
  createImportJob,
  createSourceDraft,
  getLatestSourceVersion,
  replaceSourceContent,
  requireKnowledgeCollection,
  requireKnowledgeSource,
  updateImportJob,
} from "./repository";
import { normalizeWhitespace } from "./search-utils";

const TEXT_FILE_EXTENSIONS = new Set([
  ".csv",
  ".html",
  ".json",
  ".md",
  ".markdown",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const URL_FETCH_TIMEOUT_MS = 15_000;

type ParsedContent = {
  byteSize?: number;
  content: string;
  mimeType?: string;
  parser: string;
  snapshotHtml?: string;
  title: string;
};

type ImportResult = {
  collection: KnowledgeCollection;
  source: KnowledgeSource;
  job: KnowledgeImportJob;
  engine: KnowledgeRetrievalEngine;
  indexed: boolean;
};

type QueuedFileImportTask = {
  collectionId: string;
  draft: KnowledgeSource;
  job: KnowledgeImportJob;
  filePath: string;
  sourceFilename: string;
  title: string;
  summary?: string;
  tags: string[];
  mimeType?: string;
};

const MAX_CONCURRENT_IMPORTS = 2;

const pendingImportTasks: Array<() => Promise<void>> = [];
const activeImportTasks = new Set<Promise<void>>();

function getOriginalFilename(input: string): string {
  const trimmed = basename(input || "upload.txt").trim();
  return trimmed || "upload.txt";
}

function sanitizeFilename(input: string): string {
  const trimmed = getOriginalFilename(input);
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return sanitized || "upload.txt";
}

function resolveDraftTitle(params: {
  title?: string;
  fallback: string;
}): string {
  return params.title?.trim() || params.fallback;
}

function resolveTextTitle(content: string): string {
  const firstLine = normalizeWhitespace(content).split("\n")[0]?.trim();

  if (!firstLine) {
    return "Untitled Note";
  }

  return firstLine.replace(/^#{1,6}\s+/, "").slice(0, 120);
}

function resolveFilenameTitle(filename: string): string {
  const normalized = getOriginalFilename(filename);
  const fallback = normalized.replace(/\.[^/.]+$/, "").trim();

  return fallback || normalized;
}

function createQueuedImportResult(params: {
  collection: KnowledgeCollection;
  source: KnowledgeSource;
  job: KnowledgeImportJob;
}): ImportResult {
  return {
    collection: params.collection,
    source: params.source,
    job: params.job,
    engine: "lexical",
    indexed: false,
  };
}

function runImportQueue(): void {
  while (
    activeImportTasks.size < MAX_CONCURRENT_IMPORTS &&
    pendingImportTasks.length > 0
  ) {
    const nextTask = pendingImportTasks.shift();

    if (!nextTask) {
      return;
    }

    let taskPromise: Promise<void>;
    taskPromise = nextTask()
      .catch((error) => {
        console.error(
          "[atlas-kb/mastra] queued knowledge import failed:",
          error,
        );
      })
      .finally(() => {
        activeImportTasks.delete(taskPromise);
        runImportQueue();
      });

    activeImportTasks.add(taskPromise);
  }
}

function scheduleImportTask(task: () => Promise<void>): void {
  pendingImportTasks.push(task);
  queueMicrotask(runImportQueue);
}

export async function waitForPendingKnowledgeImports(): Promise<void> {
  runImportQueue();

  while (pendingImportTasks.length > 0 || activeImportTasks.size > 0) {
    if (activeImportTasks.size === 0) {
      runImportQueue();
      continue;
    }

    await Promise.allSettled([...activeImportTasks]);
  }
}

function isSupportedFile(file: File): boolean {
  const extension = extname(file.name).toLowerCase();
  if (
    extension === ".pdf" ||
    extension === ".docx" ||
    TEXT_FILE_EXTENSIONS.has(extension)
  ) {
    return true;
  }

  return Boolean(file.type?.startsWith("text/"));
}

function extractHtmlContent(params: {
  html: string;
  titleFallback: string;
}): ParsedContent {
  const dom = new JSDOM(params.html, {
    url: "https://atlas-kb.local",
  });
  const readable = new Readability(dom.window.document).parse();
  const title =
    readable?.title?.trim() ||
    dom.window.document.title?.trim() ||
    params.titleFallback;
  const content = normalizeWhitespace(
    readable?.textContent || dom.window.document.body?.textContent || "",
  );

  if (!content) {
    throw new BadRequestError("HTML content is empty after extraction");
  }

  return {
    content,
    parser: "html-readability",
    snapshotHtml: params.html,
    title,
  };
}

async function parseFile(file: File): Promise<ParsedContent> {
  const extension = extname(file.name).toLowerCase();
  const displayName = getOriginalFilename(file.name);

  if (!isSupportedFile(file)) {
    throw new BadRequestError(
      "Unsupported file type. Upload PDF, DOCX, markdown, text, HTML, JSON, CSV, XML, or YAML files.",
    );
  }

  if (extension === ".pdf") {
    const parser = new PDFParse({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    const parsed = await parser.getText();
    const content = normalizeWhitespace(parsed.text || "");

    await parser.destroy();

    if (!content) {
      throw new BadRequestError("PDF content could not be extracted");
    }

    return {
      byteSize: file.size,
      content,
      mimeType: file.type || "application/pdf",
      parser: "pdf-parse",
      title: displayName.replace(/\.pdf$/i, "") || "PDF Document",
    };
  }

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    const content = normalizeWhitespace(result.value || "");

    if (!content) {
      throw new BadRequestError("DOCX content could not be extracted");
    }

    return {
      byteSize: file.size,
      content,
      mimeType:
        file.type ||
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      parser: "mammoth",
      title: displayName.replace(/\.docx$/i, "") || "DOCX Document",
    };
  }

  if (extension === ".html" || file.type === "text/html") {
    return {
      ...extractHtmlContent({
        html: await file.text(),
        titleFallback: displayName.replace(/\.html$/i, "") || "HTML Document",
      }),
      byteSize: file.size,
      mimeType: file.type || "text/html",
    };
  }

  const content = normalizeWhitespace(await file.text());
  if (!content) {
    throw new BadRequestError("Uploaded file is empty");
  }

  return {
    byteSize: file.size,
    content,
    mimeType: file.type || undefined,
    parser: "plain-text",
    title: displayName.replace(/\.[^/.]+$/, "") || displayName,
  };
}

async function storeUploadedFile(params: {
  collectionId: string;
  file: File;
}): Promise<string> {
  const uploadsDir = resolve(getKnowledgeUploadsDir(), params.collectionId);
  const safeFilename = sanitizeFilename(params.file.name);
  const storageName = `${Date.now()}-${safeFilename}`;
  const storagePath = resolve(uploadsDir, storageName);

  await mkdir(uploadsDir, { recursive: true });
  await writeFile(storagePath, new Uint8Array(await params.file.arrayBuffer()));

  return storagePath;
}

async function fetchUrlContent(url: string): Promise<{
  contentType: string;
  html?: string;
  text: string;
  title: string;
}> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new BadRequestError(
      `Failed to fetch URL with status ${response.status}`,
    );
  }

  const contentType = response.headers.get("Content-Type") || "text/plain";
  const body = await response.text();

  if (contentType.includes("text/html")) {
    const parsed = extractHtmlContent({
      html: body,
      titleFallback: url,
    });

    return {
      contentType,
      html: parsed.snapshotHtml,
      text: parsed.content,
      title: parsed.title,
    };
  }

  return {
    contentType,
    text: normalizeWhitespace(body),
    title: url,
  };
}

async function finalizeImport(params: {
  collectionId: string;
  draft: KnowledgeSource;
  job: KnowledgeImportJob;
  parsed: ParsedContent;
  tags: string[];
  summary?: string;
  sourceFilename?: string;
  sourceUrl?: string;
  filePath?: string;
}): Promise<ImportResult> {
  await updateImportJob({
    jobId: params.job.id,
    stage: "chunking",
    status: "processing",
  });

  const source = await replaceSourceContent({
    sourceId: params.draft.id,
    title: params.parsed.title,
    summary: params.summary,
    content: params.parsed.content,
    tags: params.tags,
    parser: params.parsed.parser,
    mimeType: params.parsed.mimeType,
    byteSize: params.parsed.byteSize,
    filePath: params.filePath,
    snapshotHtml: params.parsed.snapshotHtml,
    sourceFilename: params.sourceFilename,
    sourceUrl: params.sourceUrl,
    status: "ready",
  });

  await updateImportJob({
    jobId: params.job.id,
    stage: "embedding",
    status: "processing",
  });

  const indexed = await replaceKnowledgeSourceVectorIndex(source.id).catch(
    (error) => {
      console.warn(
        `[atlas-kb/mastra] vector index fallback for "${source.id}": ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      return false;
    },
  );

  await updateImportJob({
    jobId: params.job.id,
    stage: "completed",
    status: "ready",
  });

  const collection = await requireKnowledgeCollection(params.collectionId);

  return {
    collection,
    source,
    job: {
      ...params.job,
      stage: "completed",
      status: "ready",
      finishedAt: new Date().toISOString(),
    },
    engine: indexed ? "hybrid" : "lexical",
    indexed,
  };
}

async function failImport(params: {
  draft: KnowledgeSource;
  job: KnowledgeImportJob;
  error: unknown;
}): Promise<ImportResult> {
  const message =
    params.error instanceof Error ? params.error.message : "Import failed";

  const source = await replaceSourceContent({
    sourceId: params.draft.id,
    title: params.draft.title,
    summary: params.draft.summary,
    content: params.draft.content,
    tags: params.draft.tags,
    parser: "failed-import",
    status: "failed",
    failureMessage: message,
    sourceFilename: params.draft.sourceFilename,
    sourceUrl: params.draft.sourceUrl,
  });

  await updateImportJob({
    jobId: params.job.id,
    stage: "completed",
    status: "failed",
    errorMessage: message,
  });

  const collection = await requireKnowledgeCollection(
    params.draft.collectionId,
  );

  return {
    collection,
    source,
    job: {
      ...params.job,
      stage: "completed",
      status: "failed",
      errorMessage: message,
      finishedAt: new Date().toISOString(),
    },
    engine: "lexical",
    indexed: false,
  };
}

async function processQueuedFileImport(
  params: QueuedFileImportTask,
): Promise<void> {
  try {
    await updateImportJob({
      jobId: params.job.id,
      stage: "fetching",
      status: "processing",
    });

    const buffer = await readFile(params.filePath);

    await updateImportJob({
      jobId: params.job.id,
      stage: "extracting",
      status: "processing",
    });

    const file = new File([buffer], params.sourceFilename, {
      type: params.mimeType,
    });
    const parsed = await parseFile(file);

    await finalizeImport({
      collectionId: params.collectionId,
      draft: params.draft,
      job: params.job,
      parsed: {
        ...parsed,
        title: params.title,
      },
      tags: params.tags,
      summary: params.summary,
      sourceFilename: params.sourceFilename,
      filePath: params.filePath,
    });
  } catch (error) {
    await failImport({
      draft: params.draft,
      job: params.job,
      error,
    });
  }
}

export async function importKnowledgeFile(params: {
  collectionId: string;
  file: File;
  input?: KnowledgeFileImportRequest;
}): Promise<ImportResult> {
  await requireKnowledgeCollection(params.collectionId);

  if (!isSupportedFile(params.file)) {
    throw new BadRequestError(
      "Unsupported file type. Upload PDF, DOCX, markdown, text, HTML, JSON, CSV, XML, or YAML files.",
    );
  }

  const originalFilename = getOriginalFilename(params.file.name);
  const sourceFilename = getOriginalFilename(
    params.input?.fileName?.trim() || originalFilename,
  );
  const title = resolveDraftTitle({
    title: params.input?.title,
    fallback: resolveFilenameTitle(sourceFilename),
  });
  const filePath = await storeUploadedFile({
    collectionId: params.collectionId,
    file: params.file,
  });
  const draft = await createSourceDraft({
    collectionId: params.collectionId,
    sourceType: "file",
    title,
    summary: params.input?.summary,
    tags: params.input?.tags,
    sourceFilename,
    mimeType: params.file.type || undefined,
    byteSize: params.file.size || undefined,
  });
  const job = await createImportJob({
    collectionId: params.collectionId,
    sourceId: draft.id,
    sourceType: "file",
    attempt: 1,
  });
  const collection = await requireKnowledgeCollection(params.collectionId);

  scheduleImportTask(() =>
    processQueuedFileImport({
      collectionId: params.collectionId,
      draft,
      job,
      filePath,
      sourceFilename,
      title,
      summary: params.input?.summary,
      tags: params.input?.tags ?? [],
      mimeType: params.file.type || undefined,
    }),
  );

  return createQueuedImportResult({
    collection,
    source: draft,
    job,
  });
}

export async function importKnowledgeText(params: {
  collectionId: string;
  input: KnowledgeTextImportRequest;
}): Promise<ImportResult> {
  await requireKnowledgeCollection(params.collectionId);
  const title = resolveDraftTitle({
    title: params.input.title,
    fallback: resolveTextTitle(params.input.content),
  });
  const draft = await createSourceDraft({
    collectionId: params.collectionId,
    sourceType: "text",
    title,
    summary: params.input.summary,
    tags: params.input.tags,
  });
  const job = await createImportJob({
    collectionId: params.collectionId,
    sourceId: draft.id,
    sourceType: "text",
    attempt: 1,
  });

  try {
    return await finalizeImport({
      collectionId: params.collectionId,
      draft,
      job,
      parsed: {
        content: normalizeWhitespace(params.input.content),
        parser: "plain-text",
        title,
      },
      tags: params.input.tags ?? [],
      summary: params.input.summary,
    });
  } catch (error) {
    return failImport({
      draft,
      job,
      error,
    });
  }
}

export async function importKnowledgeUrl(params: {
  collectionId: string;
  input: KnowledgeUrlImportRequest;
}): Promise<ImportResult> {
  await requireKnowledgeCollection(params.collectionId);
  const fetched = await fetchUrlContent(params.input.url);
  const title = resolveDraftTitle({
    title: params.input.title,
    fallback: fetched.title,
  });
  const draft = await createSourceDraft({
    collectionId: params.collectionId,
    sourceType: "url",
    title,
    summary: params.input.summary,
    tags: params.input.tags,
    sourceUrl: params.input.url,
    mimeType: fetched.contentType,
  });
  const job = await createImportJob({
    collectionId: params.collectionId,
    sourceId: draft.id,
    sourceType: "url",
    attempt: 1,
  });

  try {
    return await finalizeImport({
      collectionId: params.collectionId,
      draft,
      job,
      parsed: {
        content: fetched.text,
        mimeType: fetched.contentType,
        parser: fetched.html ? "html-readability" : "remote-text",
        snapshotHtml: fetched.html,
        title,
      },
      tags: params.input.tags ?? [],
      summary: params.input.summary,
      sourceUrl: params.input.url,
    });
  } catch (error) {
    return failImport({
      draft,
      job,
      error,
    });
  }
}

export async function refreshKnowledgeSource(
  sourceId: string,
): Promise<ImportResult> {
  const source = await requireKnowledgeSource(sourceId);

  if (source.sourceType !== "url" || !source.sourceUrl) {
    throw new BadRequestError("Only URL sources can be refreshed");
  }

  const attempt = (await getLatestSourceVersion(sourceId))?.version ?? 1;
  const job = await createImportJob({
    collectionId: source.collectionId,
    sourceId,
    sourceType: source.sourceType,
    attempt,
  });

  try {
    const fetched = await fetchUrlContent(source.sourceUrl);

    return await finalizeImport({
      collectionId: source.collectionId,
      draft: source,
      job,
      parsed: {
        content: fetched.text,
        mimeType: fetched.contentType,
        parser: fetched.html ? "html-readability" : "remote-text",
        snapshotHtml: fetched.html,
        title: source.title,
      },
      tags: source.tags,
      summary: source.summary,
      sourceUrl: source.sourceUrl,
    });
  } catch (error) {
    return failImport({
      draft: source,
      job,
      error,
    });
  }
}

export async function retryKnowledgeSource(
  sourceId: string,
): Promise<ImportResult> {
  const source = await requireKnowledgeSource(sourceId);
  const latestVersion = await getLatestSourceVersion(sourceId);
  const attempt = Math.max(
    (latestVersion?.version ?? source.latestVersion) + 1,
    1,
  );

  if (source.sourceType === "url" && source.sourceUrl) {
    return refreshKnowledgeSource(sourceId);
  }

  if (source.sourceType === "file" && latestVersion?.filePath) {
    const job = await createImportJob({
      collectionId: source.collectionId,
      sourceId,
      sourceType: source.sourceType,
      attempt,
    });

    try {
      const buffer = await readFile(latestVersion.filePath);
      const file = new File(
        [buffer],
        source.sourceFilename || `${source.title}.txt`,
        {
          type: latestVersion.mimeType,
        },
      );
      const parsed = await parseFile(file);

      return await finalizeImport({
        collectionId: source.collectionId,
        draft: source,
        job,
        parsed: {
          ...parsed,
          title: source.title,
        },
        tags: source.tags,
        summary: source.summary,
        sourceFilename: source.sourceFilename,
        filePath: latestVersion.filePath,
      });
    } catch (error) {
      return failImport({
        draft: source,
        job,
        error,
      });
    }
  }

  const job = await createImportJob({
    collectionId: source.collectionId,
    sourceId,
    sourceType: source.sourceType,
    attempt,
  });

  try {
    return await finalizeImport({
      collectionId: source.collectionId,
      draft: source,
      job,
      parsed: {
        content: latestVersion?.content || source.content,
        mimeType: latestVersion?.mimeType || source.mimeType,
        parser: latestVersion?.parser || "plain-text",
        title: source.title,
      },
      tags: source.tags,
      summary: source.summary,
      sourceFilename: source.sourceFilename,
      sourceUrl: source.sourceUrl,
      filePath: latestVersion?.filePath,
    });
  } catch (error) {
    return failImport({
      draft: source,
      job,
      error,
    });
  }
}

export async function updateKnowledgeSource(
  sourceId: string,
  input: KnowledgeSourceUpdateRequest,
): Promise<KnowledgeSource> {
  const source = await requireKnowledgeSource(sourceId);

  return replaceSourceContent({
    sourceId,
    title: input.title?.trim() || source.title,
    summary: input.summary?.trim() || source.summary,
    content: source.content,
    tags: input.tags ?? source.tags,
    parser: "metadata-update",
    mimeType: source.mimeType,
    byteSize: source.byteSize,
    sourceFilename: source.sourceFilename,
    sourceUrl: source.sourceUrl,
    status: input.status ?? source.status,
  });
}

export async function uploadKnowledgeDocument(params: {
  file: File;
  metadata?: KnowledgeUploadMetadata;
  spaceId: string;
}): Promise<{
  document: KnowledgeSource;
  space: KnowledgeCollection;
  engine: KnowledgeRetrievalEngine;
  indexed: boolean;
}> {
  const result = await importKnowledgeFile({
    collectionId: params.spaceId,
    file: params.file,
    input: {
      title: params.metadata?.title,
      summary: params.metadata?.summary,
      tags: params.metadata?.tags,
    },
  });

  return {
    document: result.source,
    space: result.collection,
    engine: result.engine,
    indexed: result.indexed,
  };
}

function toBatchFailure(params: {
  error: unknown;
  file: File;
}): KnowledgeBatchImportItem {
  const errorMessage =
    params.error instanceof Error ? params.error.message : "Import failed";

  return {
    fileName: getOriginalFilename(params.file.name),
    mimeType: params.file.type || undefined,
    byteSize: params.file.size,
    accepted: false,
    errorMessage,
  };
}

function toBatchAccepted(params: {
  file: File;
  result: ImportResult;
}): KnowledgeBatchImportItem {
  return {
    fileName: getOriginalFilename(params.file.name),
    mimeType: params.file.type || undefined,
    byteSize: params.file.size,
    accepted: true,
    source: params.result.source,
    job: params.result.job,
  };
}

export async function importKnowledgeFiles(params: {
  collectionId: string;
  files: File[];
  input?: KnowledgeBatchFileImportRequest;
}): Promise<KnowledgeBatchImportData> {
  await requireKnowledgeCollection(params.collectionId);

  const results: KnowledgeBatchImportItem[] = [];

  for (const file of params.files) {
    try {
      const result = await importKnowledgeFile({
        collectionId: params.collectionId,
        file,
        input: {
          summary: params.input?.summary,
          tags: params.input?.tags,
        },
      });

      results.push(
        toBatchAccepted({
          file,
          result,
        }),
      );
    } catch (error) {
      results.push(
        toBatchFailure({
          error,
          file,
        }),
      );
    }
  }

  const collection = await requireKnowledgeCollection(params.collectionId);
  const acceptedCount = results.filter((item) => item.accepted).length;
  const rejectedCount = results.length - acceptedCount;

  return {
    collection,
    results,
    totalCount: results.length,
    acceptedCount,
    rejectedCount,
  };
}
