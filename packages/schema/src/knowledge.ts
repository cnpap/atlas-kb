import { z } from "zod/v4";
import { createApiSuccessResponseSchema } from "./api";
import { TimestampSchema } from "./utils";

export const HealthDataSchema = z.object({
  status: z.literal("ok"),
  timestamp: TimestampSchema,
});

export const KnowledgeRetrievalEngineSchema = z.enum([
  "lexical",
  "vector",
  "hybrid",
]);

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

export const KnowledgeSourceTypeSchema = z.enum([
  "file",
  "text",
  "url",
  "seed",
]);

export const KnowledgeRecallPathSchema = z.enum([
  "关键词召回",
  "语义召回",
  "查询改写",
  "重排",
]);

export const KnowledgeLegacySourceSchema = z.enum(["seed", "upload"]);

export const KnowledgeSourceStatusSchema = z.enum([
  "processing",
  "ready",
  "failed",
  "archived",
]);

export const KnowledgeSourceSchema = z.object({
  id: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  spaceId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  contentPreview: z.string().trim().min(1),
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)),
  sourceType: KnowledgeSourceTypeSchema,
  source: KnowledgeLegacySourceSchema,
  status: KnowledgeSourceStatusSchema,
  sourceFilename: z.string().trim().min(1).optional(),
  sourceUrl: z.url().optional(),
  mimeType: z.string().trim().min(1).optional(),
  byteSize: z.number().int().positive().optional(),
  latestVersion: z.number().int().nonnegative(),
  readyAt: TimestampSchema.optional(),
  lastProcessedAt: TimestampSchema.optional(),
  snapshotUpdatedAt: TimestampSchema.optional(),
  failureMessage: z.string().trim().min(1).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const KnowledgeSourceVersionSchema = z.object({
  id: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  version: z.number().int().nonnegative(),
  parser: z.string().trim().min(1),
  content: z.string().trim().min(1),
  contentPreview: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).optional(),
  byteSize: z.number().int().positive().optional(),
  filePath: z.string().trim().min(1).optional(),
  snapshotHtml: z.string().trim().min(1).optional(),
  sourceUrl: z.url().optional(),
  createdAt: TimestampSchema,
});

export const KnowledgeImportJobStatusSchema = z.enum([
  "processing",
  "ready",
  "failed",
]);

export const KnowledgeImportJobStageSchema = z.enum([
  "queued",
  "fetching",
  "extracting",
  "chunking",
  "embedding",
  "completed",
]);

export const KnowledgeImportJobSchema = z.object({
  id: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  sourceType: KnowledgeSourceTypeSchema,
  stage: KnowledgeImportJobStageSchema,
  status: KnowledgeImportJobStatusSchema,
  attempt: z.number().int().positive(),
  errorMessage: z.string().trim().min(1).optional(),
  startedAt: TimestampSchema,
  finishedAt: TimestampSchema.optional(),
});

export const KnowledgeCollectionIdParamsSchema = z.object({
  collectionId: z.string().trim().min(1),
});

export const KnowledgeSourceIdParamsSchema = z.object({
  sourceId: z.string().trim().min(1),
});

export const ChatSessionIdParamsSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const ChatMessageIdParamsSchema = z.object({
  messageId: z.string().trim().min(1),
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

export const KnowledgeSourceMetadataSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().min(1).max(400).optional(),
  tags: KnowledgeSourceTagListSchema.optional(),
});

export const KnowledgeUploadMetadataSchema = KnowledgeSourceMetadataSchema;

export const KnowledgeFileImportRequestSchema =
  KnowledgeSourceMetadataSchema.extend({
    fileName: z.string().trim().min(1).max(255).optional(),
  });

export const KnowledgeTextImportRequestSchema =
  KnowledgeSourceMetadataSchema.extend({
    content: z.string().trim().min(1),
  });

export const KnowledgeUrlImportRequestSchema =
  KnowledgeSourceMetadataSchema.extend({
    url: z.url(),
  });

export const KnowledgeSourceUpdateRequestSchema =
  KnowledgeSourceMetadataSchema.extend({
    status: KnowledgeSourceStatusSchema.optional(),
  });

export const KnowledgeSearchRequestSchema = z.object({
  query: z.string().trim().min(1),
  collectionId: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  sourceTypes: z.array(KnowledgeSourceTypeSchema).max(4).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  includeArchived: z.boolean().optional(),
});

export const SearchKnowledgeHitSchema = z.object({
  sourceId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  spaceId: z.string().trim().min(1),
  chunkId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  snippet: z.string().trim().min(1),
  sectionPath: z.string().trim().min(1).optional(),
  sourceFilename: z.string().trim().min(1).optional(),
  sourceUrl: z.url().optional(),
  downloadUrl: z.string().trim().min(1).optional(),
  sourceType: KnowledgeSourceTypeSchema,
  tags: z.array(z.string().trim().min(1)),
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

export const ChatSessionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  collectionId: z.string().trim().min(1).optional(),
  preview: z.string().trim().min(1),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  lastMessageAt: TimestampSchema,
});

export const ChatMessageRoleSchema = z.enum(["user", "assistant"]);

export const ChatCitationSchema = z.object({
  sourceId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  spaceId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  sectionPath: z.string().trim().min(1).optional(),
  snippet: z.string().trim().min(1),
  sourceFilename: z.string().trim().min(1).optional(),
  sourceUrl: z.url().optional(),
  downloadUrl: z.string().trim().min(1).optional(),
  sourceType: KnowledgeSourceTypeSchema,
});

export const ChatMessageFeedbackRatingSchema = z.enum(["up", "down"]);

export const ChatMessageFeedbackSchema = z.object({
  id: z.string().trim().min(1),
  messageId: z.string().trim().min(1),
  rating: ChatMessageFeedbackRatingSchema,
  note: z.string().trim().min(1).max(500).optional(),
  createdAt: TimestampSchema,
});

export const ChatMessageSchema = z.object({
  id: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  role: ChatMessageRoleSchema,
  content: z.string().trim().min(1),
  citations: z.array(ChatCitationSchema),
  retrieval: SearchKnowledgeResultSchema.optional(),
  createdAt: TimestampSchema,
  feedback: ChatMessageFeedbackSchema.optional(),
});

export const ChatSessionCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  collectionId: z.string().trim().min(1).optional(),
});

export const ChatSessionUpdateRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const ChatReplyRequestSchema = z.object({
  query: z.string().trim().min(1),
  collectionId: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(8).optional(),
});

export const ChatReplyFinalSchema = z.object({
  session: ChatSessionSchema,
  userMessage: ChatMessageSchema,
  assistantMessage: ChatMessageSchema,
  retrieval: SearchKnowledgeResultSchema,
  search: SearchKnowledgeResultSchema,
});

export const ChatMessageFeedbackRequestSchema = z.object({
  rating: ChatMessageFeedbackRatingSchema,
  note: z.string().trim().min(1).max(500).optional(),
});

export const DashboardSummarySchema = z.object({
  collectionsCount: z.number().int().nonnegative(),
  readySourcesCount: z.number().int().nonnegative(),
  processingSourcesCount: z.number().int().nonnegative(),
  failedSourcesCount: z.number().int().nonnegative(),
  chatSessionsCount: z.number().int().nonnegative(),
  recentCollections: z.array(KnowledgeCollectionSchema),
  recentSources: z.array(KnowledgeSourceSchema),
  recentSessions: z.array(ChatSessionSchema),
  hasAnyData: z.boolean(),
});

export const KnowledgeCollectionsDataSchema = z.object({
  collections: z.array(KnowledgeCollectionSchema),
});

export const KnowledgeCollectionDataSchema = z.object({
  collection: KnowledgeCollectionSchema,
});

export const KnowledgeSourcesDataSchema = z.object({
  collection: KnowledgeCollectionSchema,
  sources: z.array(KnowledgeSourceSchema),
});

export const KnowledgeSourceDataSchema = z.object({
  source: KnowledgeSourceSchema,
});

export const KnowledgeImportJobsDataSchema = z.object({
  jobs: z.array(KnowledgeImportJobSchema),
});

export const KnowledgeImportDataSchema = z.object({
  collection: KnowledgeCollectionSchema,
  source: KnowledgeSourceSchema,
  job: KnowledgeImportJobSchema,
  engine: KnowledgeRetrievalEngineSchema,
  indexed: z.boolean(),
});

export const ChatSessionsDataSchema = z.object({
  sessions: z.array(ChatSessionSchema),
});

export const ChatSessionDataSchema = z.object({
  session: ChatSessionSchema,
});

export const ChatMessagesDataSchema = z.object({
  session: ChatSessionSchema,
  messages: z.array(ChatMessageSchema),
});

export const DashboardSummaryResponseSchema = createApiSuccessResponseSchema(
  DashboardSummarySchema,
);
export const HealthResponseSchema =
  createApiSuccessResponseSchema(HealthDataSchema);
export const KnowledgeCollectionsResponseSchema =
  createApiSuccessResponseSchema(KnowledgeCollectionsDataSchema);
export const KnowledgeCollectionResponseSchema = createApiSuccessResponseSchema(
  KnowledgeCollectionDataSchema,
);
export const KnowledgeSourcesResponseSchema = createApiSuccessResponseSchema(
  KnowledgeSourcesDataSchema,
);
export const KnowledgeSourceResponseSchema = createApiSuccessResponseSchema(
  KnowledgeSourceDataSchema,
);
export const KnowledgeImportJobsResponseSchema = createApiSuccessResponseSchema(
  KnowledgeImportJobsDataSchema,
);
export const KnowledgeImportResponseSchema = createApiSuccessResponseSchema(
  KnowledgeImportDataSchema,
);
export const SearchKnowledgeResponseSchema = createApiSuccessResponseSchema(
  SearchKnowledgeResultSchema,
);
export const ChatSessionsResponseSchema = createApiSuccessResponseSchema(
  ChatSessionsDataSchema,
);
export const ChatSessionResponseSchema = createApiSuccessResponseSchema(
  ChatSessionDataSchema,
);
export const ChatMessagesResponseSchema = createApiSuccessResponseSchema(
  ChatMessagesDataSchema,
);
export const ChatReplyResponseSchema =
  createApiSuccessResponseSchema(ChatReplyFinalSchema);
export const ChatMessageFeedbackResponseSchema = createApiSuccessResponseSchema(
  ChatMessageFeedbackSchema,
);

export const KnowledgeSpaceSchema = KnowledgeCollectionSchema;
export const KnowledgeDocumentSchema = KnowledgeSourceSchema;
export const KnowledgeSpaceIdParamsSchema = z.object({
  spaceId: z.string().trim().min(1),
});
export const KnowledgeDocumentDownloadParamsSchema = z.object({
  documentId: z.string().trim().min(1),
  spaceId: z.string().trim().min(1),
});
export const KnowledgeSpaceCreateRequestSchema =
  KnowledgeCollectionCreateRequestSchema;
export const KnowledgeSpacesDataSchema = z.object({
  spaces: z.array(KnowledgeCollectionSchema),
});
export const KnowledgeDocumentsDataSchema = z.object({
  space: KnowledgeCollectionSchema,
  documents: z.array(KnowledgeSourceSchema),
});
export const KnowledgeSpaceMutationDataSchema = z.object({
  space: KnowledgeCollectionSchema,
});
export const KnowledgeUploadDataSchema = z.object({
  space: KnowledgeCollectionSchema,
  document: KnowledgeSourceSchema,
  indexed: z.boolean(),
  engine: KnowledgeRetrievalEngineSchema,
});
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
export const AskKnowledgeModeSchema = z.enum(["model", "mock"]);
export const AskKnowledgeRequestSchema = z.object({
  question: z.string().trim().min(1),
  spaceId: z.string().trim().min(1).optional(),
  collectionId: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(8).optional(),
});
export const AskKnowledgeCitationSchema = ChatCitationSchema;
export const AskKnowledgeResultSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  mode: AskKnowledgeModeSchema,
  engine: KnowledgeRetrievalEngineSchema,
  citations: z.array(ChatCitationSchema),
});
export const AskKnowledgeResponseSchema = createApiSuccessResponseSchema(
  AskKnowledgeResultSchema,
);
export const SearchKnowledgeRequestSchema = KnowledgeSearchRequestSchema.extend(
  {
    spaceId: z.string().trim().min(1).optional(),
  },
);

export type HealthData = z.infer<typeof HealthDataSchema>;
export type KnowledgeRetrievalEngine = z.infer<
  typeof KnowledgeRetrievalEngineSchema
>;
export type KnowledgeCollection = z.infer<typeof KnowledgeCollectionSchema>;
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;
export type KnowledgeSourceVersion = z.infer<
  typeof KnowledgeSourceVersionSchema
>;
export type KnowledgeImportJob = z.infer<typeof KnowledgeImportJobSchema>;
export type KnowledgeCollectionCreateRequest = z.infer<
  typeof KnowledgeCollectionCreateRequestSchema
>;
export type KnowledgeCollectionUpdateRequest = z.infer<
  typeof KnowledgeCollectionUpdateRequestSchema
>;
export type KnowledgeFileImportRequest = z.infer<
  typeof KnowledgeFileImportRequestSchema
>;
export type KnowledgeTextImportRequest = z.infer<
  typeof KnowledgeTextImportRequestSchema
>;
export type KnowledgeUrlImportRequest = z.infer<
  typeof KnowledgeUrlImportRequestSchema
>;
export type KnowledgeSourceUpdateRequest = z.infer<
  typeof KnowledgeSourceUpdateRequestSchema
>;
export type SearchKnowledgeRequest = z.infer<
  typeof SearchKnowledgeRequestSchema
>;
export type SearchKnowledgeHit = z.infer<typeof SearchKnowledgeHitSchema>;
export type SearchKnowledgeResult = z.infer<typeof SearchKnowledgeResultSchema>;
export type ChatSession = z.infer<typeof ChatSessionSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatCitation = z.infer<typeof ChatCitationSchema>;
export type ChatSessionCreateRequest = z.infer<
  typeof ChatSessionCreateRequestSchema
>;
export type ChatSessionUpdateRequest = z.infer<
  typeof ChatSessionUpdateRequestSchema
>;
export type ChatReplyRequest = z.infer<typeof ChatReplyRequestSchema>;
export type ChatReplyFinal = z.infer<typeof ChatReplyFinalSchema>;
export type ChatMessageFeedback = z.infer<typeof ChatMessageFeedbackSchema>;
export type ChatMessageFeedbackRequest = z.infer<
  typeof ChatMessageFeedbackRequestSchema
>;
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
export type KnowledgeCollectionsData = z.infer<
  typeof KnowledgeCollectionsDataSchema
>;
export type KnowledgeCollectionData = z.infer<
  typeof KnowledgeCollectionDataSchema
>;
export type KnowledgeSourcesData = z.infer<typeof KnowledgeSourcesDataSchema>;
export type KnowledgeSourceData = z.infer<typeof KnowledgeSourceDataSchema>;
export type KnowledgeImportJobsData = z.infer<
  typeof KnowledgeImportJobsDataSchema
>;
export type KnowledgeImportData = z.infer<typeof KnowledgeImportDataSchema>;
export type ChatSessionsData = z.infer<typeof ChatSessionsDataSchema>;
export type ChatSessionData = z.infer<typeof ChatSessionDataSchema>;
export type ChatMessagesData = z.infer<typeof ChatMessagesDataSchema>;

export type KnowledgeSpace = z.infer<typeof KnowledgeSpaceSchema>;
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;
export type KnowledgeSpaceIdParams = z.infer<
  typeof KnowledgeSpaceIdParamsSchema
>;
export type KnowledgeDocumentDownloadParams = z.infer<
  typeof KnowledgeDocumentDownloadParamsSchema
>;
export type KnowledgeSpaceCreateRequest = z.infer<
  typeof KnowledgeSpaceCreateRequestSchema
>;
export type KnowledgeSpacesData = z.infer<typeof KnowledgeSpacesDataSchema>;
export type KnowledgeDocumentsData = z.infer<
  typeof KnowledgeDocumentsDataSchema
>;
export type KnowledgeSpaceMutationData = z.infer<
  typeof KnowledgeSpaceMutationDataSchema
>;
export type KnowledgeUploadData = z.infer<typeof KnowledgeUploadDataSchema>;
export type KnowledgeUploadMetadata = z.infer<
  typeof KnowledgeUploadMetadataSchema
>;
export type AskKnowledgeMode = z.infer<typeof AskKnowledgeModeSchema>;
export type AskKnowledgeRequest = z.infer<typeof AskKnowledgeRequestSchema>;
export type AskKnowledgeCitation = z.infer<typeof AskKnowledgeCitationSchema>;
export type AskKnowledgeResult = z.infer<typeof AskKnowledgeResultSchema>;
