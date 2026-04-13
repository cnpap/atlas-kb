import { z } from "zod/v4";
import { createApiSuccessResponseSchema } from "./api";
import {
  KnowledgeRecallPathSchema,
  KnowledgeRetrievalEngineSchema,
  KnowledgeSourceTypeSchema,
} from "./knowledge-library";

export const SearchKnowledgeRequestSchema = z.object({
  query: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(20).optional(),
  sourceTypes: z.array(KnowledgeSourceTypeSchema).max(4).optional(),
  includeArchived: z.boolean().optional(),
});

export const SearchKnowledgeHitSchema = z.object({
  sourceId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  chunkId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  snippet: z.string().trim().min(1),
  sectionPath: z.string().trim().min(1).optional(),
  sourceFilename: z.string().trim().min(1).optional(),
  downloadUrl: z.string().trim().min(1).optional(),
  sourceType: KnowledgeSourceTypeSchema,
  score: z.number(),
  strategy: z.enum(["lexical", "vector", "fusion", "rerank"]),
  usedInAnswer: z.boolean(),
  recallPaths: z.array(KnowledgeRecallPathSchema).min(1),
});

export const SearchKnowledgeResultSchema = z.object({
  query: z.string().trim().min(1),
  rewrittenQueries: z.array(z.string().trim().min(1)),
  queryVariants: z.array(z.string().trim().min(1)),
  engine: KnowledgeRetrievalEngineSchema,
  total: z.number().int().nonnegative(),
  usedHitIds: z.array(z.string().trim().min(1)),
  hits: z.array(SearchKnowledgeHitSchema),
});

export const SearchKnowledgeResponseSchema = createApiSuccessResponseSchema(
  SearchKnowledgeResultSchema,
);

export const AskKnowledgeModeSchema = z.enum(["model", "mock"]);

export const AskKnowledgeRequestSchema = z.object({
  question: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(8).optional(),
});

export const AskKnowledgeResultSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  mode: AskKnowledgeModeSchema,
});

export const AskKnowledgeResponseSchema = createApiSuccessResponseSchema(
  AskKnowledgeResultSchema,
);

export type SearchKnowledgeRequest = z.infer<
  typeof SearchKnowledgeRequestSchema
>;
export type SearchKnowledgeHit = z.infer<typeof SearchKnowledgeHitSchema>;
export type SearchKnowledgeResult = z.infer<typeof SearchKnowledgeResultSchema>;
export type AskKnowledgeMode = z.infer<typeof AskKnowledgeModeSchema>;
export type AskKnowledgeRequest = z.infer<typeof AskKnowledgeRequestSchema>;
export type AskKnowledgeResult = z.infer<typeof AskKnowledgeResultSchema>;
