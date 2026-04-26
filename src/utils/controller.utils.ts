import { Response } from 'express';
import { errorResponse, isHttpError } from './http-error';

export function sendControllerError(
  res: Response,
  error: unknown,
  label: string,
  fallback: string
) {
  if (!isHttpError(error)) console.error(`${label} error:`, error);
  const { status, message } = errorResponse(error, fallback);
  return res.status(status).json({ error: message });
}
