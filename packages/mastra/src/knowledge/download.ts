import { NotFoundError } from "@atlas-kb/errors";
import { basename } from "node:path";
import { getPresignedGetUrl } from "./object-storage";
import { requireKnowledgeSource } from "./repository";

function buildDownloadFilename(sourceFilename: string) {
  return basename(sourceFilename);
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
  const relativePath = source.documentId;

  if (!relativePath) {
    throw new NotFoundError(
      `Knowledge source "${params.sourceId}" has no stored file`,
    );
  }
  if (!source.sourceFilename) {
    throw new NotFoundError(
      `Knowledge source "${params.sourceId}" has no download filename`,
    );
  }

  const url = await getPresignedGetUrl({
    userId: params.userId,
    collectionId: source.collectionId,
    relativePath,
  });

  return {
    url,
    filename: buildDownloadFilename(source.sourceFilename),
    mimeType: source.mimeType || "application/octet-stream",
  };
}
