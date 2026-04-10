import { Elysia } from "elysia";
import {
  ActiveWorkspaceSelectionRequestSchema,
  ActiveWorkspaceSelectionResponseSchema,
  AuthorizationHeadersSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  SessionResponseSchema,
  success,
} from "@atlas-kb/schema";
import {
  login,
  requireAuthenticatedSession,
  switchActiveWorkspace,
} from "../auth";

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
  )
  .post(
    "/active-workspace",
    async ({ body, headers }) => {
      const session = await requireAuthenticatedSession(headers.authorization);
      return success(
        await switchActiveWorkspace({
          userId: session.user.id,
          collectionId: body.collectionId,
        }),
      );
    },
    {
      body: ActiveWorkspaceSelectionRequestSchema,
      headers: AuthorizationHeadersSchema,
      response: ActiveWorkspaceSelectionResponseSchema,
    },
  );
