import { NotFoundError } from "@atlas-kb/errors";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { getLatestSourceVersion, getDocumentById } from "./repository";

function buildDownloadFilename(params: {
  sourceId: string;
  sourceFilename?: string;
  title: string;
  sourceType: string;
}): string {
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
  const source = await getDocumentById(params.userId, params.sourceId);

  if (!source) {
    throw new NotFoundError(`Knowledge source "${params.sourceId}" not found`);
  }

  const version = await getLatestSourceVersion(params.userId, params.sourceId);

  if (version?.filePath) {
    return {
      body: new Uint8Array(await readFile(version.filePath)),
      filename: buildDownloadFilename({
        sourceId: source.id,
        sourceFilename: source.sourceFilename,
        title: source.title,
        sourceType: source.sourceType,
      }),
      mimeType:
        version.mimeType || source.mimeType || "application/octet-stream",
    };
  }

  if (version?.snapshotHtml) {
    return {
      body: new TextEncoder().encode(version.snapshotHtml),
      filename: buildDownloadFilename({
        sourceId: source.id,
        sourceFilename: source.sourceFilename,
        title: source.title,
        sourceType: source.sourceType,
      }),
      mimeType: version.mimeType || "text/html",
    };
  }

  return {
    body: new TextEncoder().encode(source.content),
    filename: buildDownloadFilename({
      sourceId: source.id,
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
    sourceId: params.documentId,
  });
}
