import { NotFoundError } from "@atlas-kb/errors";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  getDocumentById,
  getStoredSourceRecord,
  requireKnowledgeSource,
} from "./repository";

function buildDownloadFilename(params: {
  sourceFilename?: string;
  title: string;
  sourceType: string;
}) {
  if (params.sourceFilename?.trim()) {
    return basename(params.sourceFilename);
  }

  if (params.sourceType === "url") {
    return `${params.title}.html`;
  }

  return `${params.title}.txt`;
}

export async function getKnowledgeSourceDownload(params: {
  userId: string;
  sourceId: string;
}): Promise<{
  body: Uint8Array;
  filename: string;
  mimeType: string;
}> {
  const source = await requireKnowledgeSource(params.userId, params.sourceId);
  const stored = await getStoredSourceRecord(params.userId, params.sourceId);

  if (!stored) {
    throw new NotFoundError(`Knowledge source "${params.sourceId}" not found`);
  }

  if (stored.original_path) {
    return {
      body: new Uint8Array(await readFile(stored.original_path)),
      filename: buildDownloadFilename({
        sourceFilename: source.sourceFilename,
        title: source.title,
        sourceType: source.sourceType,
      }),
      mimeType: source.mimeType || "application/octet-stream",
    };
  }

  return {
    body: new TextEncoder().encode(source.content),
    filename: buildDownloadFilename({
      sourceFilename: source.sourceFilename,
      title: source.title,
      sourceType: source.sourceType,
    }),
    mimeType: source.mimeType || "text/plain; charset=utf-8",
  };
}

export async function getKnowledgeDocumentDownload(params: {
  userId: string;
  documentId: string;
  spaceId: string;
}): Promise<{
  body: Uint8Array;
  filename: string;
  mimeType: string;
}> {
  const source = await getDocumentById(params.userId, params.documentId);

  if (!source || source.collectionId !== params.spaceId) {
    throw new NotFoundError(
      `Knowledge document "${params.documentId}" not found`,
    );
  }

  return getKnowledgeSourceDownload({
    userId: params.userId,
    sourceId: source.id,
  });
}
