import { z } from "zod/v4";
import { createApiSuccessResponseSchema } from "./api";
import { TimestampSchema } from "./utils";

export const KnowledgeRetrievalEngineSchema = z.enum([
  "lexical",
  "vector",
  "hybrid",
]);

export const KnowledgeSourceTypeSchema = z.enum(["file", "text", "seed"]);

export const KnowledgeRecallPathSchema = z.enum([
  "关键词召回",
  "语义召回",
  "查询改写",
  "重排",
]);

export const KnowledgeSourceStatusSchema = z.enum([
  "processing",
  "ready",
  "failed",
  "archived",
]);

export const KnowledgeIndexLifecycleStatusSchema = z.enum([
  "canonicalizing",
  "indexing",
  "paused",
  "failed",
  "completed",
]);

export const KnowledgeIndexFailureSchema = z.object({
  chunkId: z.string().trim().min(1),
  ordinal: z.number().int().nonnegative(),
  pageNumbers: z.array(z.number().int().positive()),
  error: z.string().trim().min(1),
});

export const KnowledgeSourceIndexProgressSchema = z.object({
  path: z.string().trim().min(1),
  status: KnowledgeIndexLifecycleStatusSchema,
  totalChunks: z.number().int().nonnegative(),
  completedChunks: z.number().int().nonnegative(),
  failedChunks: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  completedPages: z.number().int().nonnegative(),
  failedPages: z.number().int().nonnegative(),
  lastProcessedPage: z.number().int().positive().nullable(),
  resumeable: z.boolean(),
  failedChunkDetails: z.array(KnowledgeIndexFailureSchema),
  lastError: z.string().trim().min(1).nullable(),
  updatedAt: TimestampSchema,
});

export const KnowledgeCollectionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  color: z.string().trim().min(1).default("#0f766e"),
  icon: z.string().trim().min(1).default("i-lucide-library"),
  isPinned: z.boolean().default(false),
  documentCount: z.number().int().nonnegative(),
  readyDocumentCount: z.number().int().nonnegative(),
  processingDocumentCount: z.number().int().nonnegative(),
  failedDocumentCount: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  lastActivityAt: TimestampSchema,
});

export const KnowledgeSourceSchema = z.object({
  id: z.string().trim().min(1),
  documentId: z.string().trim().min(1).optional(),
  collectionId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)),
  sourceType: KnowledgeSourceTypeSchema,
  status: KnowledgeSourceStatusSchema,
  sourceFilename: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).optional(),
  byteSize: z.number().int().positive().optional(),
  failureMessage: z.string().trim().min(1).optional(),
  indexProgress: KnowledgeSourceIndexProgressSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const KnowledgeCollectionIdParamsSchema = z.object({
  collectionId: z.string().trim().min(1),
});

export const KnowledgeSourceIdParamsSchema = z.object({
  sourceId: z.string().trim().min(1),
});

export const KnowledgeCollectionCreateRequestSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(280),
  color: z.string().trim().min(1).max(32).optional(),
  icon: z.string().trim().min(1).max(64).optional(),
});

export const KnowledgeCollectionUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(280).optional(),
  color: z.string().trim().min(1).max(32).optional(),
  icon: z.string().trim().min(1).max(64).optional(),
  isPinned: z.boolean().optional(),
});

export const KnowledgeSourceTagListSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(24);

export const KnowledgeSourceInputSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().min(1).max(400).optional(),
  tags: KnowledgeSourceTagListSchema.optional(),
});

const KnowledgeBatchFileImportRequestSchema = KnowledgeSourceInputSchema.pick({
  summary: true,
  tags: true,
});

export const KnowledgeTextImportRequestSchema =
  KnowledgeSourceInputSchema.extend({
    content: z.string().trim().min(1),
  });

export const KnowledgeSourceUpdateRequestSchema =
  KnowledgeSourceInputSchema.extend({
    content: z.string().trim().min(1).optional(),
    status: KnowledgeSourceStatusSchema.optional(),
  });

export const KnowledgeImportDataSchema = z.object({
  collection: KnowledgeCollectionSchema,
  source: KnowledgeSourceSchema,
  engine: KnowledgeRetrievalEngineSchema,
});

const KnowledgeBatchImportAcceptedItemSchema = z.object({
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).optional(),
  byteSize: z.number().int().nonnegative().optional(),
  accepted: z.literal(true),
  source: KnowledgeSourceSchema,
});

const KnowledgeBatchImportRejectedItemSchema = z.object({
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).optional(),
  byteSize: z.number().int().nonnegative().optional(),
  accepted: z.literal(false),
  errorMessage: z.string().trim().min(1),
});

export const KnowledgeBatchImportItemSchema = z.discriminatedUnion("accepted", [
  KnowledgeBatchImportAcceptedItemSchema,
  KnowledgeBatchImportRejectedItemSchema,
]);

export const KnowledgeBatchImportDataSchema = z.object({
  collection: KnowledgeCollectionSchema,
  results: z.array(KnowledgeBatchImportItemSchema),
  totalCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
});

export const KnowledgeCollectionsResponseSchema =
  createApiSuccessResponseSchema(
    z.object({
      collections: z.array(KnowledgeCollectionSchema),
    }),
  );

export const KnowledgeCollectionResponseSchema = createApiSuccessResponseSchema(
  z.object({
    collection: KnowledgeCollectionSchema,
  }),
);

export const KnowledgeSourcesResponseSchema = createApiSuccessResponseSchema(
  z.object({
    collection: KnowledgeCollectionSchema,
    sources: z.array(KnowledgeSourceSchema),
  }),
);

export const KnowledgeSourceResponseSchema = createApiSuccessResponseSchema(
  z.object({
    source: KnowledgeSourceSchema,
  }),
);

export const KnowledgeImportResponseSchema = createApiSuccessResponseSchema(
  KnowledgeImportDataSchema,
);

export type KnowledgeCollection = z.infer<typeof KnowledgeCollectionSchema>;
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;
export type KnowledgeSourceIndexProgress = z.infer<
  typeof KnowledgeSourceIndexProgressSchema
>;
export type KnowledgeCollectionCreateRequest = z.infer<
  typeof KnowledgeCollectionCreateRequestSchema
>;
export type KnowledgeCollectionUpdateRequest = z.infer<
  typeof KnowledgeCollectionUpdateRequestSchema
>;
export type KnowledgeBatchFileImportRequest = z.infer<
  typeof KnowledgeBatchFileImportRequestSchema
>;
export type KnowledgeTextImportRequest = z.infer<
  typeof KnowledgeTextImportRequestSchema
>;
export type KnowledgeSourceUpdateRequest = z.infer<
  typeof KnowledgeSourceUpdateRequestSchema
>;
export type KnowledgeImportData = z.infer<typeof KnowledgeImportDataSchema>;
export type KnowledgeBatchImportData = z.infer<
  typeof KnowledgeBatchImportDataSchema
>;
