import type { KnowledgeSource } from "@atlas-kb/schema";
import type { Workspace } from "@mastra/core/workspace";
import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import {
  buildKnowledgeChunkId,
  buildKnowledgeChunkRef,
  buildKnowledgeChunks,
} from "./chunking";

type SearchEngineLike = {
  remove(id: string): Promise<void>;
};

type WorkspaceSearchInternals = {
  _searchEngine?: SearchEngineLike;
};

function getWorkspaceSearchEngine(
  workspace: Workspace<WorkspaceFilesystem>,
): SearchEngineLike | undefined {
  return (workspace as unknown as WorkspaceSearchInternals)._searchEngine;
}

export type IndexedKnowledgeSourceContent = {
  chunkCount: number;
  text: string;
};

export async function removeKnowledgeSourceChunks(args: {
  chunkCount: number;
  sourceId: string;
  workspace: Workspace<WorkspaceFilesystem>;
}): Promise<void> {
  const searchEngine = getWorkspaceSearchEngine(args.workspace);

  if (!searchEngine || args.chunkCount <= 0) {
    return;
  }

  for (let ordinal = 0; ordinal < args.chunkCount; ordinal += 1) {
    await searchEngine
      .remove(buildKnowledgeChunkId(args.sourceId, ordinal))
      .catch(() => undefined);
  }
}

export async function indexKnowledgeSourceContent(args: {
  content: string;
  source: Pick<
    KnowledgeSource,
    "documentId" | "id" | "mimeType" | "sourceFilename"
  >;
  workspace: Workspace<WorkspaceFilesystem>;
}): Promise<IndexedKnowledgeSourceContent> {
  const text = args.content.trim();

  if (!text) {
    throw new Error("当前文件没有可索引的文本内容");
  }

  const chunks = buildKnowledgeChunks(text);

  if (chunks.length === 0) {
    throw new Error("当前文件没有可索引的文本内容");
  }

  let indexedCount = 0;

  try {
    for (let ordinal = 0; ordinal < chunks.length; ordinal += 1) {
      const chunk = chunks[ordinal]!;
      const chunkId = buildKnowledgeChunkId(args.source.id, ordinal);

      await args.workspace.index(chunkId, chunk, {
        mimeType: args.source.mimeType,
        metadata: {
          chunkId: buildKnowledgeChunkRef(args.source.id, ordinal),
          ordinal,
          path:
            args.source.documentId ??
            args.source.sourceFilename ??
            args.source.id,
          sourceFilename: args.source.sourceFilename,
          sourceId: args.source.id,
        },
      });
      indexedCount = ordinal + 1;
    }
  } catch (error) {
    await removeKnowledgeSourceChunks({
      workspace: args.workspace,
      sourceId: args.source.id,
      chunkCount: indexedCount,
    }).catch(() => undefined);
    throw error;
  }

  return {
    chunkCount: chunks.length,
    text,
  };
}
