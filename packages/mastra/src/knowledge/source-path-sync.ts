import type { KnowledgeSource } from "@atlas-kb/schema";
import type { Workspace, WorkspaceFilesystem } from "@mastra/core/workspace";
import { ensureKnowledgeDatabase } from "./db";
import { isKnowledgeSourceContentEditable } from "./document-file-types";
import { type SourceRow, toDbUserId } from "./repository-shared";
import { replaceSourceContent } from "./sources-repository";
import {
  indexKnowledgeSourceContent,
  removeKnowledgeSourceChunks,
} from "./source-indexing";

const SOURCE_PATH_SYNC_COLUMNS = [
  "id",
  "owner_user_id",
  "collection_id",
  "document_id",
  "content",
  "index_chunk_count",
  "source_type",
  "status",
  "source_filename",
  "mime_type",
  "byte_size",
  "failure_message",
  "created_at",
  "updated_at",
] as const;

function normalizePath(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function toByteSize(
  value: number | string | null | undefined,
): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return Number(value);
}

function toReadyLikeStatus(status: string): KnowledgeSource["status"] {
  return status === "archived" ? "archived" : "ready";
}

async function readIndexableSourceContent(args: {
  documentId: string;
  workspace: Workspace<WorkspaceFilesystem>;
}): Promise<string> {
  const filesystem = args.workspace.filesystem;

  if (!filesystem) {
    throw new Error("知识库 workspace 缺少文件系统");
  }

  const fileContent = await filesystem.readFile(args.documentId, {
    encoding: "utf8",
  });
  const content =
    typeof fileContent === "string"
      ? fileContent
      : new TextDecoder().decode(fileContent);

  if (!content.trim()) {
    throw new Error("当前文件没有可索引的文本内容");
  }

  return content.trim();
}

async function restorePreviousChunks(args: {
  documentId: string;
  previousChunkCount: number;
  row: SourceRow;
  sourceFilename: string;
  workspace: Workspace<WorkspaceFilesystem>;
}): Promise<void> {
  if (args.previousChunkCount <= 0) {
    return;
  }

  const restoreContent = isKnowledgeSourceContentEditable({
    documentId: args.documentId,
    sourceFilename: args.sourceFilename,
    mimeType: args.row.mime_type ?? undefined,
  })
    ? args.row.content?.trim() ||
      (await readIndexableSourceContent({
        documentId: args.documentId,
        workspace: args.workspace,
      }).catch(() => ""))
    : await readIndexableSourceContent({
        documentId: args.documentId,
        workspace: args.workspace,
      }).catch(() => "");

  if (!restoreContent.trim()) {
    return;
  }

  await indexKnowledgeSourceContent({
    workspace: args.workspace,
    content: restoreContent,
    source: {
      id: args.row.id,
      documentId: args.documentId,
      mimeType: args.row.mime_type ?? undefined,
      sourceFilename: args.sourceFilename,
    },
  }).catch(() => undefined);
}

async function synchronizeSourcePath(args: {
  rawFilesystem: WorkspaceFilesystem;
  row: SourceRow;
  userId: string;
  workspace: Workspace<WorkspaceFilesystem>;
}): Promise<void> {
  const currentDocumentId = normalizePath(args.row.document_id);
  const sourceFilename = normalizePath(args.row.source_filename);

  if (
    !currentDocumentId ||
    !sourceFilename ||
    currentDocumentId === sourceFilename
  ) {
    return;
  }

  const oldExists = await args.rawFilesystem
    .exists(currentDocumentId)
    .catch(() => false);
  const nextExists = await args.rawFilesystem
    .exists(sourceFilename)
    .catch(() => false);

  if (!oldExists && !nextExists) {
    console.error(
      "[knowledge:path-sync] missing source file for rename repair",
      {
        collectionId: args.row.collection_id,
        currentDocumentId,
        sourceFilename,
        sourceId: args.row.id,
        userId: args.userId,
      },
    );
    return;
  }

  const previousChunkCount = Number(args.row.index_chunk_count ?? 0);
  let nextFileCreated = false;
  let nextIndexedChunkCount = 0;

  try {
    await removeKnowledgeSourceChunks({
      workspace: args.workspace,
      sourceId: args.row.id,
      chunkCount: previousChunkCount,
    });

    if (!nextExists) {
      await args.rawFilesystem.copyFile(currentDocumentId, sourceFilename);
      nextFileCreated = true;
    }

    const content = isKnowledgeSourceContentEditable({
      documentId: sourceFilename,
      sourceFilename,
      mimeType: args.row.mime_type ?? undefined,
    })
      ? args.row.content?.trim() ||
        (await readIndexableSourceContent({
          documentId: sourceFilename,
          workspace: args.workspace,
        }))
      : await readIndexableSourceContent({
          documentId: sourceFilename,
          workspace: args.workspace,
        });
    const indexed = await indexKnowledgeSourceContent({
      workspace: args.workspace,
      content,
      source: {
        id: args.row.id,
        documentId: sourceFilename,
        mimeType: args.row.mime_type ?? undefined,
        sourceFilename,
      },
    });
    nextIndexedChunkCount = indexed.chunkCount;

    await replaceSourceContent({
      userId: args.userId,
      sourceId: args.row.id,
      documentId: sourceFilename,
      content: isKnowledgeSourceContentEditable({
        documentId: sourceFilename,
        sourceFilename,
        mimeType: args.row.mime_type ?? undefined,
      })
        ? content
        : undefined,
      mimeType: args.row.mime_type ?? undefined,
      byteSize: toByteSize(args.row.byte_size),
      sourceFilename,
      indexChunkCount: indexed.chunkCount,
      status: toReadyLikeStatus(args.row.status),
      failureMessage: undefined,
    });

    if (oldExists) {
      await args.rawFilesystem
        .deleteFile(currentDocumentId, {
          force: true,
        })
        .catch(() => undefined);
    }
  } catch (error) {
    if (nextIndexedChunkCount > 0) {
      await removeKnowledgeSourceChunks({
        workspace: args.workspace,
        sourceId: args.row.id,
        chunkCount: nextIndexedChunkCount,
      }).catch(() => undefined);
    }

    if (nextFileCreated) {
      await args.rawFilesystem
        .deleteFile(sourceFilename, {
          force: true,
        })
        .catch(() => undefined);
    }

    await restorePreviousChunks({
      row: args.row,
      sourceFilename,
      documentId: currentDocumentId,
      previousChunkCount,
      workspace: args.workspace,
    });

    console.error("[knowledge:path-sync] failed to repair source path", {
      collectionId: args.row.collection_id,
      currentDocumentId,
      error: error instanceof Error ? error.message : String(error),
      sourceFilename,
      sourceId: args.row.id,
      userId: args.userId,
    });
  }
}

export async function synchronizeKnowledgeSourcePaths(args: {
  collectionId: string;
  rawFilesystem: WorkspaceFilesystem;
  userId: string;
  workspace: Workspace<WorkspaceFilesystem>;
}): Promise<void> {
  const db = await ensureKnowledgeDatabase();
  const rows = await db
    .selectFrom("kb_sources")
    .select(SOURCE_PATH_SYNC_COLUMNS)
    .where("owner_user_id", "=", toDbUserId(args.userId))
    .where("collection_id", "=", args.collectionId)
    .execute();

  for (const row of rows) {
    await synchronizeSourcePath({
      rawFilesystem: args.rawFilesystem,
      row,
      userId: args.userId,
      workspace: args.workspace,
    });
  }
}
