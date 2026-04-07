import {
  allocateManagedSourceFileName,
  answerKnowledgeQuestion,
  buildManagedSourceFileName,
  createKnowledgeCollection,
  createKnowledgeExportTaskInAdmin,
  createKnowledgeSourceRecord,
  deleteKnowledgeCollection,
  deleteKnowledgeSource,
  extractFileContent,
  generateBriefingOpinion,
  generateKnowledgeTemplateExportPayload,
  getKnowledgeCollectionData,
  getKnowledgeCollectionSourcesData,
  getManagedSourcePaths,
  getKnowledgeSourceData,
  getKnowledgeSourceDownloadUrl,
  getKnowledgeTemplateDetailFromAdmin,
  getKnowledgeWorkspace,
  importKnowledgeText,
  listKnowledgeExportTasksFromAdmin,
  listKnowledgeCollections,
  listKnowledgeSources,
  listKnowledgeTemplatesFromAdmin,
  putKnowledgeSourceObject,
  requireKnowledgeCollection,
  searchKnowledge,
  updateKnowledgeCollection,
  updateKnowledgeSource,
  getInternalSecret,
} from "@atlas-kb/mastra/knowledge";
import { BadRequestError, UnauthorizedError } from "@atlas-kb/errors";
import {
  AskKnowledgeRequestSchema,
  AskKnowledgeResponseSchema,
  BriefingOpinionResponseSchema,
  KnowledgeCollectionCreateRequestSchema,
  KnowledgeCollectionIdParamsSchema,
  KnowledgeCollectionResponseSchema,
  KnowledgeCollectionsResponseSchema,
  KnowledgeCollectionUpdateRequestSchema,
  KnowledgeExportTaskCreateRequestSchema,
  KnowledgeExportTaskGenerateRequestSchema,
  KnowledgeExportTaskGenerateResponseSchema,
  KnowledgeExportTaskResponseSchema,
  KnowledgeExportTasksQuerySchema,
  KnowledgeExportTasksResponseSchema,
  KnowledgeImportResponseSchema,
  KnowledgeSourceIdParamsSchema,
  KnowledgeSourceResponseSchema,
  KnowledgeSourceUpdateRequestSchema,
  KnowledgeSourcesResponseSchema,
  KnowledgeTemplateIdParamsSchema,
  KnowledgeTemplateResponseSchema,
  KnowledgeTemplatesResponseSchema,
  KnowledgeTextImportRequestSchema,
  SearchKnowledgeRequestSchema,
  SearchKnowledgeResponseSchema,
  success,
} from "@atlas-kb/schema";
import { Elysia } from "elysia";
import { requireAuthenticatedSession } from "../auth";

function parseTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

function requireInternalSecret(headers: Record<string, string | undefined>) {
  const configuredSecret = getInternalSecret();
  const providedSecret = headers["x-atlas-kb-internal-secret"]?.trim();

  if (
    !configuredSecret ||
    !providedSecret ||
    providedSecret !== configuredSecret
  ) {
    throw new UnauthorizedError("内部接口认证失败");
  }
}

function readOptionalFormValue(
  formData: FormData,
  key: string,
): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseTagInput(value?: string): string[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  return parseTags(
    value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

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
  .post(
    "/collections/:collectionId/uploads",
    async ({ request, params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      const userId = session.user.id;
      const collectionId = params.collectionId;
      await requireKnowledgeCollection(userId, collectionId);
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        throw new BadRequestError("请上传文件");
      }

      const title = readOptionalFormValue(formData, "title");
      const summary = readOptionalFormValue(formData, "summary");
      const tags = parseTagInput(readOptionalFormValue(formData, "tags"));

      const sources = await listKnowledgeSources(userId, collectionId);
      const usedNames = new Set(
        sources
          .map((s) => s.sourceFilename?.trim() || s.documentId?.trim())
          .filter((v): v is string => Boolean(v)),
      );
      const resolvedFileName = allocateManagedSourceFileName(
        buildManagedSourceFileName({
          sourceType: "file",
          title: file.name,
          sourceFilename: file.name,
          mimeType: file.type || undefined,
        }),
        usedNames,
      );
      const paths = getManagedSourcePaths({
        userId,
        collectionId,
        fileName: resolvedFileName,
      });
      const collection = await requireKnowledgeCollection(userId, collectionId);
      const objectBytes = new Uint8Array(await file.arrayBuffer());

      await putKnowledgeSourceObject({
        userId,
        collectionId,
        relativePath: paths.documentPath,
        body: objectBytes,
        contentType: file.type || undefined,
      });

      const extracted = await extractFileContent({
        bytes: objectBytes,
        fileName: resolvedFileName,
        mimeType: file.type || undefined,
      });

      const workspace = await getKnowledgeWorkspace({ userId, collectionId });
      const documentId = paths.documentPath;
      const normalizedTags = tags ?? [];
      const resolvedSummary = summary || extracted.excerpt;
      const resolvedTitle = title || extracted.title;

      await workspace.index(documentId, extracted.content, {
        mimeType: extracted.mimeType,
        metadata: {
          collectionId,
          sourceFilename: resolvedFileName,
          sourceType: "file",
          summary: resolvedSummary,
          tags: normalizedTags,
          title: resolvedTitle,
        },
      });

      const sourceId = crypto.randomUUID();
      const source = await createKnowledgeSourceRecord({
        sourceId,
        userId,
        collectionId,
        documentId,
        sourceType: "file",
        title: resolvedTitle,
        summary: resolvedSummary,
        content: extracted.content,
        tags: normalizedTags,
        sourceFilename: resolvedFileName,
        mimeType: extracted.mimeType,
        byteSize: file.size,
        status: "ready",
        originalPath: paths.documentPath,
        indexPath: documentId,
      });

      return success({
        collection,
        source,
        engine: "lexical" as const,
        indexed: true,
      });
    },
    {
      params: KnowledgeCollectionIdParamsSchema,
      response: KnowledgeImportResponseSchema,
    },
  )
  .get(
    "/templates",
    async ({ headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        templates: await listKnowledgeTemplatesFromAdmin(session.user.id),
      });
    },
    {
      response: KnowledgeTemplatesResponseSchema,
    },
  )
  .get(
    "/templates/:templateId",
    async ({ headers, params }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        template: await getKnowledgeTemplateDetailFromAdmin({
          userId: session.user.id,
          templateId: params.templateId,
        }),
      });
    },
    {
      params: KnowledgeTemplateIdParamsSchema,
      response: KnowledgeTemplateResponseSchema,
    },
  )
  .get(
    "/export-tasks",
    async ({ headers, query }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        tasks: await listKnowledgeExportTasksFromAdmin({
          userId: session.user.id,
          sourceId: query.sourceId,
        }),
      });
    },
    {
      query: KnowledgeExportTasksQuerySchema,
      response: KnowledgeExportTasksResponseSchema,
    },
  )
  .post(
    "/sources/:sourceId/export-tasks",
    async ({ body, headers, params }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        task: await createKnowledgeExportTaskInAdmin({
          userId: session.user.id,
          sourceId: params.sourceId,
          taskType: body.taskType,
          templateId: body.templateId,
        }),
      });
    },
    {
      body: KnowledgeExportTaskCreateRequestSchema,
      params: KnowledgeSourceIdParamsSchema,
      response: KnowledgeExportTaskResponseSchema,
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
  .get(
    "/sources/:sourceId/download",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      const download = await getKnowledgeSourceDownloadUrl({
        userId: session.user.id,
        sourceId: params.sourceId,
      });
      return success(download);
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
    "/internal/template-export-tasks/generate",
    async ({ body, headers }) => {
      requireInternalSecret(headers);
      return success({
        result: await generateKnowledgeTemplateExportPayload({
          userId: body.userId,
          sourceId: body.sourceId,
          template: body.template,
        }),
      });
    },
    {
      body: KnowledgeExportTaskGenerateRequestSchema,
      response: KnowledgeExportTaskGenerateResponseSchema,
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
  .post(
    "/ask",
    async ({ body, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await answerKnowledgeQuestion(body, {
          userId: session.user.id,
        }),
      );
    },
    {
      body: AskKnowledgeRequestSchema,
      response: AskKnowledgeResponseSchema,
    },
  );
