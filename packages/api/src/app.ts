import { failure } from "@atlas-kb/schema";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { isApiHttpError } from "@atlas-kb/errors";
import { healthRoutes } from "./routes/health";
import { knowledgeRoutes } from "./routes/knowledge";

export function createApp() {
  return new Elysia()
    .onError(({ code, error, set }) => {
      const normalizedError = error as unknown;

      if (isApiHttpError(normalizedError)) {
        set.status = normalizedError.statusCode;
        return failure(normalizedError.code, normalizedError.message);
      }

      if (code === "VALIDATION") {
        set.status = 400;
        return failure("VALIDATION_ERROR", "Request validation failed");
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
        origin: [/^https?:\/\/localhost:\d+$/, /^https?:\/\/127\.0\.0\.1:\d+$/],
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type"],
      }),
    )
    .use(healthRoutes)
    .use(knowledgeRoutes);
}

export type App = ReturnType<typeof createApp>;
