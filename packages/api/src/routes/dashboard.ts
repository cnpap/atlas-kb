import { getDashboardSummary } from "@atlas-kb/mastra/knowledge";
import { DashboardSummaryResponseSchema, success } from "@atlas-kb/schema";
import { Elysia } from "elysia";

export const dashboardRoutes = new Elysia({ prefix: "/api/dashboard" }).get(
  "/summary",
  async () => {
    return success(await getDashboardSummary());
  },
  {
    response: DashboardSummaryResponseSchema,
  },
);
