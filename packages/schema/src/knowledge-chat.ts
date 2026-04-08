import { z } from "zod/v4";
import { createApiSuccessResponseSchema } from "./api";
import { KnowledgeSourceTypeSchema } from "./knowledge-library";
import { TimestampSchema } from "./utils";

export const ChatSessionIdParamsSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const ChatSessionsQuerySchema = z.object({
  collectionId: z.string().trim().min(1),
});

export const ChatMessageIdParamsSchema = z.object({
  messageId: z.string().trim().min(1),
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
});

export const ChatReplyStreamBodySchema = ChatReplyStreamRequestSchema.omit({
  sessionId: true,
});

const ChatReplyStreamAcceptedEventSchema = z.object({
  type: z.literal("reply-accepted"),
  userMessage: ChatMessageSchema,
});

const ChatReplyStreamCompletedEventSchema = z.object({
  type: z.literal("reply-completed"),
  session: ChatSessionSchema,
  userMessage: ChatMessageSchema,
  assistantMessage: ChatMessageSchema,
});

const ChatReplyStreamErrorEventSchema = z.object({
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

export const ChatSessionsResponseSchema = createApiSuccessResponseSchema(
  z.object({
    sessions: z.array(ChatSessionSchema),
  }),
);

export const ChatSessionResponseSchema = createApiSuccessResponseSchema(
  z.object({
    session: ChatSessionSchema,
  }),
);

export const ChatMessagesResponseSchema = createApiSuccessResponseSchema(
  z.object({
    session: ChatSessionSchema,
    messages: z.array(ChatMessageSchema),
  }),
);

export const ChatReplyResponseSchema =
  createApiSuccessResponseSchema(ChatReplyFinalSchema);

export const ChatMessageFeedbackResponseSchema = createApiSuccessResponseSchema(
  ChatMessageFeedbackSchema,
);

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
