import { NotFoundError } from "@atlas-kb/errors";
import { basename } from "node:path";
import { getPresignedGetUrl } from "./object-storage";
import { getStoredSourceRecord, requireKnowledgeSource } from "./repository";

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

export async function getKnowledgeSourceDownloadUrl(params: {
  userId: string;
  sourceId: string;
}): Promise<{
  url: string;
  filename: string;
  mimeType: string;
}> {
  const source = await requireKnowledgeSource(params.userId, params.sourceId);
  const stored = await getStoredSourceRecord(params.userId, params.sourceId);

  if (!stored) {
    throw new NotFoundError(`Knowledge source "${params.sourceId}" not found`);
  }

  const relativePath = stored.originalPath || stored.documentId;

  if (!relativePath) {
    throw new NotFoundError(
      `Knowledge source "${params.sourceId}" has no stored file`,
    );
  }

  const url = await getPresignedGetUrl({
    userId: params.userId,
    collectionId: source.collectionId,
    relativePath,
  });

  return {
    url,
    filename: buildDownloadFilename({
      sourceFilename: source.sourceFilename,
      title: source.title,
      sourceType: source.sourceType,
    }),
    mimeType: source.mimeType || "application/octet-stream",
  };
}
