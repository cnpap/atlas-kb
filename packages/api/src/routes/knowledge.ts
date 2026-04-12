import {
  answerKnowledgeQuestion,
  createAssistantRole,
  createKnowledgeCollection,
  createKnowledgeExportTaskInAdmin,
  deleteAssistantRole,
  deleteKnowledgeCollection,
  deleteKnowledgeSource,
  downloadKnowledgeExportTaskFromAdmin,
  generateKnowledgeTemplateExportPayload,
  getActiveAssistantRole,
  getKnowledgeCollectionSourcesData,
  getKnowledgeExportTaskDetailFromAdmin,
  getKnowledgeSourceDownloadUrl,
  getKnowledgeTemplateDetailFromAdmin,
  importKnowledgeFile,
  importKnowledgeText,
  listAssistantRoles,
  listKnowledgeExportTasksFromAdmin,
  listKnowledgeCollections,
  listKnowledgeTemplatesFromAdmin,
  reorderAssistantRoles,
  requireKnowledgeCollection,
  requireKnowledgeSource,
  retryKnowledgeSourceImport,
  searchKnowledge,
  setActiveAssistantRole,
  updateAssistantRole,
  updateKnowledgeExportTaskInAdmin,
  updateKnowledgeCollection,
  updateKnowledgeSource,
  getInternalSecret,
} from "@atlas-kb/mastra/knowledge";
import { BadRequestError, UnauthorizedError } from "@atlas-kb/errors";
import {
  AskKnowledgeRequestSchema,
  AskKnowledgeResponseSchema,
  AssistantRoleCreateRequestSchema,
  AssistantRoleDeleteResponseSchema,
  AssistantRoleIdParamsSchema,
  AssistantRoleOrderRequestSchema,
  AssistantRoleOrderResponseSchema,
  AssistantRoleResponseSchema,
  AssistantRolesResponseSchema,
  AssistantRoleSelectionRequestSchema,
  AssistantRoleSelectionResponseSchema,
  AssistantRoleUpdateRequestSchema,
  KnowledgeCollectionCreateRequestSchema,
  KnowledgeCollectionIdParamsSchema,
  KnowledgeCollectionResponseSchema,
  KnowledgeCollectionsResponseSchema,
  KnowledgeCollectionUpdateRequestSchema,
  KnowledgeExportTaskCreateRequestSchema,
  KnowledgeExportTaskDetailResponseSchema,
  KnowledgeExportTaskGenerateRequestSchema,
  KnowledgeExportTaskGenerateResponseSchema,
  KnowledgeExportTaskIdParamsSchema,
  KnowledgeExportTaskResponseSchema,
  KnowledgeExportTaskUpdateRequestSchema,
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
  type Session,
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
  formData: { get(name: string): unknown },
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

function requireActiveCollection(
  session: Session,
  collectionId: string,
): string {
  const normalizedCollectionId = collectionId.trim();

  if (session.activeCollectionId !== normalizedCollectionId) {
    throw new BadRequestError("当前登录态未绑定该工作区，请先切换工作区。");
  }

  return normalizedCollectionId;
}

async function requireActiveSource(session: Session, sourceId: string) {
  const source = await requireKnowledgeSource(session.user.id, sourceId);
  requireActiveCollection(session, source.collectionId);
  return source;
}

export const knowledgeRoutes = new Elysia({ prefix: "/api/kb" })
  .get(
    "/assistant-roles",
    async ({ headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      const [roles, activeRole] = await Promise.all([
        listAssistantRoles(session.user.id),
        getActiveAssistantRole(session.user.id),
      ]);

      return success({
        roles,
        activeRoleId: activeRole.id,
      });
    },
    {
      response: AssistantRolesResponseSchema,
    },
  )
  .post(
    "/assistant-roles",
    async ({ body, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        role: await createAssistantRole({
          userId: session.user.id,
          input: body,
        }),
      });
    },
    {
      body: AssistantRoleCreateRequestSchema,
      response: AssistantRoleResponseSchema,
    },
  )
  .patch(
    "/assistant-roles/active",
    async ({ body, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      const role = await setActiveAssistantRole({
        userId: session.user.id,
        roleId: body.roleId,
      });

      return success({
        activeRoleId: role.id,
      });
    },
    {
      body: AssistantRoleSelectionRequestSchema,
      response: AssistantRoleSelectionResponseSchema,
    },
  )
  .patch(
    "/assistant-roles/order",
    async ({ body, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      await reorderAssistantRoles({
        userId: session.user.id,
        roleIds: body.roleIds,
      });

      return success({
        ok: true as const,
      });
    },
    {
      body: AssistantRoleOrderRequestSchema,
      response: AssistantRoleOrderResponseSchema,
    },
  )
  .patch(
    "/assistant-roles/:roleId",
    async ({ body, headers, params }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        role: await updateAssistantRole({
          userId: session.user.id,
          roleId: params.roleId,
          input: body,
        }),
      });
    },
    {
      body: AssistantRoleUpdateRequestSchema,
      params: AssistantRoleIdParamsSchema,
      response: AssistantRoleResponseSchema,
    },
  )
  .delete(
    "/assistant-roles/:roleId",
    async ({ headers, params }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      await deleteAssistantRole({
        userId: session.user.id,
        roleId: params.roleId,
      });

      return success({
        ok: true as const,
      });
    },
    {
      params: AssistantRoleIdParamsSchema,
      response: AssistantRoleDeleteResponseSchema,
    },
  )
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
      requireActiveCollection(session, params.collectionId);
      return success({
        collection: await requireKnowledgeCollection(
          session.user.id,
          params.collectionId,
        ),
      });
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
      requireActiveCollection(session, params.collectionId);
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
    requireActiveCollection(session, params.collectionId);
    await deleteKnowledgeCollection(session.user.id, params.collectionId);
    return success({
      ok: true as const,
    });
  })
  .get(
    "/collections/:collectionId/sources",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      requireActiveCollection(session, params.collectionId);
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
      requireActiveCollection(session, params.collectionId);
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
      const collectionId = requireActiveCollection(
        session,
        params.collectionId,
      );
      await requireKnowledgeCollection(userId, collectionId);
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        throw new BadRequestError("请上传文件");
      }

      const title = readOptionalFormValue(formData, "title");
      const summary = readOptionalFormValue(formData, "summary");
      const tags = parseTagInput(readOptionalFormValue(formData, "tags"));
      return success(
        await importKnowledgeFile({
          userId,
          collectionId,
          file,
          input: {
            title,
            summary,
            tags,
          },
        }),
      );
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
  .get(
    "/export-tasks/:taskId",
    async ({ headers, params }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        task: await getKnowledgeExportTaskDetailFromAdmin({
          userId: session.user.id,
          taskId: params.taskId,
        }),
      });
    },
    {
      params: KnowledgeExportTaskIdParamsSchema,
      response: KnowledgeExportTaskDetailResponseSchema,
    },
  )
  .get(
    "/export-tasks/:taskId/download",
    async ({ headers, params }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      const file = await downloadKnowledgeExportTaskFromAdmin({
        userId: session.user.id,
        taskId: params.taskId,
      });

      return new Response(file.data, {
        headers: {
          "Content-Disposition":
            file.contentDisposition ??
            `attachment; filename="${params.taskId}.bin"`,
          "Content-Type": file.contentType,
        },
      });
    },
    {
      params: KnowledgeExportTaskIdParamsSchema,
    },
  )
  .patch(
    "/export-tasks/:taskId",
    async ({ body, headers, params }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success({
        task: await updateKnowledgeExportTaskInAdmin({
          userId: session.user.id,
          taskId: params.taskId,
          input: body,
        }),
      });
    },
    {
      body: KnowledgeExportTaskUpdateRequestSchema,
      params: KnowledgeExportTaskIdParamsSchema,
      response: KnowledgeExportTaskDetailResponseSchema,
    },
  )
  .post(
    "/sources/:sourceId/export-tasks",
    async ({ body, headers, params }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      await requireActiveSource(session, params.sourceId);
      return success({
        task: await createKnowledgeExportTaskInAdmin({
          userId: session.user.id,
          sourceId: params.sourceId,
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
      const source = await requireActiveSource(session, params.sourceId);
      return success({
        source,
      });
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
      await requireActiveSource(session, params.sourceId);
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
  .post(
    "/sources/:sourceId/retry",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      await requireActiveSource(session, params.sourceId);
      return success({
        source: await retryKnowledgeSourceImport(
          session.user.id,
          params.sourceId,
        ),
      });
    },
    {
      params: KnowledgeSourceIdParamsSchema,
      response: KnowledgeSourceResponseSchema,
    },
  )
  .delete("/sources/:sourceId", async ({ params, headers }) => {
    const session = await requireAuthenticatedSession(headers.authorization);
    await requireActiveSource(session, params.sourceId);
    await deleteKnowledgeSource(session.user.id, params.sourceId);
    return success({
      ok: true as const,
    });
  })
  .get(
    "/sources/:sourceId/download",
    async ({ params, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      await requireActiveSource(session, params.sourceId);
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
  .post(
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
      requireActiveCollection(session, body.collectionId);
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
      requireActiveCollection(session, body.collectionId);
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
