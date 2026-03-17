import {
  answerKnowledgeQuestion,
  createKnowledgeSpace,
  getKnowledgeSpaceDocuments,
  listKnowledgeSpaces,
  searchKnowledge,
  uploadKnowledgeDocument,
} from "@atlas-kb/mastra/knowledge";
import {
  AskKnowledgeRequestSchema,
  AskKnowledgeResponseSchema,
  AuthorizationHeadersSchema,
  KnowledgeDocumentsResponseSchema,
  KnowledgeSpaceCreateRequestSchema,
  KnowledgeSpaceMutationResponseSchema,
  KnowledgeSpaceIdParamsSchema,
  KnowledgeSpacesResponseSchema,
  KnowledgeUploadMetadataSchema,
  KnowledgeUploadResponseSchema,
  SearchKnowledgeRequestSchema,
  SearchKnowledgeResponseSchema,
  success,
} from "@atlas-kb/schema";
import { Elysia, t } from "elysia";
import { requireAuthenticatedSession } from "../auth";

function parseTags(input?: string): string[] | undefined {
  const value = input?.trim();

  if (!value) {
    return undefined;
  }

  const tags = value
    .split(/[,\n]/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  return tags.length > 0 ? [...new Set(tags)] : undefined;
}

export const knowledgeRoutes = new Elysia({ prefix: "/api/kb" })
  .get(
    "/spaces",
    async ({ headers }) => {
      await requireAuthenticatedSession(headers.authorization);

      return success({
        spaces: await listKnowledgeSpaces(),
      });
    },
    {
      headers: AuthorizationHeadersSchema,
      response: KnowledgeSpacesResponseSchema,
    },
  )
  .post(
    "/spaces",
    async ({ body, headers }) => {
      await requireAuthenticatedSession(headers.authorization);

      return success({
        space: await createKnowledgeSpace(body),
      });
    },
    {
      body: KnowledgeSpaceCreateRequestSchema,
      headers: AuthorizationHeadersSchema,
      response: KnowledgeSpaceMutationResponseSchema,
    },
  )
  .get(
    "/spaces/:spaceId/documents",
    async ({ headers, params }) => {
      await requireAuthenticatedSession(headers.authorization);

      return success(await getKnowledgeSpaceDocuments(params.spaceId));
    },
    {
      headers: AuthorizationHeadersSchema,
      params: KnowledgeSpaceIdParamsSchema,
      response: KnowledgeDocumentsResponseSchema,
    },
  )
  .post(
    "/spaces/:spaceId/documents/upload",
    async ({ body, headers, params }) => {
      await requireAuthenticatedSession(headers.authorization);
      const metadata = KnowledgeUploadMetadataSchema.parse({
        summary: body.summary?.trim() || undefined,
        tags: parseTags(body.tags),
        title: body.title?.trim() || undefined,
      });
      const uploadResult = await uploadKnowledgeDocument({
        file: body.file,
        metadata,
        spaceId: params.spaceId,
      });

      return success({
        space: uploadResult.space,
        document: uploadResult.document,
        indexed: uploadResult.indexed,
        engine: uploadResult.engine,
      });
    },
    {
      body: t.Object({
        file: t.File({
          maxSize: "20m",
        }),
        summary: t.Optional(t.String()),
        tags: t.Optional(t.String()),
        title: t.Optional(t.String()),
      }),
      headers: AuthorizationHeadersSchema,
      params: KnowledgeSpaceIdParamsSchema,
      response: KnowledgeUploadResponseSchema,
    },
  )
  .post(
    "/search",
    async ({ body, headers }) => {
      await requireAuthenticatedSession(headers.authorization);

      return success(await searchKnowledge(body));
    },
    {
      body: SearchKnowledgeRequestSchema,
      headers: AuthorizationHeadersSchema,
      response: SearchKnowledgeResponseSchema,
    },
  )
  .post(
    "/ask",
    async ({ body, headers }) => {
      await requireAuthenticatedSession(headers.authorization);

      return success(
        await answerKnowledgeQuestion(body, {
          apiKey: process.env.OPENAI_API_KEY,
          baseUrl: process.env.OPENAI_BASE_URL,
          model: process.env.OPENAI_MODEL,
          fetchImpl: fetch,
        }),
      );
    },
    {
      body: AskKnowledgeRequestSchema,
      headers: AuthorizationHeadersSchema,
      response: AskKnowledgeResponseSchema,
    },
  );
