import { Elysia } from "elysia";
import {
  AuthorizationHeadersSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  SessionResponseSchema,
  success,
} from "@atlas-kb/schema";
import { login, requireAuthenticatedSession } from "../auth";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .post(
    "/login",
    async ({ body }) => {
      return success(await login(body));
    },
    {
      body: LoginRequestSchema,
      response: LoginResponseSchema,
    },
  )
  .get(
    "/me",
    async ({ headers }) => {
      return success(await requireAuthenticatedSession(headers.authorization));
    },
    {
      headers: AuthorizationHeadersSchema,
      response: SessionResponseSchema,
    },
  );
