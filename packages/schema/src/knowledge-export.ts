import { z } from "zod/v4";
import { createApiSuccessResponseSchema } from "./api";
import { ChatCitationSchema } from "./knowledge-chat";
import { TimestampSchema } from "./utils";

export const KnowledgeTemplateIdParamsSchema = z.object({
  templateId: z.string().trim().min(1),
});

export const KnowledgeExportTaskIdParamsSchema = z.object({
  taskId: z.string().trim().min(1),
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
});

export const KnowledgeTemplateLibrarySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  storagePrefix: z.string().trim().min(1),
  fileCount: z.number().int().nonnegative(),
  files: z
    .array(
      z.object({
        sourcePath: z.string().trim().min(1),
        sourceFilename: z.string().trim().min(1),
        mimeType: z.string().trim().min(1).optional(),
        byteSize: z.number().int().nonnegative().optional(),
      }),
    )
    .optional()
    .default([]),
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
  sourceFilename: z.string().trim().min(1),
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
  parameters: z.record(z.string(), z.string()),
  citations: z.array(ChatCitationSchema),
});

export const KnowledgeExportTaskDetailSchema = KnowledgeExportTaskSchema.extend(
  {
    template: KnowledgeTemplateDetailSchema,
    parameters: KnowledgeExportTaskParametersSchema,
    canEdit: z.boolean(),
  },
);

export const KnowledgeTemplatesResponseSchema = createApiSuccessResponseSchema(
  z.object({
    templates: z.array(KnowledgeTemplateSummarySchema),
  }),
);

export const KnowledgeTemplateResponseSchema = createApiSuccessResponseSchema(
  z.object({
    template: KnowledgeTemplateDetailSchema,
  }),
);

export const KnowledgeExportTasksResponseSchema =
  createApiSuccessResponseSchema(
    z.object({
      tasks: z.array(KnowledgeExportTaskSchema),
    }),
  );

export const KnowledgeExportTaskResponseSchema = createApiSuccessResponseSchema(
  z.object({
    task: KnowledgeExportTaskSchema,
  }),
);

export const KnowledgeExportTaskDetailResponseSchema =
  createApiSuccessResponseSchema(
    z.object({
      task: KnowledgeExportTaskDetailSchema,
    }),
  );

export const KnowledgeExportTaskGenerateResponseSchema =
  createApiSuccessResponseSchema(
    z.object({
      result: KnowledgeExportTaskGenerateResultSchema,
    }),
  );

export function buildKnowledgeTemplateExportStructuredOutputSchema(
  fields: KnowledgeTemplateField[],
) {
  const shape: Record<string, z.ZodString> = {};

  for (const field of fields) {
    const descriptionParts = [
      `字段名：${field.name}。`,
      `字段标签：${field.label}。`,
    ];

    if (field.description) {
      descriptionParts.push(`字段说明：${field.description}。`);
    }

    descriptionParts.push("必须返回字符串；无法确认时返回空字符串。");

    shape[field.name] = z.string().describe(descriptionParts.join(""));
  }

  return z.object(shape);
}

export type KnowledgeTemplateSummary = z.infer<
  typeof KnowledgeTemplateSummarySchema
>;
export type KnowledgeTemplateField = z.infer<
  typeof KnowledgeTemplateFieldSchema
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
export type KnowledgeExportTask = z.infer<typeof KnowledgeExportTaskSchema>;
export type KnowledgeExportTaskDetail = z.infer<
  typeof KnowledgeExportTaskDetailSchema
>;
export type KnowledgeExportTasksQuery = z.infer<
  typeof KnowledgeExportTasksQuerySchema
>;
export type KnowledgeExportTaskCreateRequest = z.infer<
  typeof KnowledgeExportTaskCreateRequestSchema
>;
export type KnowledgeExportTaskUpdateRequest = z.infer<
  typeof KnowledgeExportTaskUpdateRequestSchema
>;
export type KnowledgeExportTaskGenerateResult = z.infer<
  typeof KnowledgeExportTaskGenerateResultSchema
>;
