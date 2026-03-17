import { z } from "zod/v4";
import { createApiSuccessResponseSchema } from "./api";
import { TimestampSchema } from "./utils";

export const HealthDataSchema = z.object({
  status: z.literal("ok"),
  timestamp: TimestampSchema,
});

export const KnowledgeSpaceSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  documentCount: z.number().int().nonnegative(),
  updatedAt: TimestampSchema,
});

export const KnowledgeDocumentSchema = z.object({
  id: z.string().trim().min(1),
  spaceId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)),
  source: z.enum(["seed", "upload"]),
  sourceFilename: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).optional(),
  byteSize: z.number().int().positive().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const KnowledgeSpaceIdParamsSchema = z.object({
  spaceId: z.string().trim().min(1),
});

export const KnowledgeSpaceCreateRequestSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(280),
});

export const KnowledgeUploadMetadataSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().min(1).max(400).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
});

export const KnowledgeRetrievalEngineSchema = z.enum(["lexical", "vector"]);

export const SearchKnowledgeRequestSchema = z.object({
  query: z.string().trim().min(1),
  spaceId: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export const SearchKnowledgeHitSchema = z.object({
  documentId: z.string().trim().min(1),
  spaceId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  snippet: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)),
  score: z.number().nonnegative(),
});

export const SearchKnowledgeResultSchema = z.object({
  query: z.string().trim().min(1),
  engine: KnowledgeRetrievalEngineSchema,
  total: z.number().int().nonnegative(),
  hits: z.array(SearchKnowledgeHitSchema),
});

export const AskKnowledgeModeSchema = z.enum(["model", "mock"]);

export const AskKnowledgeRequestSchema = z.object({
  question: z.string().trim().min(1),
  spaceId: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(5).optional(),
});

export const AskKnowledgeCitationSchema = z.object({
  documentId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  snippet: z.string().trim().min(1),
});

export const AskKnowledgeResultSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  mode: AskKnowledgeModeSchema,
  engine: KnowledgeRetrievalEngineSchema,
  citations: z.array(AskKnowledgeCitationSchema),
});

export const KnowledgeSpacesDataSchema = z.object({
  spaces: z.array(KnowledgeSpaceSchema),
});

export const KnowledgeDocumentsDataSchema = z.object({
  space: KnowledgeSpaceSchema,
  documents: z.array(KnowledgeDocumentSchema),
});

export const KnowledgeSpaceMutationDataSchema = z.object({
  space: KnowledgeSpaceSchema,
});

export const KnowledgeUploadDataSchema = z.object({
  space: KnowledgeSpaceSchema,
  document: KnowledgeDocumentSchema,
  indexed: z.boolean(),
  engine: KnowledgeRetrievalEngineSchema,
});

export const HealthResponseSchema =
  createApiSuccessResponseSchema(HealthDataSchema);
export const KnowledgeSpacesResponseSchema = createApiSuccessResponseSchema(
  KnowledgeSpacesDataSchema,
);
export const KnowledgeDocumentsResponseSchema = createApiSuccessResponseSchema(
  KnowledgeDocumentsDataSchema,
);
export const KnowledgeSpaceMutationResponseSchema =
  createApiSuccessResponseSchema(KnowledgeSpaceMutationDataSchema);
export const KnowledgeUploadResponseSchema = createApiSuccessResponseSchema(
  KnowledgeUploadDataSchema,
);
export const SearchKnowledgeResponseSchema = createApiSuccessResponseSchema(
  SearchKnowledgeResultSchema,
);
export const AskKnowledgeResponseSchema = createApiSuccessResponseSchema(
  AskKnowledgeResultSchema,
);

export type HealthData = z.infer<typeof HealthDataSchema>;
export type KnowledgeSpace = z.infer<typeof KnowledgeSpaceSchema>;
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;
export type KnowledgeSpaceIdParams = z.infer<
  typeof KnowledgeSpaceIdParamsSchema
>;
export type KnowledgeSpaceCreateRequest = z.infer<
  typeof KnowledgeSpaceCreateRequestSchema
>;
export type KnowledgeUploadMetadata = z.infer<
  typeof KnowledgeUploadMetadataSchema
>;
export type KnowledgeRetrievalEngine = z.infer<
  typeof KnowledgeRetrievalEngineSchema
>;
export type SearchKnowledgeRequest = z.infer<
  typeof SearchKnowledgeRequestSchema
>;
export type SearchKnowledgeHit = z.infer<typeof SearchKnowledgeHitSchema>;
export type SearchKnowledgeResult = z.infer<typeof SearchKnowledgeResultSchema>;
export type AskKnowledgeMode = z.infer<typeof AskKnowledgeModeSchema>;
export type AskKnowledgeRequest = z.infer<typeof AskKnowledgeRequestSchema>;
export type AskKnowledgeCitation = z.infer<typeof AskKnowledgeCitationSchema>;
export type AskKnowledgeResult = z.infer<typeof AskKnowledgeResultSchema>;
export type KnowledgeSpacesData = z.infer<typeof KnowledgeSpacesDataSchema>;
export type KnowledgeDocumentsData = z.infer<
  typeof KnowledgeDocumentsDataSchema
>;
export type KnowledgeSpaceMutationData = z.infer<
  typeof KnowledgeSpaceMutationDataSchema
>;
export type KnowledgeUploadData = z.infer<typeof KnowledgeUploadDataSchema>;
