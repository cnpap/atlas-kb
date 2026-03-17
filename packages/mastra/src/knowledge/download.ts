import { BadRequestError, NotFoundError } from "@atlas-kb/errors";
import {
  KnowledgeDocumentDownloadParamsSchema,
  type KnowledgeDocumentDownloadParams,
} from "@atlas-kb/schema";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { getDocumentById } from "./repository";

function resolveDownloadFilename(params: {
  documentId: string;
  sourceFilename?: string;
}): string {
  const filename = params.sourceFilename?.trim();
  return filename ? basename(filename) : `${params.documentId}.txt`;
}

export async function getKnowledgeDocumentDownload(
  params: KnowledgeDocumentDownloadParams,
): Promise<{
  body: Uint8Array;
  filename: string;
  mimeType: string;
}> {
  const parsedParams = KnowledgeDocumentDownloadParamsSchema.parse(params);
  const document = await getDocumentById(parsedParams.documentId);

  if (!document || document.spaceId !== parsedParams.spaceId) {
    throw new NotFoundError(
      `Knowledge document "${parsedParams.documentId}" not found`,
    );
  }

  if (document.source !== "upload") {
    throw new BadRequestError(
      "Seeded documents do not have downloadable source files",
    );
  }

  if (!document.storagePath) {
    throw new NotFoundError(
      `Knowledge document "${parsedParams.documentId}" does not have a stored file`,
    );
  }

  try {
    return {
      body: new Uint8Array(await readFile(document.storagePath)),
      filename: resolveDownloadFilename({
        documentId: document.id,
        sourceFilename: document.sourceFilename,
      }),
      mimeType: document.mimeType || "application/octet-stream",
    };
  } catch (error) {
    throw new NotFoundError(
      `Knowledge document "${parsedParams.documentId}" file could not be read`,
      error,
    );
  }
}
