import { failure } from "@atlas-kb/schema";
import { validateKnowledgeStorageConfig } from "@atlas-kb/mastra/knowledge";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { isApiHttpError } from "@atlas-kb/errors";
import { authRoutes } from "./routes/auth";
import { chatRoutes } from "./routes/chat";
import { getAllowedWebOrigins } from "./env";
import { dashboardRoutes } from "./routes/dashboard";
import { healthRoutes } from "./routes/health";
import { knowledgeRoutes } from "./routes/knowledge";

export function createApp() {
  validateKnowledgeStorageConfig();

  return new Elysia()
    .onError(({ code, error, set }) => {
      const normalizedError = error as unknown;

      if (isApiHttpError(normalizedError)) {
        set.status = normalizedError.statusCode;
        return failure(normalizedError.code, normalizedError.message);
      }

      if (code === "VALIDATION") {
        set.status = 400;
        return failure(
          "VALIDATION_ERROR",
          normalizedError instanceof Error &&
            normalizedError.message.trim().length > 0
            ? normalizedError.message
            : "Validation error",
        );
      }

      if (code === "NOT_FOUND") {
        set.status = 404;
        return failure("NOT_FOUND", "Route not found");
      }

      console.error(error);
      set.status = 500;
      return failure("INTERNAL_SERVER_ERROR", "Internal server error");
    })
    .use(
      cors({
        origin: getAllowedWebOrigins(),
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Authorization", "Content-Type"],
      }),
    )
    .use(authRoutes)
    .use(chatRoutes)
    .use(dashboardRoutes)
    .use(healthRoutes)
    .use(knowledgeRoutes);
}

export type App = ReturnType<typeof createApp>;
