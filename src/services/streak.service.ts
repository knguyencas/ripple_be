import prisma from '../models/prisma';
import { daysBetweenDateKeys, isLocalDate } from '../utils/date.utils';
import { HttpError } from '../utils/http-error';

export async function touchLogStreak(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastLog = user.lastLogDate ? new Date(user.lastLogDate) : null;
  if (lastLog) lastLog.setHours(0, 0, 0, 0);

  let newStreak = user.streak;

  if (!lastLog) {
    newStreak = 1;
  } else {
    const diffDays = Math.round((today.getTime() - lastLog.getTime()) / 86400000);
    if (diffDays === 1) newStreak += 1;
    else if (diffDays > 1) newStreak = 1;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { streak: newStreak, lastLogDate: new Date() },
  });
}

export async function pingUserStreak(userId: string, localDate: unknown) {
  if (!isLocalDate(localDate)) {
    throw new HttpError(400, 'localDate (YYYY-MM-DD) is required');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');

  const lastStr = user.lastLogDate
    ? user.lastLogDate.toISOString().slice(0, 10)
    : null;

  let streak = user.streak;
  let shouldWrite = false;

  if (!lastStr) {
    streak = 1;
    shouldWrite = true;
  } else if (lastStr !== localDate) {
    const gap = daysBetweenDateKeys(lastStr, localDate);
    if (gap === 1) {
      streak += 1;
      shouldWrite = true;
    } else if (gap > 1) {
      streak = 1;
      shouldWrite = true;
    }
  }

  if (shouldWrite) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        streak,
        lastLogDate: new Date(`${localDate}T00:00:00.000Z`),
      },
    });
  }

  return { currentStreak: streak, lastStreakDate: localDate };
}

export async function getUserStreak(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streak: true, lastLogDate: true },
  });
  if (!user) throw new HttpError(404, 'User not found');

  return {
    currentStreak: user.streak,
    lastStreakDate: user.lastLogDate ? user.lastLogDate.toISOString().slice(0, 10) : null,
  };
}
