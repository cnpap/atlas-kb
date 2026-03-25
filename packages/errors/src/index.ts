export class ApiHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(params: {
    message: string;
    statusCode: number;
    code: string;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = new.target.name;
    this.statusCode = params.statusCode;
    this.code = params.code;
  }
}

export class BadRequestError extends ApiHttpError {
  constructor(message = "Invalid request", cause?: unknown) {
    super({
      message,
      statusCode: 400,
      code: "BAD_REQUEST",
      cause,
    });
  }
}

export class UnauthorizedError extends ApiHttpError {
  constructor(message = "Unauthorized", cause?: unknown) {
    super({
      message,
      statusCode: 401,
      code: "UNAUTHORIZED",
      cause,
    });
  }
}

export class ForbiddenError extends ApiHttpError {
  constructor(message = "Forbidden", cause?: unknown) {
    super({
      message,
      statusCode: 403,
      code: "FORBIDDEN",
      cause,
    });
  }
}

export class ConflictError extends ApiHttpError {
  constructor(message = "Conflict", cause?: unknown) {
    super({
      message,
      statusCode: 409,
      code: "CONFLICT",
      cause,
    });
  }
}

export class UpstreamServiceError extends ApiHttpError {
  constructor(message = "Upstream service request failed", cause?: unknown) {
    super({
      message,
      statusCode: 502,
      code: "UPSTREAM_SERVICE_ERROR",
      cause,
    });
  }
}

export class ModelProviderConfigurationError extends ApiHttpError {
  constructor(
    message = "Model provider configuration is invalid",
    cause?: unknown,
  ) {
    super({
      message,
      statusCode: 500,
      code: "MODEL_PROVIDER_CONFIGURATION_ERROR",
      cause,
    });
  }
}

export class ModelProviderPermissionError extends ApiHttpError {
  constructor(
    message = "Model provider rejected the configured credentials or model",
    cause?: unknown,
  ) {
    super({
      message,
      statusCode: 500,
      code: "MODEL_PROVIDER_PERMISSION_ERROR",
      cause,
    });
  }
}

export class ModelProviderRateLimitError extends ApiHttpError {
  constructor(message = "Model provider rate limit exceeded", cause?: unknown) {
    super({
      message,
      statusCode: 503,
      code: "MODEL_PROVIDER_RATE_LIMITED",
      cause,
    });
  }
}

export class ModelProviderUnavailableError extends ApiHttpError {
  constructor(message = "Model provider is unavailable", cause?: unknown) {
    super({
      message,
      statusCode: 503,
      code: "MODEL_PROVIDER_UNAVAILABLE",
      cause,
    });
  }
}

export class NotFoundError extends ApiHttpError {
  constructor(message = "Resource not found", cause?: unknown) {
    super({
      message,
      statusCode: 404,
      code: "NOT_FOUND",
      cause,
    });
  }
}

export function isApiHttpError(error: unknown): error is ApiHttpError {
  return error instanceof ApiHttpError;
}
