import { z } from "zod/v4";
import { createApiSuccessResponseSchema } from "./api";

export const AssistantRoleSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  stylePrompt: z.string().max(4_000).default(""),
  isBuiltin: z.boolean(),
  isDefault: z.boolean(),
});

const AssistantRoleInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  stylePrompt: z.string().max(4_000).default(""),
});

export const AssistantRoleIdParamsSchema = z.object({
  roleId: z.string().trim().min(1),
});

export const AssistantRoleCreateRequestSchema = AssistantRoleInputSchema;
export const AssistantRoleUpdateRequestSchema = AssistantRoleInputSchema;

export const AssistantRoleSelectionRequestSchema = z.object({
  roleId: z.string().trim().min(1),
});

export const AssistantRoleOrderRequestSchema = z.object({
  roleIds: z.array(z.string().trim().min(1)).min(1),
});

export const AssistantRolesResponseSchema = createApiSuccessResponseSchema(
  z.object({
    roles: z.array(AssistantRoleSchema),
    activeRoleId: z.string().trim().min(1),
  }),
);

export const AssistantRoleResponseSchema = createApiSuccessResponseSchema(
  z.object({
    role: AssistantRoleSchema,
  }),
);

export const AssistantRoleSelectionResponseSchema =
  createApiSuccessResponseSchema(
    z.object({
      activeRoleId: z.string().trim().min(1),
    }),
  );

export const AssistantRoleDeleteResponseSchema = createApiSuccessResponseSchema(
  z.object({
    ok: z.literal(true),
  }),
);

export const AssistantRoleOrderResponseSchema = createApiSuccessResponseSchema(
  z.object({
    ok: z.literal(true),
  }),
);

export type AssistantRole = z.infer<typeof AssistantRoleSchema>;
export type AssistantRoleCreateRequest = z.infer<
  typeof AssistantRoleCreateRequestSchema
>;
export type AssistantRoleUpdateRequest = z.infer<
  typeof AssistantRoleUpdateRequestSchema
>;
export type AssistantRoleOrderRequest = z.infer<
  typeof AssistantRoleOrderRequestSchema
>;
export type AssistantRoleSelectionRequest = z.infer<
  typeof AssistantRoleSelectionRequestSchema
>;
