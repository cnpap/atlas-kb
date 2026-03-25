import {
  answerKnowledgeQuestion,
  createKnowledgeCollection,
  createKnowledgeSpace,
  deleteKnowledgeCollection,
  deleteKnowledgeSource,
  getKnowledgeCollectionData,
  getKnowledgeCollectionSourcesData,
  getKnowledgeDocumentDownload,
  getKnowledgeSourceData,
  getKnowledgeSourceDownload,
  getKnowledgeSpaceDocuments,
  importKnowledgeFile,
  importKnowledgeFiles,
  importKnowledgeText,
  listImportJobs,
  listKnowledgeCollections,
  listKnowledgeSpaces,
  refreshKnowledgeSource,
  retryKnowledgeSource,
  searchKnowledge,
  updateKnowledgeCollection,
  updateKnowledgeSource,
  uploadKnowledgeDocument,
} from "@atlas-kb/mastra/knowledge";
import { BadRequestError } from "@atlas-kb/errors";
import {
  AskKnowledgeRequestSchema,
  AskKnowledgeResponseSchema,
  KnowledgeBatchFileImportRequestSchema,
  KnowledgeBatchImportResponseSchema,
  KnowledgeCollectionCreateRequestSchema,
  KnowledgeCollectionIdParamsSchema,
  KnowledgeCollectionResponseSchema,
  KnowledgeCollectionsResponseSchema,
  KnowledgeCollectionUpdateRequestSchema,
  KnowledgeDocumentDownloadParamsSchema,
  KnowledgeDocumentsResponseSchema,
  KnowledgeFileImportRequestSchema,
  KnowledgeImportJobsResponseSchema,
  KnowledgeImportResponseSchema,
  KnowledgeSourceIdParamsSchema,
  KnowledgeSourceResponseSchema,
  KnowledgeSourceUpdateRequestSchema,
  KnowledgeSourcesResponseSchema,
  KnowledgeSpaceCreateRequestSchema,
  KnowledgeSpaceIdParamsSchema,
  KnowledgeSpaceMutationResponseSchema,
  KnowledgeSpacesResponseSchema,
  KnowledgeTextImportRequestSchema,
  KnowledgeUploadMetadataSchema,
  KnowledgeUploadResponseSchema,
  SearchKnowledgeRequestSchema,
  SearchKnowledgeResponseSchema,
  success,
} from "@atlas-kb/schema";
import { Elysia, t } from "elysia";
import { basename, extname } from "node:path";

function parseTagString(input?: string): string[] | undefined {
  const value = input?.trim();

  if (!value) {
    return undefined;
  }

  const tags = value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return tags.length > 0 ? [...new Set(tags)] : undefined;
}

function readOptionalString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
}

function getHeaderSafeFilename(filename: string): string {
  const trimmed = basename(filename || "download").trim();
  const extension = extname(trimmed);
  const safeExtension = extension.replace(/[^a-zA-Z0-9.]+/g, "");
  const stem =
    trimmed.slice(0, trimmed.length - extension.length) || "download";
  const visibleStem = Array.from(stem)
    .filter((character) => {
      const codePoint = character.charCodeAt(0);
      return codePoint >= 32 && !(codePoint >= 127 && codePoint <= 159);
    })
    .join("");
  const asciiStem = visibleStem
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${asciiStem || "download"}${safeExtension}`;
}

function toDownloadResponse(download: {
  body: Uint8Array;
  filename: string;
  mimeType: string;
}): Response {
  const encodedFilename = encodeURIComponent(download.filename);
  const fallbackFilename = getHeaderSafeFilename(download.filename);

  return new Response(new Blob([download.body], { type: download.mimeType }), {
    headers: {
      "Content-Disposition": `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`,
      "Content-Length": String(download.body.byteLength),
      "Content-Type": download.mimeType,
    },
  });
}

const uploadBody = t.Object({
  file: t.File({
    maxSize: "30m",
  }),
  summary: t.Optional(t.String()),
  tags: t.Optional(t.String()),
  title: t.Optional(t.String()),
});

export const knowledgeRoutes = new Elysia({ prefix: "/api/kb" })
  .get(
    "/collections",
    async () => {
      return success({
        collections: await listKnowledgeCollections(),
      });
    },
    {
      response: KnowledgeCollectionsResponseSchema,
    },
  )
  .post(
    "/collections",
    async ({ body }) => {
      return success({
        collection: await createKnowledgeCollection(body),
      });
    },
    {
      body: KnowledgeCollectionCreateRequestSchema,
      response: KnowledgeCollectionResponseSchema,
    },
  )
  .get(
    "/collections/:collectionId",
    async ({ params }) => {
      return success(await getKnowledgeCollectionData(params.collectionId));
    },
    {
      params: KnowledgeCollectionIdParamsSchema,
      response: KnowledgeCollectionResponseSchema,
    },
  )
  .patch(
    "/collections/:collectionId",
    async ({ body, params }) => {
      return success({
        collection: await updateKnowledgeCollection({
          collectionId: params.collectionId,
          input: body,
        }),
      });
    },
    {
      body: KnowledgeCollectionUpdateRequestSchema,
      params: KnowledgeCollectionIdParamsSchema,
      response: KnowledgeCollectionResponseSchema,
    },
  )
  .delete("/collections/:collectionId", async ({ params }) => {
    await deleteKnowledgeCollection(params.collectionId);
    return success({
      ok: true as const,
    });
  })
  .get(
    "/collections/:collectionId/sources",
    async ({ params }) => {
      return success(
        await getKnowledgeCollectionSourcesData(params.collectionId),
      );
    },
    {
      params: KnowledgeCollectionIdParamsSchema,
      response: KnowledgeSourcesResponseSchema,
    },
  )
  .post(
    "/collections/:collectionId/imports/file",
    async ({ body, params }) => {
      return success(
        await importKnowledgeFile({
          collectionId: params.collectionId,
          file: body.file,
          input: KnowledgeFileImportRequestSchema.parse({
            title: body.title?.trim() || undefined,
            summary: body.summary?.trim() || undefined,
            tags: parseTagString(body.tags),
          }),
        }),
      );
    },
    {
      body: uploadBody,
      params: KnowledgeCollectionIdParamsSchema,
      response: KnowledgeImportResponseSchema,
    },
  )
  .post(
    "/collections/:collectionId/imports/files",
    async ({ params, request }) => {
      const form = await request.formData();
      const files = form
        .getAll("files")
        .filter((entry): entry is File => entry instanceof File);

      if (files.length === 0) {
        throw new BadRequestError("请至少选择一个文件");
      }

      return success(
        await importKnowledgeFiles({
          collectionId: params.collectionId,
          files,
          input: KnowledgeBatchFileImportRequestSchema.parse({
            summary: readOptionalString(form, "summary")?.trim() || undefined,
            tags: parseTagString(readOptionalString(form, "tags")),
          }),
        }),
      );
    },
    {
      params: KnowledgeCollectionIdParamsSchema,
      response: KnowledgeBatchImportResponseSchema,
    },
  )
  .post(
    "/collections/:collectionId/imports/text",
    async ({ body, params }) => {
      return success(
        await importKnowledgeText({
          collectionId: params.collectionId,
          input: body,
        }),
      );
    },
    {
      body: KnowledgeTextImportRequestSchema,
      params: KnowledgeCollectionIdParamsSchema,
      response: KnowledgeImportResponseSchema,
    },
  )
  .get(
    "/imports",
    async () => {
      return success({
        jobs: await listImportJobs(),
      });
    },
    {
      response: KnowledgeImportJobsResponseSchema,
    },
  )
  .get(
    "/sources/:sourceId",
    async ({ params }) => {
      return success(await getKnowledgeSourceData(params.sourceId));
    },
    {
      params: KnowledgeSourceIdParamsSchema,
      response: KnowledgeSourceResponseSchema,
    },
  )
  .patch(
    "/sources/:sourceId",
    async ({ body, params }) => {
      return success({
        source: await updateKnowledgeSource(params.sourceId, body),
      });
    },
    {
      body: KnowledgeSourceUpdateRequestSchema,
      params: KnowledgeSourceIdParamsSchema,
      response: KnowledgeSourceResponseSchema,
    },
  )
  .delete("/sources/:sourceId", async ({ params }) => {
    await deleteKnowledgeSource(params.sourceId);
    return success({
      ok: true as const,
    });
  })
  .post(
    "/sources/:sourceId/refresh",
    async ({ params }) => {
      return success(await refreshKnowledgeSource(params.sourceId));
    },
    {
      params: KnowledgeSourceIdParamsSchema,
      response: KnowledgeImportResponseSchema,
    },
  )
  .post(
    "/sources/:sourceId/reprocess",
    async ({ params }) => {
      return success(await retryKnowledgeSource(params.sourceId));
    },
    {
      params: KnowledgeSourceIdParamsSchema,
      response: KnowledgeImportResponseSchema,
    },
  )
  .get(
    "/sources/:sourceId/download",
    async ({ params }) => {
      return toDownloadResponse(
        await getKnowledgeSourceDownload(params.sourceId),
      );
    },
    {
      params: KnowledgeSourceIdParamsSchema,
    },
  )
  .post(
    "/search",
    async ({ body }) => {
      return success(await searchKnowledge(body));
    },
    {
      body: SearchKnowledgeRequestSchema,
      response: SearchKnowledgeResponseSchema,
    },
  )
  .get(
    "/spaces",
    async () => {
      return success({
        spaces: await listKnowledgeSpaces(),
      });
    },
    {
      response: KnowledgeSpacesResponseSchema,
    },
  )
  .post(
    "/spaces",
    async ({ body }) => {
      return success({
        space: await createKnowledgeSpace(body),
      });
    },
    {
      body: KnowledgeSpaceCreateRequestSchema,
      response: KnowledgeSpaceMutationResponseSchema,
    },
  )
  .get(
    "/spaces/:spaceId/documents",
    async ({ params }) => {
      return success(await getKnowledgeSpaceDocuments(params.spaceId));
    },
    {
      params: KnowledgeSpaceIdParamsSchema,
      response: KnowledgeDocumentsResponseSchema,
    },
  )
  .post(
    "/spaces/:spaceId/documents/upload",
    async ({ body, params }) => {
      return success(
        await uploadKnowledgeDocument({
          file: body.file,
          metadata: KnowledgeUploadMetadataSchema.parse({
            title: body.title?.trim() || undefined,
            summary: body.summary?.trim() || undefined,
            tags: parseTagString(body.tags),
          }),
          spaceId: params.spaceId,
        }),
      );
    },
    {
      body: uploadBody,
      params: KnowledgeSpaceIdParamsSchema,
      response: KnowledgeUploadResponseSchema,
    },
  )
  .get(
    "/spaces/:spaceId/documents/:documentId/download",
    async ({ params }) => {
      return toDownloadResponse(await getKnowledgeDocumentDownload(params));
    },
    {
      params: KnowledgeDocumentDownloadParamsSchema,
    },
  )
  .post(
    "/ask",
    async ({ body }) => {
      return success(
        await answerKnowledgeQuestion(body, {
          fetchImpl: fetch,
        }),
      );
    },
    {
      body: AskKnowledgeRequestSchema,
      response: AskKnowledgeResponseSchema,
    },
  );
