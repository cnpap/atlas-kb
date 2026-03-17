import { NotFoundError } from "@atlas-kb/errors";
import {
  answerKnowledgeQuestion,
  getKnowledgeSpace,
  listKnowledgeDocuments,
  listKnowledgeSpaces,
  searchKnowledge,
} from "@atlas-kb/mastra/knowledge";
import {
  AskKnowledgeRequestSchema,
  AskKnowledgeResponseSchema,
  KnowledgeDocumentsResponseSchema,
  KnowledgeSpaceIdParamsSchema,
  KnowledgeSpacesResponseSchema,
  SearchKnowledgeRequestSchema,
  SearchKnowledgeResponseSchema,
  success,
} from "@atlas-kb/schema";
import { Elysia } from "elysia";

export const knowledgeRoutes = new Elysia({ prefix: "/api/kb" })
  .get(
    "/spaces",
    () => {
      return success({
        spaces: listKnowledgeSpaces(),
      });
    },
    {
      response: KnowledgeSpacesResponseSchema,
    },
  )
  .get(
    "/spaces/:spaceId/documents",
    ({ params }) => {
      const space = getKnowledgeSpace(params.spaceId);

      if (!space) {
        throw new NotFoundError(
          `Knowledge space "${params.spaceId}" not found`,
        );
      }

      return success({
        space,
        documents: listKnowledgeDocuments(params.spaceId),
      });
    },
    {
      params: KnowledgeSpaceIdParamsSchema,
      response: KnowledgeDocumentsResponseSchema,
    },
  )
  .post(
    "/search",
    ({ body }) => {
      return success(searchKnowledge(body));
    },
    {
      body: SearchKnowledgeRequestSchema,
      response: SearchKnowledgeResponseSchema,
    },
  )
  .post(
    "/ask",
    async ({ body }) => {
      return success(
        await answerKnowledgeQuestion(body, {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL,
          fetchImpl: fetch,
        }),
      );
    },
    {
      body: AskKnowledgeRequestSchema,
      response: AskKnowledgeResponseSchema,
    },
  );
