import { createHash, randomUUID } from "node:crypto";
import {
  mkdir as mkdirFs,
  mkdtemp,
  rm,
  writeFile as writeFsFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  BadRequestError,
  ModelProviderUnavailableError,
  UpstreamServiceError,
} from "@atlas-kb/errors";
import type {
  ChatReplyStreamDataEvent,
  KnowledgeExportProcessTraceItem,
  KnowledgeExportTaskGenerateResult,
  KnowledgeTemplateDetail,
} from "@atlas-kb/schema";
import { buildKnowledgeTemplateExportStructuredOutputSchema } from "@atlas-kb/schema";
import type { ChunkType } from "@mastra/core/stream";
import {
  type AnyWorkspace,
  LocalFilesystem,
  WORKSPACE_TOOLS,
  Workspace,
  type WorkspaceFilesystem,
} from "@mastra/core/workspace";
import { createTemplateExportAgent } from "../agents";
import { mapRuntimeModelError } from "../models/runtime-model";
import { createChatReplyStreamEventMapper } from "./chat-stream-events";
import { getTemplateExportTimeoutMs } from "./config";
import {
  unwrapContentProxyFilesystem,
  wrapKnowledgeFilesystemForReading,
} from "./content-proxy";
import { requireKnowledgeSource } from "./repository";
import {
  createKnowledgeCollectionFilesystem,
  createKnowledgeSearchWorkspaceConfig,
  createKnowledgeStoragePrefixFilesystem,
  deleteKnowledgeSearchIndex,
} from "./runtime";
import { isEmptyExtractedContentError } from "./tika";

const TEMPLATE_EXPORT_TIMEOUT_MESSAGE = "模板导出超时，请稍后重试。";
const TEMPLATE_EXPORT_SOURCE_MOUNT_PATH = "/source";
const TEMPLATE_EXPORT_REFERENCE_MOUNT_PATH = "/references";
const TEMPLATE_EXPORT_INDEX_CHUNK_MAX_CHARS = 3_000;
const TEMPLATE_EXPORT_INDEX_CHUNK_OVERLAP_CHARS = 200;
const TEMPLATE_EXPORT_AGENT_MAX_STEPS = 24;
const TEMPLATE_EXPORT_READ_FILE_MAX_TOKENS = 8_000;
const TEMPLATE_EXPORT_LIST_FILES_MAX_TOKENS = 3_000;
const LEARNED_TEXT_EMPTY_MESSAGE = "提取后没有可学习的文本内容";
const LEARNED_CHUNKS_EMPTY_MESSAGE = "提取后没有可学习的文本分块";

type TemplateReferenceLibraryMount = {
  files: TemplateReferenceLibraryFile[];
  id: string;
  mountPath: string;
  name: string;
  storagePrefix: string;
};

type TemplateReferenceLibraryFile = {
  byteSize?: number;
  mimeType?: string;
  sourceFilename: string;
  sourcePath: string;
};

type TemplateIndexedFile = {
  charCount: number;
  chunkCount: number;
  originalPath: string;
  relativePath: string;
};

type TemplateSkippedFile = {
  originalPath: string;
  reason: string;
  relativePath: string;
};

type TemplateIndexedLibrary = {
  files: TemplateIndexedFile[];
  id: string;
  mountPath: string;
  name: string;
  skippedFiles: TemplateSkippedFile[];
  storagePrefix: string;
};

type PreparedTemplateExportContext = {
  directoryMappings: string;
  referenceMountDirectories: string;
  searchIndexName: string;
  sourceMountPath: string;
  tempDir: string;
  workspace: AnyWorkspace;
};

type TemplateExportTraceCollector = {
  add: (item: {
    detail?: string | null;
    kind: KnowledgeExportProcessTraceItem["kind"];
    label: string;
    path?: string | null;
    status: KnowledgeExportProcessTraceItem["status"];
  }) => void;
  addChatEvent: (event: ChatReplyStreamDataEvent) => void;
  items: () => KnowledgeExportProcessTraceItem[];
};

class TemplateExportTimeoutError extends Error {
  constructor() {
    super(TEMPLATE_EXPORT_TIMEOUT_MESSAGE);
    this.name = "TemplateExportTimeoutError";
  }
}

function createTemplateExportTraceCollector(): TemplateExportTraceCollector {
  const items: KnowledgeExportProcessTraceItem[] = [];

  function add(item: {
    detail?: string | null;
    kind: KnowledgeExportProcessTraceItem["kind"];
    label: string;
    path?: string | null;
    status: KnowledgeExportProcessTraceItem["status"];
  }) {
    items.push({
      id: randomUUID(),
      kind: item.kind,
      status: item.status,
      label: item.label,
      detail: item.detail ?? null,
      path: item.path ?? null,
      createdAt: new Date().toISOString(),
    });
  }

  function addChatEvent(event: ChatReplyStreamDataEvent) {
    switch (event.type) {
      case "reply-progress-started":
        add({
          kind: "lifecycle",
          status: "running",
          label: "AI 开始处理导出任务",
        });
        return;
      case "reply-progress-thinking":
        add({
          kind: "thinking",
          status: "running",
          label: event.label,
        });
        return;
      case "reply-progress-tool-started":
      case "reply-progress-tool-succeeded":
      case "reply-progress-tool-failed": {
        const isSearch =
          event.toolName === "mastra_workspace_search" ||
          event.toolName === "search_knowledge";
        const isFailed = event.type === "reply-progress-tool-failed";
        const isCompleted = event.type === "reply-progress-tool-succeeded";

        add({
          kind: event.toolPath ? "file" : isSearch ? "search" : "tool",
          status: isFailed ? "failed" : isCompleted ? "completed" : "running",
          label: event.toolLabel,
          detail: event.toolDetail ?? null,
          path: event.toolPath ?? null,
        });
        return;
      }
      case "reply-progress-step-finished":
        add({
          kind: "lifecycle",
          status: "completed",
          label: "AI 完成一轮分析",
        });
        return;
      case "reply-progress-finished":
        add({
          kind: "result",
          status: "completed",
          label: "AI 完成字段生成",
        });
        return;
      case "reply-progress-failed":
      case "reply-error":
        add({
          kind: "error",
          status: "failed",
          label: event.message,
        });
        return;
      case "reply-accepted":
      case "reply-completed":
        return;
    }
  }

  return {
    add,
    addChatEvent,
    items: () => [...items],
  };
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

function buildTemplateFieldDirectives(
  template: KnowledgeTemplateDetail,
): string {
  return template.fields
    .map((field) => {
      const parts = [`- ${field.name}：字段标签=${field.label}`];

      if (field.description.trim()) {
        parts.push(`字段说明=${field.description.trim()}`);
      }

      return parts.join("；");
    })
    .join("\n");
}

function normalizePathSegments(path: string): string[] {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function normalizeReferenceMountPath(storagePrefix: string): string {
  const segments = normalizePathSegments(storagePrefix);

  if (segments.length === 0) {
    throw new BadRequestError(
      "模板资料库缺少有效的存储前缀，无法创建导出工作区",
    );
  }

  return `${TEMPLATE_EXPORT_REFERENCE_MOUNT_PATH}/${segments.join("/")}`;
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

function buildReferenceLibraryMounts(args: {
  template: KnowledgeTemplateDetail;
}): {
  libraries: TemplateReferenceLibraryMount[];
} {
  const libraries: TemplateReferenceLibraryMount[] = [];
  const registeredPaths = [TEMPLATE_EXPORT_SOURCE_MOUNT_PATH];

  for (const library of args.template.referenceLibraries) {
    const files = library.files ?? [];

    if (files.length === 0) {
      continue;
    }

    const mountPath = normalizeReferenceMountPath(library.storagePrefix);

    if (registeredPaths.some((path) => hasMountPathConflict(path, mountPath))) {
      throw new BadRequestError(
        `模板资料库挂载路径冲突：${mountPath}，无法创建导出工作区`,
      );
    }

    registeredPaths.push(mountPath);
    libraries.push({
      files,
      id: library.id,
      name: library.name,
      mountPath,
      storagePrefix: library.storagePrefix,
    });
  }

  return {
    libraries,
  };
}

function buildTemplateExportSearchIndexName(args: {
  sourceId: string;
  templateId: string;
  userId: string;
}) {
  const seed = `${args.userId}_${args.sourceId}_${args.templateId}_${randomUUID().replaceAll("-", "_")}`;
  const sanitized = seed.replace(/[^a-zA-Z0-9_]+/g, "_").slice(0, 44);
  return `atlas_tpl_export_${sanitized || "run"}`;
}

function decodeFileContent(content: string | Uint8Array): string {
  return typeof content === "string"
    ? content
    : new TextDecoder().decode(content);
}

function toProjectedAbsolutePath(
  basePath: string,
  relativePath: string,
): string {
  return join(basePath, ...normalizePathSegments(relativePath));
}

async function createProjectedSourceFilesystem(args: {
  collectionId: string;
  sourceRelativePaths: string[];
  tempDir: string;
  userId: string;
}): Promise<WorkspaceFilesystem> {
  const projectedBasePath = join(args.tempDir, "source-mount");
  const collectionFilesystem = unwrapContentProxyFilesystem(
    createKnowledgeCollectionFilesystem({
      userId: args.userId,
      collectionId: args.collectionId,
      readOnly: true,
    }),
  );

  for (const relativePath of args.sourceRelativePaths) {
    const projectedAbsolutePath = toProjectedAbsolutePath(
      projectedBasePath,
      relativePath,
    );

    try {
      const fileContent = await collectionFilesystem.readFile(relativePath);
      await mkdirFs(dirname(projectedAbsolutePath), {
        recursive: true,
      });
      await writeFsFile(projectedAbsolutePath, fileContent);
    } catch (error) {
      throw new BadRequestError(
        buildTemplateExportErrorMessage({
          filePath: `${TEMPLATE_EXPORT_SOURCE_MOUNT_PATH}/${relativePath}`,
          message: ` 读取失败：${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
  }

  return wrapKnowledgeFilesystemForReading(
    new LocalFilesystem({
      id: `template-export-source:${args.userId}:${args.collectionId}`,
      basePath: projectedBasePath,
      readOnly: true,
    }),
  );
}

function toPathRelativeToMount(path: string, mountPath: string): string {
  const normalizedPath = `/${buildWorkspaceRelativePath(path)}`;
  const normalizedMount = `/${buildWorkspaceRelativePath(mountPath)}`;

  if (normalizedPath === normalizedMount) {
    return "";
  }

  if (!normalizedPath.startsWith(`${normalizedMount}/`)) {
    throw new BadRequestError(
      `文件路径 ${path} 不在模板资料库挂载路径 ${mountPath} 内`,
    );
  }

  return normalizedPath.slice(normalizedMount.length + 1);
}

function normalizeStorageObjectPath(path: string): string {
  const segments = normalizePathSegments(path);

  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new BadRequestError(`模板资料库文件路径无效：${path}`);
  }

  return segments.join("/");
}

function getReferenceFileRelativePath(args: {
  file: TemplateReferenceLibraryFile;
  library: TemplateReferenceLibraryMount;
}): string {
  const storagePrefix = normalizeStorageObjectPath(args.library.storagePrefix);
  const sourcePath = normalizeStorageObjectPath(args.file.sourcePath);

  if (
    sourcePath !== storagePrefix &&
    !sourcePath.startsWith(`${storagePrefix}/`)
  ) {
    throw new BadRequestError(
      buildTemplateExportErrorMessage({
        libraryName: args.library.name,
        storagePrefix: args.library.storagePrefix,
        message: ` 文件 ${args.file.sourcePath} 不在模板资料库存储前缀 ${args.library.storagePrefix} 内`,
      }),
    );
  }

  const relativePath = sourcePath
    .slice(storagePrefix.length)
    .replace(/^\/+/g, "");

  if (!relativePath) {
    throw new BadRequestError(
      buildTemplateExportErrorMessage({
        libraryName: args.library.name,
        storagePrefix: args.library.storagePrefix,
        message: ` 文件 ${args.file.sourcePath} 缺少相对文件路径`,
      }),
    );
  }

  return relativePath;
}

function buildReferenceWorkspaceFilePath(args: {
  file: TemplateReferenceLibraryFile;
  library: TemplateReferenceLibraryMount;
}): string {
  return `${args.library.mountPath}/${getReferenceFileRelativePath(args)}`;
}

async function createProjectedReferenceFilesystem(args: {
  library: TemplateReferenceLibraryMount;
  tempDir: string;
  userId: string;
}): Promise<WorkspaceFilesystem> {
  const projectedBasePath = join(
    args.tempDir,
    "reference-mounts",
    ...normalizePathSegments(args.library.storagePrefix),
  );
  const storageFilesystem = unwrapContentProxyFilesystem(
    createKnowledgeStoragePrefixFilesystem({
      userId: args.userId,
      storagePrefix: args.library.storagePrefix,
      readOnly: true,
    }),
  );

  await mkdirFs(projectedBasePath, {
    recursive: true,
  });

  for (const file of args.library.files) {
    const relativePath = getReferenceFileRelativePath({
      file,
      library: args.library,
    });
    const projectedAbsolutePath = toProjectedAbsolutePath(
      projectedBasePath,
      relativePath,
    );

    try {
      const fileContent = await storageFilesystem.readFile(relativePath);
      await mkdirFs(dirname(projectedAbsolutePath), {
        recursive: true,
      });
      await writeFsFile(projectedAbsolutePath, fileContent);
    } catch (error) {
      throw new BadRequestError(
        buildTemplateExportErrorMessage({
          filePath: `${args.library.mountPath}/${relativePath}`,
          libraryName: args.library.name,
          storagePrefix: args.library.storagePrefix,
          message: ` 读取失败：${error instanceof Error ? error.message : String(error)}`,
        }),
        error,
      );
    }
  }

  return wrapKnowledgeFilesystemForReading(
    new LocalFilesystem({
      id: `template-export-reference:${args.userId}:${args.library.id}`,
      basePath: projectedBasePath,
      readOnly: true,
    }),
    {
      emptyExtractedContent: "empty",
    },
  );
}

function splitLearnedTextIntoChunks(text: string): string[] {
  const normalized = text.trim();

  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(
      normalized.length,
      start + TEMPLATE_EXPORT_INDEX_CHUNK_MAX_CHARS,
    );
    const chunk = normalized.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(
      end - TEMPLATE_EXPORT_INDEX_CHUNK_OVERLAP_CHARS,
      start + 1,
    );
  }

  return chunks;
}

async function listFilesRecursively(args: {
  filesystem: WorkspaceFilesystem;
  rootPath: string;
}): Promise<string[]> {
  const entries = await args.filesystem.readdir(args.rootPath, {
    recursive: false,
  });
  const files: string[] = [];

  for (const entry of entries) {
    const path =
      args.rootPath === "/"
        ? `/${entry.name}`
        : `${args.rootPath.replace(/\/+$/g, "")}/${entry.name}`;

    if (entry.type === "file") {
      files.push(path);
      continue;
    }

    if (entry.type === "directory" && !entry.isSymlink) {
      files.push(
        ...(await listFilesRecursively({
          filesystem: args.filesystem,
          rootPath: path,
        })),
      );
    }
  }

  return files;
}

function buildTemplateExportErrorMessage(args: {
  filePath?: string;
  libraryName?: string;
  message: string;
  storagePrefix?: string;
}) {
  const scope = args.libraryName
    ? `模板资料库“${args.libraryName}”(${args.storagePrefix ?? "unknown"})`
    : "当前待导出主资料";
  const target = args.filePath ? ` 文件 ${args.filePath}` : "";
  return `${scope}${target}${args.message}`;
}

async function readLearnedTextFile(args: {
  filePath: string;
  libraryName?: string;
  storagePrefix?: string;
  workspace: AnyWorkspace;
}) {
  let fileContent: string | Uint8Array;

  try {
    fileContent = await args.workspace.filesystem.readFile(args.filePath, {
      encoding: "utf8",
    });
  } catch (error) {
    throw new BadRequestError(
      buildTemplateExportErrorMessage({
        filePath: args.filePath,
        libraryName: args.libraryName,
        storagePrefix: args.storagePrefix,
        message: ` 读取失败：${error instanceof Error ? error.message : String(error)}`,
      }),
      error,
    );
  }

  const text = decodeFileContent(fileContent).trim();

  if (!text) {
    throw new BadRequestError(
      buildTemplateExportErrorMessage({
        filePath: args.filePath,
        libraryName: args.libraryName,
        storagePrefix: args.storagePrefix,
        message: ` ${LEARNED_TEXT_EMPTY_MESSAGE}`,
      }),
    );
  }

  return text;
}

export function buildTemplateExportChunkId(args: {
  filePath: string;
  ordinal: number;
  scope: "source" | "reference";
}): string {
  const seed = `atlas-kb:template-export:${args.scope}:${args.filePath}:${args.ordinal}`;
  const bytes = createHash("sha1").update(seed).digest().subarray(0, 16);

  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function indexLearnedFile(args: {
  filePath: string;
  libraryName?: string;
  metadata: Record<string, unknown>;
  relativePath: string;
  storagePrefix?: string;
  workspace: AnyWorkspace;
}): Promise<TemplateIndexedFile> {
  const text = await readLearnedTextFile({
    workspace: args.workspace,
    filePath: args.filePath,
    libraryName: args.libraryName,
    storagePrefix: args.storagePrefix,
  });
  const chunks = splitLearnedTextIntoChunks(text);

  if (chunks.length === 0) {
    throw new BadRequestError(
      buildTemplateExportErrorMessage({
        filePath: args.filePath,
        libraryName: args.libraryName,
        storagePrefix: args.storagePrefix,
        message: ` ${LEARNED_CHUNKS_EMPTY_MESSAGE}`,
      }),
    );
  }

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    try {
      await args.workspace.index(
        buildTemplateExportChunkId({
          filePath: args.filePath,
          ordinal: index,
          scope: args.libraryName ? "reference" : "source",
        }),
        chunk,
        {
          type: "text",
          metadata: {
            ...args.metadata,
            path: args.filePath,
            originalPath: args.filePath,
            relativePath: args.relativePath,
          },
        },
      );
    } catch (error) {
      console.error("[template-export] manual_indexing_failed", {
        filePath: args.filePath,
        libraryName: args.libraryName,
        storagePrefix: args.storagePrefix,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new UpstreamServiceError(
        buildTemplateExportErrorMessage({
          filePath: args.filePath,
          libraryName: args.libraryName,
          storagePrefix: args.storagePrefix,
          message: " 学习索引写入失败，请稍后重试",
        }),
        error,
      );
    }
  }

  return {
    originalPath: args.filePath,
    relativePath: args.relativePath,
    charCount: text.length,
    chunkCount: chunks.length,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorCause(error: unknown): unknown {
  return error instanceof Error ? error.cause : undefined;
}

function isSkippableReferenceFileError(error: unknown): boolean {
  if (isEmptyExtractedContentError(error)) {
    return true;
  }

  if (isEmptyExtractedContentError(getErrorCause(error))) {
    return true;
  }

  return (
    error instanceof BadRequestError &&
    (error.message.includes(LEARNED_TEXT_EMPTY_MESSAGE) ||
      error.message.includes(LEARNED_CHUNKS_EMPTY_MESSAGE))
  );
}

async function prepareReferenceLibrary(args: {
  library: TemplateReferenceLibraryMount;
  trace: TemplateExportTraceCollector;
  workspace: AnyWorkspace;
}): Promise<TemplateIndexedLibrary> {
  const preparedFiles: TemplateIndexedFile[] = [];
  const skippedFiles: TemplateSkippedFile[] = [];

  for (const file of args.library.files) {
    const filePath = buildReferenceWorkspaceFilePath({
      file,
      library: args.library,
    });
    const relativePath = toPathRelativeToMount(
      filePath,
      args.library.mountPath,
    );

    try {
      preparedFiles.push(
        await indexLearnedFile({
          workspace: args.workspace,
          filePath,
          relativePath,
          libraryName: args.library.name,
          storagePrefix: args.library.storagePrefix,
          metadata: {
            contextKind: "reference-library",
            libraryId: args.library.id,
            libraryName: args.library.name,
            mountPath: args.library.mountPath,
            sourceFilename: file.sourceFilename,
            sourceMimeType: file.mimeType,
            sourcePath: file.sourcePath,
            storagePrefix: args.library.storagePrefix,
          },
        }),
      );
      args.trace.add({
        kind: "file",
        status: "completed",
        label: "已读取并索引参考资料",
        detail: args.library.name,
        path: filePath,
      });
    } catch (error) {
      if (!isSkippableReferenceFileError(error)) {
        throw error;
      }

      const skippedFile = {
        originalPath: filePath,
        relativePath,
        reason: getErrorMessage(error),
      };

      skippedFiles.push(skippedFile);
      args.trace.add({
        kind: "file",
        status: "failed",
        label: "参考资料已跳过",
        detail: skippedFile.reason,
        path: filePath,
      });
      console.warn("[template-export] reference_file_skipped", {
        filePath,
        libraryName: args.library.name,
        reason: skippedFile.reason,
        storagePrefix: args.library.storagePrefix,
      });
    }
  }

  return {
    ...args.library,
    files: preparedFiles,
    skippedFiles,
  };
}

function buildDirectoryMappings(args: {
  libraries: TemplateIndexedLibrary[];
  sourceDirectoryFiles: string[];
}) {
  const lines = [
    `- 事实依据目录：${TEMPLATE_EXPORT_SOURCE_MOUNT_PATH}`,
    `- ${TEMPLATE_EXPORT_SOURCE_MOUNT_PATH} 目录文件：${args.sourceDirectoryFiles.length > 0 ? args.sourceDirectoryFiles.join("；") : "空"}`,
    `- 参考资料根目录：${TEMPLATE_EXPORT_REFERENCE_MOUNT_PATH}`,
  ];

  if (args.libraries.length > 0) {
    lines.push("- 参考资料挂载目录：");
  } else {
    lines.push("- 当前没有可挂载的参考资料文件。");
  }

  for (const library of args.libraries) {
    lines.push(`- ${library.mountPath}：资料库名称=${library.name}；仅供参考`);
  }

  return lines.join("\n");
}

function buildReferenceMountDirectories(
  libraries: TemplateIndexedLibrary[],
): string {
  if (libraries.length === 0) {
    return "无";
  }

  return libraries.map((library) => library.mountPath).join("；");
}

async function prepareTemplateExportContext(args: {
  source: Awaited<ReturnType<typeof requireKnowledgeSource>>;
  template: KnowledgeTemplateDetail;
  trace: TemplateExportTraceCollector;
  userId: string;
}): Promise<PreparedTemplateExportContext> {
  args.trace.add({
    kind: "lifecycle",
    status: "running",
    label: "正在准备导出工作区",
    detail: args.template.name,
  });

  const sourceRelativePath = buildWorkspaceRelativePath(
    args.source.documentId ?? args.source.sourceFilename ?? "",
  );
  const sourcePath = `${TEMPLATE_EXPORT_SOURCE_MOUNT_PATH}/${sourceRelativePath}`;
  const referenceLibraries = buildReferenceLibraryMounts({
    template: args.template,
  });
  const tempDir = await mkdtemp(join(tmpdir(), "atlas-kb-template-export-"));
  const searchIndexName = buildTemplateExportSearchIndexName({
    userId: args.userId,
    sourceId: args.source.id,
    templateId: args.template.id,
  });
  const searchConfig = await createKnowledgeSearchWorkspaceConfig({
    userId: args.userId,
    indexName: searchIndexName,
  });
  const projectedSourceFilesystem = await createProjectedSourceFilesystem({
    userId: args.userId,
    collectionId: args.source.collectionId,
    sourceRelativePaths: [sourceRelativePath],
    tempDir,
  });
  const referenceMounts: Record<string, WorkspaceFilesystem> = {};

  for (const library of referenceLibraries.libraries) {
    referenceMounts[library.mountPath] =
      await createProjectedReferenceFilesystem({
        library,
        tempDir,
        userId: args.userId,
      });
  }

  const workspace = new Workspace({
    id: `template-export:${args.userId}:${args.source.id}:${args.template.id}`,
    name: `${args.template.name} Export Workspace`,
    mounts: {
      [TEMPLATE_EXPORT_SOURCE_MOUNT_PATH]: projectedSourceFilesystem,
      ...referenceMounts,
    },
    tools: {
      [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: {
        maxOutputTokens: TEMPLATE_EXPORT_READ_FILE_MAX_TOKENS,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: {
        maxOutputTokens: TEMPLATE_EXPORT_LIST_FILES_MAX_TOKENS,
      },
    },
    ...searchConfig,
  });

  await workspace.init();
  args.trace.add({
    kind: "lifecycle",
    status: "completed",
    label: "导出工作区已挂载",
    detail: `主资料目录 ${TEMPLATE_EXPORT_SOURCE_MOUNT_PATH}`,
  });

  let sourceDirectoryFiles: string[];

  try {
    sourceDirectoryFiles = await listFilesRecursively({
      filesystem: workspace.filesystem,
      rootPath: TEMPLATE_EXPORT_SOURCE_MOUNT_PATH,
    });
  } catch (error) {
    throw new BadRequestError(
      `当前待导出主资料目录 ${TEMPLATE_EXPORT_SOURCE_MOUNT_PATH} 挂载后无法遍历：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  console.info("[template-export] mount_validation", {
    sourceId: args.source.id,
    sourceDirectoryFileCount: sourceDirectoryFiles.length,
    sourceDirectoryFiles,
    sourcePath,
    templateId: args.template.id,
    templateName: args.template.name,
    userId: args.userId,
    referenceLibraries: referenceLibraries.libraries.map((library) => ({
      id: library.id,
      fileCount: library.files.length,
      mountPath: library.mountPath,
      name: library.name,
      storagePrefix: library.storagePrefix,
    })),
  });

  const preparedSource = await indexLearnedFile({
    workspace,
    filePath: sourcePath,
    relativePath: sourceRelativePath,
    metadata: {
      contextKind: "source",
      sourceId: args.source.id,
      sourceFilename: args.source.sourceFilename,
      mountPath: TEMPLATE_EXPORT_SOURCE_MOUNT_PATH,
    },
  });
  args.trace.add({
    kind: "file",
    status: "completed",
    label: "已读取并索引主资料",
    detail: args.source.sourceFilename,
    path: preparedSource.originalPath,
  });
  const preparedLibraries: TemplateIndexedLibrary[] = [];

  for (const library of referenceLibraries.libraries) {
    preparedLibraries.push(
      await prepareReferenceLibrary({
        library,
        trace: args.trace,
        workspace,
      }),
    );
  }

  console.info("[template-export] content_extraction", {
    sourceId: args.source.id,
    templateId: args.template.id,
    source: {
      charCount: preparedSource.charCount,
      chunkCount: preparedSource.chunkCount,
      originalPath: preparedSource.originalPath,
    },
    referenceLibraries: preparedLibraries.map((library) => ({
      id: library.id,
      mountPath: library.mountPath,
      name: library.name,
      storagePrefix: library.storagePrefix,
      fileCount: library.files.length,
      skippedFileCount: library.skippedFiles.length,
      skippedFiles: library.skippedFiles.map((file) => file.originalPath),
      totalChunkCount: library.files.reduce(
        (sum, file) => sum + file.chunkCount,
        0,
      ),
    })),
  });

  console.info("[template-export] manual_indexing", {
    searchIndexName,
    templateId: args.template.id,
    totalLearnedChunkCount:
      preparedSource.chunkCount +
      preparedLibraries.reduce((sum, library) => {
        return (
          sum +
          library.files.reduce((fileSum, file) => fileSum + file.chunkCount, 0)
        );
      }, 0),
    totalLearnedFileCount:
      1 +
      preparedLibraries.reduce((sum, library) => sum + library.files.length, 0),
    totalSkippedReferenceFileCount: preparedLibraries.reduce(
      (sum, library) => sum + library.skippedFiles.length,
      0,
    ),
    userId: args.userId,
  });

  return {
    workspace,
    tempDir,
    searchIndexName,
    sourceMountPath: TEMPLATE_EXPORT_SOURCE_MOUNT_PATH,
    directoryMappings: buildDirectoryMappings({
      libraries: preparedLibraries,
      sourceDirectoryFiles,
    }),
    referenceMountDirectories:
      buildReferenceMountDirectories(preparedLibraries),
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

function requireStructuredOutputObject(args: {
  output: {
    object: unknown;
  };
  template: KnowledgeTemplateDetail;
}): Record<string, unknown> {
  const schema = buildKnowledgeTemplateExportStructuredOutputSchema(
    args.template.fields,
  );

  const parsed = schema.safeParse(args.output.object);

  if (!parsed.success) {
    throw new Error("模板导出未返回有效的结构化结果");
  }

  return parsed.data as Record<string, unknown>;
}

async function generateWithAgent(args: {
  source: Awaited<ReturnType<typeof requireKnowledgeSource>>;
  template: KnowledgeTemplateDetail;
  trace: TemplateExportTraceCollector;
  userId: string;
}): Promise<Record<string, string>> {
  let preparedContext: PreparedTemplateExportContext | undefined;

  try {
    preparedContext = await prepareTemplateExportContext(args);

    const agent = createTemplateExportAgent({
      workspace: preparedContext.workspace,
      sourceMountPath: preparedContext.sourceMountPath,
      directoryMappings: preparedContext.directoryMappings,
      referenceMountDirectories: preparedContext.referenceMountDirectories,
      templateName: args.template.name,
      systemPrompt: args.template.systemPrompt,
      fieldDirectives: buildTemplateFieldDirectives(args.template),
    });
    const structuredOutputSchema =
      buildKnowledgeTemplateExportStructuredOutputSchema(args.template.fields);
    const options = {
      maxSteps: TEMPLATE_EXPORT_AGENT_MAX_STEPS,
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
    const progressMapper = createChatReplyStreamEventMapper();
    const stream = await withTimeout(
      agent.stream(
        `请基于当前 workspace 中的主资料和模板资料库文件，完成模板《${args.template.name}》的字段提取。`,
        options,
      ),
      getTemplateExportTimeoutMs(),
    );
    const output = await withTimeout(
      (async () => {
        for await (const chunk of stream.fullStream as AsyncIterable<
          ChunkType<undefined>
        >) {
          for (const event of progressMapper.mapChunk(chunk)) {
            args.trace.addChatEvent(event);
          }
        }

        const finishedEvent = progressMapper.ensureFinished();

        if (finishedEvent) {
          args.trace.addChatEvent(finishedEvent);
        }

        return stream.getFullOutput();
      })(),
      getTemplateExportTimeoutMs(),
    );

    console.info("[template-export] model_generation", {
      searchIndexName: preparedContext.searchIndexName,
      sourceId: args.source.id,
      templateId: args.template.id,
      templateName: args.template.name,
      timeoutMs: getTemplateExportTimeoutMs(),
      userId: args.userId,
    });

    const parameters = mapStructuredOutputToParameters({
      template: args.template,
      output: requireStructuredOutputObject({
        template: args.template,
        output,
      }),
    });

    args.trace.add({
      kind: "result",
      status: "completed",
      label: "字段参数已生成",
      detail: `共 ${Object.keys(parameters).length} 个字段`,
    });

    return parameters;
  } catch (error) {
    args.trace.add({
      kind: "error",
      status: "failed",
      label: "导出过程失败",
      detail: getErrorMessage(error),
    });

    throw mapTemplateExportError(error);
  } finally {
    await preparedContext?.workspace.destroy().catch(() => undefined);

    if (preparedContext?.searchIndexName) {
      await deleteKnowledgeSearchIndex(preparedContext.searchIndexName);
    }

    if (preparedContext?.tempDir) {
      await rm(preparedContext.tempDir, {
        recursive: true,
        force: true,
      }).catch(() => undefined);
    }
  }
}

export async function generateKnowledgeTemplateExportPayload(args: {
  sourceId: string;
  template: KnowledgeTemplateDetail;
  userId: string;
}): Promise<KnowledgeExportTaskGenerateResult> {
  const source = await requireKnowledgeSource(args.userId, args.sourceId);
  const trace = createTemplateExportTraceCollector();

  return {
    parameters: await generateWithAgent({
      source,
      template: args.template,
      trace,
      userId: args.userId,
    }),
    citations: [],
    processTrace: trace.items(),
  };
}
