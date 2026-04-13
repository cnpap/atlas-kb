import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod/v4";
import { getKnowledgeWorkspace } from "./runtime";
import {
  replaceSourceContent,
  requireKnowledgeSourceRow,
} from "./sources-repository";
import {
  indexKnowledgeSourceContent,
  removeKnowledgeSourceChunks,
} from "./source-indexing";

const KnowledgeSourceImportWorkflowInputSchema = z.object({
  collectionId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

const KnowledgeSourceImportWorkflowOutputSchema = z.object({
  sourceId: z.string().trim().min(1),
  status: z.enum(["failed", "ready", "skipped"]),
});

const TERMINAL_WORKFLOW_STATUSES = new Set([
  "bailed",
  "canceled",
  "failed",
  "success",
  "suspended",
  "tripwire",
]);

const activeKnowledgeImportRunIds = new Set<string>();

function summarizeImportFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 280);
  }

  return "文件解析或索引失败，请稍后重试。";
}

async function readIndexableSourceContent(args: {
  documentId: string;
  workspace: Awaited<ReturnType<typeof getKnowledgeWorkspace>>;
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

  return content;
}

async function runKnowledgeSourceImport(args: {
  sourceId: string;
  userId: string;
}): Promise<z.infer<typeof KnowledgeSourceImportWorkflowOutputSchema>> {
  const source = await requireKnowledgeSourceRow(
    args.userId,
    args.sourceId,
  ).catch(() => null);

  if (!source) {
    return {
      sourceId: args.sourceId,
      status: "skipped",
    };
  }

  if (source.source_type !== "file") {
    return {
      sourceId: source.id,
      status: "skipped",
    };
  }

  const documentId = source.document_id || source.source_filename;

  if (!documentId) {
    await replaceSourceContent({
      userId: args.userId,
      sourceId: source.id,
      documentId: source.id,
      title: source.title,
      content: undefined,
      mimeType: source.mime_type ?? undefined,
      byteSize:
        source.byte_size === null || source.byte_size === undefined
          ? undefined
          : Number(source.byte_size),
      sourceFilename: source.source_filename ?? source.id,
      indexChunkCount: 0,
      status: "failed",
      failureMessage: `资料 "${source.id}" 缺少必要文件信息`,
    });

    return {
      sourceId: source.id,
      status: "failed",
    };
  }

  const workspace = await getKnowledgeWorkspace({
    userId: args.userId,
    collectionId: source.collection_id,
  });

  try {
    await removeKnowledgeSourceChunks({
      workspace,
      sourceId: source.id,
      chunkCount: Number(source.index_chunk_count ?? 0),
    });

    const content = await readIndexableSourceContent({
      workspace,
      documentId,
    });
    const indexed = await indexKnowledgeSourceContent({
      content,
      source: {
        id: source.id,
        documentId,
        mimeType: source.mime_type ?? undefined,
        sourceFilename: source.source_filename ?? documentId,
      },
      workspace,
    });

    await replaceSourceContent({
      userId: args.userId,
      sourceId: source.id,
      documentId,
      title: source.title,
      content: undefined,
      mimeType: source.mime_type ?? undefined,
      byteSize:
        source.byte_size === null || source.byte_size === undefined
          ? undefined
          : Number(source.byte_size),
      sourceFilename: source.source_filename ?? documentId,
      indexChunkCount: indexed.chunkCount,
      status: "ready",
      failureMessage: undefined,
    });

    return {
      sourceId: source.id,
      status: "ready",
    };
  } catch (error) {
    console.error("[knowledge:import] source import failed", {
      collectionId: source.collection_id,
      documentId,
      error: error instanceof Error ? error.message : String(error),
      sourceId: source.id,
      userId: args.userId,
    });

    await removeKnowledgeSourceChunks({
      workspace,
      sourceId: source.id,
      chunkCount: Number(source.index_chunk_count ?? 0),
    }).catch(() => undefined);

    await replaceSourceContent({
      userId: args.userId,
      sourceId: source.id,
      documentId,
      title: source.title,
      content: undefined,
      mimeType: source.mime_type ?? undefined,
      byteSize:
        source.byte_size === null || source.byte_size === undefined
          ? undefined
          : Number(source.byte_size),
      sourceFilename: source.source_filename ?? documentId,
      indexChunkCount: 0,
      status: "failed",
      failureMessage: summarizeImportFailureMessage(error),
    }).catch(() => undefined);

    return {
      sourceId: source.id,
      status: "failed",
    };
  }
}

const knowledgeSourceImportStep = createStep({
  id: "index-knowledge-source",
  inputSchema: KnowledgeSourceImportWorkflowInputSchema,
  outputSchema: KnowledgeSourceImportWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    return runKnowledgeSourceImport({
      userId: inputData.userId,
      sourceId: inputData.sourceId,
    });
  },
});

export const knowledgeSourceImportWorkflow = createWorkflow({
  id: "knowledge-source-import",
  inputSchema: KnowledgeSourceImportWorkflowInputSchema,
  outputSchema: KnowledgeSourceImportWorkflowOutputSchema,
})
  .then(knowledgeSourceImportStep)
  .commit();

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function enqueueKnowledgeSourceImport(args: {
  collectionId: string;
  sourceId: string;
  userId: string;
}): Promise<{ runId: string }> {
  const run = await knowledgeSourceImportWorkflow.createRun({
    resourceId: args.sourceId,
  });
  const { runId } = await run.startAsync({
    inputData: args,
  });

  activeKnowledgeImportRunIds.add(runId);

  return {
    runId,
  };
}

export async function waitForPendingKnowledgeImports(): Promise<void> {
  while (activeKnowledgeImportRunIds.size > 0) {
    for (const runId of [...activeKnowledgeImportRunIds]) {
      const state = await knowledgeSourceImportWorkflow
        .getWorkflowRunById(runId)
        .catch(() => null);

      if (!state || TERMINAL_WORKFLOW_STATUSES.has(state.status)) {
        activeKnowledgeImportRunIds.delete(runId);
      }
    }

    if (activeKnowledgeImportRunIds.size > 0) {
      await sleep(25);
    }
  }
}
