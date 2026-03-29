import { z } from "zod/v4";
import { createApiSuccessResponseSchema } from "./api";

const TimestampSchema = z.iso.datetime();

export const AuthUserSchema = z.object({
  id: z.string().trim().min(1),
  username: z.string().trim().min(1).max(64),
});

export const AuthorizationHeadersSchema = z.object({
  authorization: z.string().trim().min(1),
});

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1),
});

export const SessionSchema = z.object({
  user: AuthUserSchema,
  expiresAt: TimestampSchema,
});

export const LoginResultSchema = SessionSchema.extend({
  token: z.string().trim().min(1),
});

export const LoginResponseSchema =
  createApiSuccessResponseSchema(LoginResultSchema);
export const SessionResponseSchema =
  createApiSuccessResponseSchema(SessionSchema);

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type LoginResult = z.infer<typeof LoginResultSchema>;
