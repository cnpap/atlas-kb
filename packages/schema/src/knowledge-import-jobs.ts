import { z } from "zod/v4";
import { createApiSuccessResponseSchema } from "./api";
import { KnowledgeSourceStatusSchema } from "./knowledge-library";

export const KnowledgeImportJobProcessResultSchema = z.object({
  processed: z.boolean(),
  jobId: z.string().trim().min(1).optional(),
  sourceId: z.string().trim().min(1).optional(),
  sourceStatus: KnowledgeSourceStatusSchema.optional(),
});

export const KnowledgeImportJobProcessResponseSchema =
  createApiSuccessResponseSchema(
    z.object({
      result: KnowledgeImportJobProcessResultSchema,
    }),
  );

export type KnowledgeImportJobProcessResult = z.infer<
  typeof KnowledgeImportJobProcessResultSchema
>;
