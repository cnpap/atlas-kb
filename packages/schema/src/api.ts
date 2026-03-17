import { z } from "zod/v4";

export const ApiErrorDetailSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
});

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: ApiErrorDetailSchema,
});

export function createApiSuccessResponseSchema<T extends z.ZodType>(
  dataSchema: T,
) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}

export function success<T>(data: T) {
  return {
    success: true as const,
    data,
  };
}

export function failure(code: string, message: string) {
  return {
    success: false as const,
    error: {
      code,
      message,
    },
  };
}

export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
