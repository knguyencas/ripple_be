import prisma from '../models/prisma';
import { HttpError } from '../utils/http-error';

export async function submitFeedback(
  userId: string,
  input: { rating?: unknown; message?: unknown }
) {
  const { rating, message } = input;

  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    throw new HttpError(400, 'rating phải từ 1-5');
  }
  if (typeof message !== 'string' || !message.trim()) {
    throw new HttpError(400, 'message không được để trống');
  }
  if (message.length > 2000) {
    throw new HttpError(400, 'message tối đa 2000 ký tự');
  }

  await prisma.feedback.create({
    data: { userId, rating, message: message.trim() },
  });

  return { ok: true };
}
