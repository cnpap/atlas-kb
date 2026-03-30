import {
  answerKnowledgeQuestion,
  createKnowledgeCollection,
  createKnowledgeSpace,
  deleteKnowledgeCollection,
  deleteKnowledgeSource,
  generateBriefingOpinion,
  getBriefingExportHistory,
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
  saveBriefingExport,
  searchKnowledge,
  updateKnowledgeCollection,
  updateKnowledgeSource,
  uploadKnowledgeDocument,
} from "@atlas-kb/mastra/knowledge";
import { BadRequestError } from "@atlas-kb/errors";
import {
  AskKnowledgeRequestSchema,
  AskKnowledgeResponseSchema,
  BriefingExportCreateRequestSchema,
  BriefingExportResponseSchema,
  BriefingExportsResponseSchema,
  BriefingOpinionResponseSchema,
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
import { requireAuthenticatedSession } from "../auth";

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
    async ({ headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        collections: await listKnowledgeCollections(session.user.id),
      });
    },
    {
      response: KnowledgeCollectionsResponseSchema,
    },
  )
  .post(
    "/collections",
    async ({ body, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        collection: await createKnowledgeCollection({
          userId: session.user.id,
          input: body,
        }),
      });
    },
    {
      body: KnowledgeCollectionCreateRequestSchema,
      response: KnowledgeCollectionResponseSchema,
    },
  )
  .get(
    "/collections/:collectionId",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await getKnowledgeCollectionData(session.user.id, params.collectionId),
      );
    },
    {
      params: KnowledgeCollectionIdParamsSchema,
      response: KnowledgeCollectionResponseSchema,
    },
  )
  .patch(
    "/collections/:collectionId",
    async ({ body, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        collection: await updateKnowledgeCollection({
          userId: session.user.id,
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
  .delete("/collections/:collectionId", async ({ params, headers }) => {
    const session = await requireAuthenticatedSession(headers.authorization);
    await deleteKnowledgeCollection(session.user.id, params.collectionId);
    return success({
      ok: true as const,
    });
  })
  .get(
    "/collections/:collectionId/sources",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await getKnowledgeCollectionSourcesData(
          session.user.id,
          params.collectionId,
        ),
      );
    },
    {
      params: KnowledgeCollectionIdParamsSchema,
      response: KnowledgeSourcesResponseSchema,
    },
  )
  .post(
    "/collections/:collectionId/imports/file",
    async ({ body, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await importKnowledgeFile({
          userId: session.user.id,
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
    async ({ params, request, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      const form = await request.formData();
      const files = form
        .getAll("files")
        .filter((entry): entry is File => entry instanceof File);

      if (files.length === 0) {
        throw new BadRequestError("请至少选择一个文件");
      }

      return success(
        await importKnowledgeFiles({
          userId: session.user.id,
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
    async ({ body, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await importKnowledgeText({
          userId: session.user.id,
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
    async ({ headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        jobs: await listImportJobs(session.user.id),
      });
    },
    {
      response: KnowledgeImportJobsResponseSchema,
    },
  )
  .get(
    "/sources/:sourceId",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await getKnowledgeSourceData(session.user.id, params.sourceId),
      );
    },
    {
      params: KnowledgeSourceIdParamsSchema,
      response: KnowledgeSourceResponseSchema,
    },
  )
  .patch(
    "/sources/:sourceId",
    async ({ body, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        source: await updateKnowledgeSource(
          session.user.id,
          params.sourceId,
          body,
        ),
      });
    },
    {
      body: KnowledgeSourceUpdateRequestSchema,
      params: KnowledgeSourceIdParamsSchema,
      response: KnowledgeSourceResponseSchema,
    },
  )
  .delete("/sources/:sourceId", async ({ params, headers }) => {
    const session = await requireAuthenticatedSession(headers.authorization);
    await deleteKnowledgeSource(session.user.id, params.sourceId);
    return success({
      ok: true as const,
    });
  })
  .post(
    "/sources/:sourceId/refresh",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await refreshKnowledgeSource(session.user.id, params.sourceId),
      );
    },
    {
      params: KnowledgeSourceIdParamsSchema,
      response: KnowledgeImportResponseSchema,
    },
  )
  .post(
    "/sources/:sourceId/reprocess",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await retryKnowledgeSource(session.user.id, params.sourceId),
      );
    },
    {
      params: KnowledgeSourceIdParamsSchema,
      response: KnowledgeImportResponseSchema,
    },
  )
  .get(
    "/sources/:sourceId/download",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return toDownloadResponse(
        await getKnowledgeSourceDownload({
          userId: session.user.id,
          sourceId: params.sourceId,
        }),
      );
    },
    {
      params: KnowledgeSourceIdParamsSchema,
    },
  )
  .get(
    "/sources/:sourceId/briefing",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await generateBriefingOpinion({
          userId: session.user.id,
          sourceId: params.sourceId,
        }),
      );
    },
    {
      params: KnowledgeSourceIdParamsSchema,
      response: BriefingOpinionResponseSchema,
    },
  )
  .get(
    "/sources/:sourceId/exports",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await getBriefingExportHistory({
          userId: session.user.id,
          sourceId: params.sourceId,
        }),
      );
    },
    {
      params: KnowledgeSourceIdParamsSchema,
      response: BriefingExportsResponseSchema,
    },
  )
  .post(
    "/sources/:sourceId/exports",
    async ({ body, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await saveBriefingExport({
          userId: session.user.id,
          sourceId: params.sourceId,
          input: body,
        }),
      );
    },
    {
      body: BriefingExportCreateRequestSchema,
      params: KnowledgeSourceIdParamsSchema,
      response: BriefingExportResponseSchema,
    },
  )
  .post(
    "/search",
    async ({ body, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(await searchKnowledge(body, { userId: session.user.id }));
    },
    {
      body: SearchKnowledgeRequestSchema,
      response: SearchKnowledgeResponseSchema,
    },
  )
  .get(
    "/spaces",
    async ({ headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        spaces: await listKnowledgeSpaces(session.user.id),
      });
    },
    {
      response: KnowledgeSpacesResponseSchema,
    },
  )
  .post(
    "/spaces",
    async ({ body, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        space: await createKnowledgeSpace({
          userId: session.user.id,
          input: body,
        }),
      });
    },
    {
      body: KnowledgeSpaceCreateRequestSchema,
      response: KnowledgeSpaceMutationResponseSchema,
    },
  )
  .get(
    "/spaces/:spaceId/documents",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await getKnowledgeSpaceDocuments(session.user.id, params.spaceId),
      );
    },
    {
      params: KnowledgeSpaceIdParamsSchema,
      response: KnowledgeDocumentsResponseSchema,
    },
  )
  .post(
    "/spaces/:spaceId/documents/upload",
    async ({ body, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await uploadKnowledgeDocument({
          userId: session.user.id,
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
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return toDownloadResponse(
        await getKnowledgeDocumentDownload({
          userId: session.user.id,
          ...params,
        }),
      );
    },
    {
      params: KnowledgeDocumentDownloadParamsSchema,
    },
  )
  .post(
    "/ask",
    async ({ body, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await answerKnowledgeQuestion(body, {
          userId: session.user.id,
          fetchImpl: fetch,
        }),
      );
    },
    {
      body: AskKnowledgeRequestSchema,
      response: AskKnowledgeResponseSchema,
    },
  );
