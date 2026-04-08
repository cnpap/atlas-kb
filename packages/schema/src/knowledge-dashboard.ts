import { z } from "zod/v4";
import { createApiSuccessResponseSchema } from "./api";
import { ChatSessionSchema } from "./knowledge-chat";
import {
  KnowledgeCollectionSchema,
  KnowledgeSourceSchema,
} from "./knowledge-library";
import { TimestampSchema } from "./utils";

const HealthDataSchema = z.object({
  status: z.literal("ok"),
  timestamp: TimestampSchema,
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

export const DashboardSummaryResponseSchema = createApiSuccessResponseSchema(
  DashboardSummarySchema,
);

export const HealthResponseSchema =
  createApiSuccessResponseSchema(HealthDataSchema);

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
