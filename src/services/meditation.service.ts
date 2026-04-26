import prisma from '../models/prisma';
import { dateKeyUTC, parseLocalDate } from '../utils/date.utils';
import { HttpError } from '../utils/http-error';

const DAILY_GOAL_MIN = 10;

export async function listSounds() {
  const sounds = await prisma.meditationSound.findMany({
    where: { active: true },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      url: true,
      fileSizeMB: true,
      durationSec: true,
    },
  });

  return { items: sounds };
}

export async function createSession(
  userId: string,
  input: {
    soundId?: unknown;
    targetMin?: unknown;
    actualMin?: unknown;
    startedAt?: unknown;
    completedAt?: unknown;
  }
) {
  const { soundId, targetMin, actualMin, startedAt, completedAt } = input;

  if (typeof soundId !== 'string' || !soundId) {
    throw new HttpError(400, 'soundId is required');
  }

  const target = Math.floor(Number(targetMin));
  const actual = Math.floor(Number(actualMin));
  if (!Number.isFinite(target) || target < 1 || target > 120) {
    throw new HttpError(400, 'targetMin must be 1-120');
  }
  if (!Number.isFinite(actual) || actual < 0 || actual > target + 5) {
    throw new HttpError(400, 'actualMin invalid');
  }

  const startedAtDate = startedAt ? new Date(String(startedAt)) : null;
  const completedAtDate = completedAt ? new Date(String(completedAt)) : new Date();
  if (!startedAtDate || Number.isNaN(startedAtDate.getTime())) {
    throw new HttpError(400, 'startedAt invalid');
  }
  if (Number.isNaN(completedAtDate.getTime())) {
    throw new HttpError(400, 'completedAt invalid');
  }

  const sound = await prisma.meditationSound.findUnique({ where: { id: soundId } });
  if (!sound) throw new HttpError(404, 'Sound not found');

  return prisma.meditationSession.create({
    data: {
      userId,
      soundId,
      targetMin: target,
      actualMin: actual,
      completed: actual >= target,
      startedAt: startedAtDate,
      completedAt: completedAtDate,
    },
    select: {
      id: true,
      soundId: true,
      targetMin: true,
      actualMin: true,
      completed: true,
      startedAt: true,
      completedAt: true,
    },
  });
}

export async function getToday(userId: string, localDate: unknown) {
  const date = parseLocalDate(localDate);
  if (!date) throw new HttpError(400, 'localDate (YYYY-MM-DD) is required');

  const dayEnd = new Date(date);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const sessions = await prisma.meditationSession.findMany({
    where: {
      userId,
      startedAt: { gte: date, lt: dayEnd },
    },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      soundId: true,
      targetMin: true,
      actualMin: true,
      completed: true,
      startedAt: true,
      completedAt: true,
    },
  });

  const totalMinutes = sessions.reduce((sum, session) => sum + session.actualMin, 0);

  return {
    totalMinutes,
    goalMin: DAILY_GOAL_MIN,
    isFirstTime: sessions.length === 0,
    sessions,
  };
}

export async function getHistory(userId: string, daysValue: unknown) {
  const days = Math.min(365, Math.max(1, Math.floor(Number(daysValue) || 30)));

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const sessions = await prisma.meditationSession.findMany({
    where: { userId, startedAt: { gte: since } },
    orderBy: { startedAt: 'asc' },
    select: {
      startedAt: true,
      actualMin: true,
      completed: true,
    },
  });

  const byDate: Record<string, { minutes: number; sessions: number }> = {};
  for (const session of sessions) {
    const key = dateKeyUTC(session.startedAt);
    if (!byDate[key]) byDate[key] = { minutes: 0, sessions: 0 };
    byDate[key].minutes += session.actualMin;
    byDate[key].sessions += 1;
  }

  const items = Object.entries(byDate).map(([date, value]) => ({
    date,
    minutes: value.minutes,
    sessions: value.sessions,
  }));

  const totalMinutes = sessions.reduce((acc, session) => acc + session.actualMin, 0);
  const avgMinutes = items.length ? totalMinutes / items.length : 0;

  return {
    items,
    totalMinutes,
    avgMinutes: Math.round(avgMinutes * 10) / 10,
    daysTracked: items.length,
  };
}
