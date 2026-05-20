import prisma from '../models/prisma';
import { isLocalDate } from '../utils/date.utils';
import { HttpError } from '../utils/http-error';
import { calculateStreakFromDates, type StreakSnapshot } from '../utils/streak.utils';
import { createNotification } from './notification.service';

const STREAK_MILESTONES = new Set([3, 7, 14, 30, 60, 100]);

function sameStoredDate(a: Date | null, b: Date | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

export async function calculateCurrentStreak(
  userId: string,
  referenceDate = new Date()
): Promise<StreakSnapshot> {
  const logs = await prisma.personalLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  return calculateStreakFromDates(
    logs.map((log) => log.createdAt),
    referenceDate
  );
}

async function maybeCreateMilestoneNotification(
  userId: string,
  previousStreak: number,
  currentStreak: number
) {
  if (currentStreak === previousStreak || !STREAK_MILESTONES.has(currentStreak)) return;

  const title = `Chuỗi ${currentStreak} ngày`;
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: 'streak_milestone',
      title,
    },
    select: { id: true },
  });

  if (existing) return;

  await createNotification(userId, {
    type: 'streak_milestone',
    title,
    body: `Bạn đã ghi journal ${currentStreak} ngày liên tục. Giữ nhịp nhẹ nhàng này nhé.`,
    data: { streak: currentStreak },
  });
}

async function syncUserStreak(
  userId: string,
  options: { notifyMilestone?: boolean } = {}
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streak: true, lastLogDate: true },
  });
  if (!user) throw new HttpError(404, 'User not found');

  const snapshot = await calculateCurrentStreak(userId);

  if (
    user.streak !== snapshot.currentStreak ||
    !sameStoredDate(user.lastLogDate, snapshot.lastLogDate)
  ) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        streak: snapshot.currentStreak,
        lastLogDate: snapshot.lastLogDate,
      },
    });
  }

  if (options.notifyMilestone) {
    await maybeCreateMilestoneNotification(userId, user.streak, snapshot.currentStreak);
  }

  return snapshot;
}

export async function touchLogStreak(userId: string): Promise<void> {
  await syncUserStreak(userId, { notifyMilestone: true });
}

export async function pingUserStreak(userId: string, localDate: unknown) {
  if (!isLocalDate(localDate)) {
    throw new HttpError(400, 'localDate (YYYY-MM-DD) is required');
  }

  const snapshot = await syncUserStreak(userId);

  return {
    currentStreak: snapshot.currentStreak,
    lastStreakDate: snapshot.lastLogDate ? snapshot.lastLogDate.toISOString().slice(0, 10) : null,
  };
}

export async function getUserStreak(userId: string) {
  const snapshot = await syncUserStreak(userId);

  return {
    currentStreak: snapshot.currentStreak,
    lastStreakDate: snapshot.lastLogDate ? snapshot.lastLogDate.toISOString().slice(0, 10) : null,
  };
}
