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
