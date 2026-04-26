export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function errorResponse(error: unknown, fallback: string) {
  if (isHttpError(error)) {
    return { status: error.status, message: error.message };
  }
  return { status: 500, message: fallback };
}
