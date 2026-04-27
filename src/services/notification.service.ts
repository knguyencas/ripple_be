import prisma from '../models/prisma';
import { Prisma } from '@prisma/client';
import { HttpError } from '../utils/http-error';

export interface CreateNotificationInput {
  type: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function listNotifications(userId: string, limitValue?: unknown) {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(Number(limitValue) || DEFAULT_LIMIT))
  );

  const items = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      data: true,
      readAt: true,
      createdAt: true,
    },
  });

  const unreadCount = await prisma.notification.count({
    where: { userId, readAt: null },
  });

  return { items, unreadCount };
}

export async function createNotification(
  userId: string,
  input: CreateNotificationInput
) {
  const type = input.type.trim();
  const title = input.title.trim();
  const body = input.body.trim();

  if (!type) throw new HttpError(400, 'type is required');
  if (!title) throw new HttpError(400, 'title is required');
  if (!body) throw new HttpError(400, 'body is required');

  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      data: input.data,
    },
  });
}

export async function markNotificationRead(userId: string, id: string) {
  const notification = await prisma.notification.findFirst({
    where: { id, userId },
    select: { id: true, readAt: true },
  });

  if (!notification) throw new HttpError(404, 'Notification not found');

  if (!notification.readAt) {
    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  return { ok: true };
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  return { ok: true };
}
