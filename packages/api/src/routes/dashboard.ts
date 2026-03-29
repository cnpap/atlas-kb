import { getDashboardSummary } from "@atlas-kb/mastra/knowledge";
import { DashboardSummaryResponseSchema, success } from "@atlas-kb/schema";
import { Elysia } from "elysia";
import { requireAuthenticatedSession } from "../auth";

export const dashboardRoutes = new Elysia({ prefix: "/api/dashboard" }).get(
  "/summary",
  async ({ headers }) => {
    const session = await requireAuthenticatedSession(headers.authorization);
    return success(await getDashboardSummary(session.user.id));
  },
  {
    response: DashboardSummaryResponseSchema,
  },
);
