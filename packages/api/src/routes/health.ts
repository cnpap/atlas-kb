import { success, HealthResponseSchema } from "@atlas-kb/schema";
import { Elysia } from "elysia";

export const healthRoutes = new Elysia({ prefix: "/api" }).get(
  "/health",
  () => {
    return success({
      status: "ok" as const,
      timestamp: new Date().toISOString(),
    });
  },
  {
    response: HealthResponseSchema,
  },
);
