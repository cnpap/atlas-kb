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

export const KnowledgeSourceSchema = z.object({
  id: z.string().trim().min(1),
  documentId: z.string().trim().min(1).optional(),
  collectionId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  contentPreview: z.string().trim().min(1),
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)),
  sourceType: KnowledgeSourceTypeSchema,
  status: KnowledgeSourceStatusSchema,
  sourceFilename: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).optional(),
  byteSize: z.number().int().positive().optional(),
  latestVersion: z.number().int().nonnegative(),
  readyAt: TimestampSchema.optional(),
  lastProcessedAt: TimestampSchema.optional(),
  failureMessage: z.string().trim().min(1).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const KnowledgeCollectionIdParamsSchema = z.object({
  collectionId: z.string().trim().min(1),
});

export const KnowledgeSourceIdParamsSchema = z.object({
  sourceId: z.string().trim().min(1),
});

export const KnowledgeTemplateIdParamsSchema = z.object({
  templateId: z.string().trim().min(1),
});

export const KnowledgeExportTaskIdParamsSchema = z.object({
  taskId: z.string().trim().min(1),
});

export const ChatSessionIdParamsSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const ChatSessionsQuerySchema = z.object({
  collectionId: z.string().trim().min(1),
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
export const KnowledgeBatchFileImportRequestSchema =
  KnowledgeSourceMetadataSchema.pick({
    summary: true,
    tags: true,
  });

export const KnowledgeTextImportRequestSchema =
  KnowledgeSourceMetadataSchema.extend({
    content: z.string().trim().min(1),
  });

export const KnowledgeSourceUpdateRequestSchema =
  KnowledgeSourceMetadataSchema.extend({
    content: z.string().trim().min(1).optional(),
    status: KnowledgeSourceStatusSchema.optional(),
  });

export const KnowledgeSearchRequestSchema = z.object({
  query: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(20).optional(),
  sourceTypes: z.array(KnowledgeSourceTypeSchema).max(4).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  includeArchived: z.boolean().optional(),
});

export const SearchKnowledgeHitSchema = z.object({
  sourceId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  chunkId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  snippet: z.string().trim().min(1),
  sectionPath: z.string().trim().min(1).optional(),
  sourceFilename: z.string().trim().min(1).optional(),
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
  collectionId: z.string().trim().min(1),
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
  title: z.string().trim().min(1),
  sectionPath: z.string().trim().min(1).optional(),
  snippet: z.string().trim().min(1),
  sourceFilename: z.string().trim().min(1).optional(),
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
  citations: z.array(ChatCitationSchema).optional().default([]),
  createdAt: TimestampSchema,
  feedback: ChatMessageFeedbackSchema.optional(),
});

export const ChatSessionCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  collectionId: z.string().trim().min(1),
});

export const ChatSessionUpdateRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const ChatReplyRequestSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(8).optional(),
});

export const ChatReplyFinalSchema = z.object({
  session: ChatSessionSchema,
  userMessage: ChatMessageSchema,
  assistantMessage: ChatMessageSchema,
});

export const ChatReplyStreamRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(8).optional(),
  messages: z.array(z.unknown()).optional(),
});

export const ChatReplyStreamBodySchema = ChatReplyStreamRequestSchema.omit({
  sessionId: true,
});

export const ChatReplyStreamAcceptedEventSchema = z.object({
  type: z.literal("reply-accepted"),
  userMessage: ChatMessageSchema,
});

export const ChatReplyStreamCompletedEventSchema = z.object({
  type: z.literal("reply-completed"),
  session: ChatSessionSchema,
  userMessage: ChatMessageSchema,
  assistantMessage: ChatMessageSchema,
});

export const ChatReplyStreamErrorEventSchema = z.object({
  type: z.literal("reply-error"),
  message: z.string().trim().min(1),
});

export const ChatReplyStreamDataEventSchema = z.discriminatedUnion("type", [
  ChatReplyStreamAcceptedEventSchema,
  ChatReplyStreamCompletedEventSchema,
  ChatReplyStreamErrorEventSchema,
]);

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

export const KnowledgeImportDataSchema = z.object({
  collection: KnowledgeCollectionSchema,
  source: KnowledgeSourceSchema,
  engine: KnowledgeRetrievalEngineSchema,
  indexed: z.boolean(),
});

export const KnowledgeBatchImportAcceptedItemSchema = z.object({
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).optional(),
  byteSize: z.number().int().nonnegative().optional(),
  accepted: z.literal(true),
  source: KnowledgeSourceSchema,
});

export const KnowledgeBatchImportRejectedItemSchema = z.object({
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
export const KnowledgeImportResponseSchema = createApiSuccessResponseSchema(
  KnowledgeImportDataSchema,
);
export const KnowledgeBatchImportResponseSchema =
  createApiSuccessResponseSchema(KnowledgeBatchImportDataSchema);
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

export const AskKnowledgeModeSchema = z.enum(["model", "mock"]);
export const AskKnowledgeRequestSchema = z.object({
  question: z.string().trim().min(1),
  collectionId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(8).optional(),
});
export const AskKnowledgeCitationSchema = ChatCitationSchema;
export const AskKnowledgeResultSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  mode: AskKnowledgeModeSchema,
});

export const BriefingFieldKeySchema = z.enum([
  "sourceOrg",
  "documentCode",
  "documentTitle",
  "receivedAt",
  "briefingOpinion",
  "pendingQuestions",
]);

export const BriefingFieldStatusSchema = z.enum(["confirmed", "missing"]);

export const BriefingCitationSchema = z.object({
  documentId: z.string().trim().min(1),
  segmentId: z.string().trim().min(1),
  locatorStart: z.number().int().positive(),
  locatorEnd: z.number().int().positive(),
  excerpt: z.string().trim().min(1),
});

export const BriefingFormSchema = z.object({
  sourceOrg: z.string(),
  documentCode: z.string(),
  documentTitle: z.string(),
  receivedAt: z.string(),
  briefingOpinion: z.string(),
  pendingQuestions: z.string(),
});

export const BriefingFieldSchema = z.object({
  key: BriefingFieldKeySchema,
  label: z.string().trim().min(1),
  value: z.string(),
  status: BriefingFieldStatusSchema,
  citations: z.array(BriefingCitationSchema),
});

export const BriefingOpinionSchema = z.object({
  sourceId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  form: BriefingFormSchema,
  fields: z.array(BriefingFieldSchema),
  citations: z.array(BriefingCitationSchema),
  generatedAt: TimestampSchema,
});

export const BriefingExportSchema = z.object({
  id: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  form: BriefingFormSchema,
  citations: z.array(BriefingCitationSchema),
  createdAt: TimestampSchema,
});

export const KnowledgeTemplateSummarySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  templateType: z.string().trim().min(1),
  sourceFilename: z.string().trim().min(1),
  fieldCount: z.number().int().nonnegative(),
  referenceLibraryCount: z.number().int().nonnegative(),
  parsedAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema,
});

export const KnowledgeTemplateFieldSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().optional().default(""),
  sortOrder: z.number().int().nonnegative(),
  locations: z.array(z.record(z.string(), z.unknown())),
});

export const KnowledgeTemplateLibrarySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  storagePrefix: z.string().trim().min(1),
  fileCount: z.number().int().nonnegative(),
});

export const KnowledgeTemplateDetailSchema =
  KnowledgeTemplateSummarySchema.extend({
    systemPrompt: z.string(),
    fields: z.array(KnowledgeTemplateFieldSchema),
    referenceLibraries: z.array(KnowledgeTemplateLibrarySchema),
  });

export const KnowledgeExportTaskStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const KnowledgeTemplateExportFileSchema = z.object({
  id: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
  outputFilename: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  byteSize: z.number().int().nonnegative(),
  downloadUrl: z.string().trim().min(1),
  expiresAt: TimestampSchema.optional(),
  createdAt: TimestampSchema,
});

export const KnowledgeExportTaskParametersSchema = z.record(
  z.string(),
  z.string(),
);

export const KnowledgeExportTaskSchema = z.object({
  id: z.string().trim().min(1),
  ownerUserId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  taskType: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
  templateName: z.string().trim().min(1),
  status: KnowledgeExportTaskStatusSchema,
  failureMessage: z.string().trim().min(1).nullable().optional(),
  exportFile: KnowledgeTemplateExportFileSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  startedAt: TimestampSchema.nullable().optional(),
  completedAt: TimestampSchema.nullable().optional(),
  failedAt: TimestampSchema.nullable().optional(),
});

export const KnowledgeExportTaskCreateRequestSchema = z.object({
  templateId: z.string().trim().min(1),
});
export const KnowledgeExportTasksQuerySchema = z.object({
  sourceId: z.string().trim().min(1).optional(),
});
export const KnowledgeExportTaskUpdateRequestSchema = z.object({
  parameters: KnowledgeExportTaskParametersSchema,
});
export const KnowledgeExportTaskGenerateRequestSchema = z.object({
  userId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  template: KnowledgeTemplateDetailSchema,
});
export const KnowledgeExportTaskGenerateResultSchema = z.object({
  summary: z.string(),
  parameters: z.record(z.string(), z.string()),
  citations: z.array(BriefingCitationSchema),
});

export const BriefingOpinionDataSchema = z.object({
  source: KnowledgeSourceSchema,
  briefing: BriefingOpinionSchema,
  history: z.array(BriefingExportSchema),
});

export const BriefingExportDataSchema = z.object({
  export: BriefingExportSchema,
});

export const BriefingExportsDataSchema = z.object({
  exports: z.array(BriefingExportSchema),
});
export const KnowledgeTemplatesDataSchema = z.object({
  templates: z.array(KnowledgeTemplateSummarySchema),
});
export const KnowledgeTemplateDataSchema = z.object({
  template: KnowledgeTemplateDetailSchema,
});
export const KnowledgeExportTasksDataSchema = z.object({
  tasks: z.array(KnowledgeExportTaskSchema),
});
export const KnowledgeExportTaskDataSchema = z.object({
  task: KnowledgeExportTaskSchema,
});
export const KnowledgeExportTaskDetailSchema = KnowledgeExportTaskSchema.extend(
  {
    template: KnowledgeTemplateDetailSchema,
    parameters: KnowledgeExportTaskParametersSchema,
    canEdit: z.boolean(),
  },
);
export const KnowledgeExportTaskDetailDataSchema = z.object({
  task: KnowledgeExportTaskDetailSchema,
});
export const KnowledgeExportTaskGenerateDataSchema = z.object({
  result: KnowledgeExportTaskGenerateResultSchema,
});

export const BriefingExportCreateRequestSchema = z.object({
  summary: z.string().trim().min(1),
  form: BriefingFormSchema,
  citations: z.array(BriefingCitationSchema).optional(),
});

export const BriefingOpinionResponseSchema = createApiSuccessResponseSchema(
  BriefingOpinionDataSchema,
);
export const BriefingExportResponseSchema = createApiSuccessResponseSchema(
  BriefingExportDataSchema,
);
export const BriefingExportsResponseSchema = createApiSuccessResponseSchema(
  BriefingExportsDataSchema,
);
export const KnowledgeTemplatesResponseSchema = createApiSuccessResponseSchema(
  KnowledgeTemplatesDataSchema,
);
export const KnowledgeTemplateResponseSchema = createApiSuccessResponseSchema(
  KnowledgeTemplateDataSchema,
);
export const KnowledgeExportTasksResponseSchema =
  createApiSuccessResponseSchema(KnowledgeExportTasksDataSchema);
export const KnowledgeExportTaskResponseSchema = createApiSuccessResponseSchema(
  KnowledgeExportTaskDataSchema,
);
export const KnowledgeExportTaskDetailResponseSchema =
  createApiSuccessResponseSchema(KnowledgeExportTaskDetailDataSchema);
export const KnowledgeExportTaskGenerateResponseSchema =
  createApiSuccessResponseSchema(KnowledgeExportTaskGenerateDataSchema);
export const AskKnowledgeResponseSchema = createApiSuccessResponseSchema(
  AskKnowledgeResultSchema,
);
export const SearchKnowledgeRequestSchema = KnowledgeSearchRequestSchema;

export type HealthData = z.infer<typeof HealthDataSchema>;
export type KnowledgeRetrievalEngine = z.infer<
  typeof KnowledgeRetrievalEngineSchema
>;
export type KnowledgeCollection = z.infer<typeof KnowledgeCollectionSchema>;
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;
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
export type SearchKnowledgeRequest = z.infer<
  typeof SearchKnowledgeRequestSchema
>;
export type SearchKnowledgeHit = z.infer<typeof SearchKnowledgeHitSchema>;
export type SearchKnowledgeResult = z.infer<typeof SearchKnowledgeResultSchema>;
export type ChatSession = z.infer<typeof ChatSessionSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatCitation = z.infer<typeof ChatCitationSchema>;
export type ChatSessionsQuery = z.infer<typeof ChatSessionsQuerySchema>;
export type ChatSessionCreateRequest = z.infer<
  typeof ChatSessionCreateRequestSchema
>;
export type ChatSessionUpdateRequest = z.infer<
  typeof ChatSessionUpdateRequestSchema
>;
export type ChatReplyRequest = z.infer<typeof ChatReplyRequestSchema>;
export type ChatReplyFinal = z.infer<typeof ChatReplyFinalSchema>;
export type ChatReplyStreamRequest = z.infer<
  typeof ChatReplyStreamRequestSchema
>;
export type ChatReplyStreamBody = z.infer<typeof ChatReplyStreamBodySchema>;
export type ChatReplyStreamDataEvent = z.infer<
  typeof ChatReplyStreamDataEventSchema
>;
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
export type KnowledgeImportData = z.infer<typeof KnowledgeImportDataSchema>;
export type KnowledgeBatchImportItem = z.infer<
  typeof KnowledgeBatchImportItemSchema
>;
export type KnowledgeBatchImportData = z.infer<
  typeof KnowledgeBatchImportDataSchema
>;
export type ChatSessionsData = z.infer<typeof ChatSessionsDataSchema>;
export type ChatSessionData = z.infer<typeof ChatSessionDataSchema>;
export type ChatMessagesData = z.infer<typeof ChatMessagesDataSchema>;
export type KnowledgeUploadMetadata = z.infer<
  typeof KnowledgeUploadMetadataSchema
>;
export type AskKnowledgeMode = z.infer<typeof AskKnowledgeModeSchema>;
export type AskKnowledgeRequest = z.infer<typeof AskKnowledgeRequestSchema>;
export type AskKnowledgeCitation = z.infer<typeof AskKnowledgeCitationSchema>;
export type AskKnowledgeResult = z.infer<typeof AskKnowledgeResultSchema>;
export type BriefingFieldKey = z.infer<typeof BriefingFieldKeySchema>;
export type BriefingFieldStatus = z.infer<typeof BriefingFieldStatusSchema>;
export type BriefingCitation = z.infer<typeof BriefingCitationSchema>;
export type BriefingForm = z.infer<typeof BriefingFormSchema>;
export type BriefingField = z.infer<typeof BriefingFieldSchema>;
export type BriefingOpinion = z.infer<typeof BriefingOpinionSchema>;
export type BriefingExport = z.infer<typeof BriefingExportSchema>;
export type KnowledgeTemplateSummary = z.infer<
  typeof KnowledgeTemplateSummarySchema
>;
export type KnowledgeTemplateField = z.infer<
  typeof KnowledgeTemplateFieldSchema
>;
export type KnowledgeTemplateLibrary = z.infer<
  typeof KnowledgeTemplateLibrarySchema
>;
export type KnowledgeTemplateDetail = z.infer<
  typeof KnowledgeTemplateDetailSchema
>;
export type KnowledgeExportTaskParameters = z.infer<
  typeof KnowledgeExportTaskParametersSchema
>;
export type KnowledgeExportTaskStatus = z.infer<
  typeof KnowledgeExportTaskStatusSchema
>;
export type KnowledgeTemplateExportFile = z.infer<
  typeof KnowledgeTemplateExportFileSchema
>;
export type KnowledgeExportTask = z.infer<typeof KnowledgeExportTaskSchema>;
export type KnowledgeExportTaskDetail = z.infer<
  typeof KnowledgeExportTaskDetailSchema
>;
export type KnowledgeExportTasksQuery = z.infer<
  typeof KnowledgeExportTasksQuerySchema
>;
export type BriefingOpinionData = z.infer<typeof BriefingOpinionDataSchema>;
export type BriefingExportData = z.infer<typeof BriefingExportDataSchema>;
export type BriefingExportsData = z.infer<typeof BriefingExportsDataSchema>;
export type KnowledgeTemplatesData = z.infer<
  typeof KnowledgeTemplatesDataSchema
>;
export type KnowledgeTemplateData = z.infer<typeof KnowledgeTemplateDataSchema>;
export type KnowledgeExportTasksData = z.infer<
  typeof KnowledgeExportTasksDataSchema
>;
export type KnowledgeExportTaskData = z.infer<
  typeof KnowledgeExportTaskDataSchema
>;
export type KnowledgeExportTaskDetailData = z.infer<
  typeof KnowledgeExportTaskDetailDataSchema
>;
export type BriefingExportCreateRequest = z.infer<
  typeof BriefingExportCreateRequestSchema
>;
export type KnowledgeExportTaskCreateRequest = z.infer<
  typeof KnowledgeExportTaskCreateRequestSchema
>;
export type KnowledgeExportTaskUpdateRequest = z.infer<
  typeof KnowledgeExportTaskUpdateRequestSchema
>;
export type KnowledgeExportTaskGenerateRequest = z.infer<
  typeof KnowledgeExportTaskGenerateRequestSchema
>;
export type KnowledgeExportTaskGenerateResult = z.infer<
  typeof KnowledgeExportTaskGenerateResultSchema
>;
export type KnowledgeExportTaskGenerateData = z.infer<
  typeof KnowledgeExportTaskGenerateDataSchema
>;
