import prisma from '../models/prisma';
import { parseLocalDate } from '../utils/date.utils';
import { HttpError } from '../utils/http-error';

export async function getWaterToday(userId: string, localDate: unknown) {
  const date = parseLocalDate(localDate);
  if (!date) throw new HttpError(400, 'localDate (YYYY-MM-DD) is required');

  const row = await prisma.waterIntake.findUnique({
    where: { userId_date: { userId, date } },
  });

  return {
    glasses: row?.glasses ?? 0,
    goal: row?.goal ?? 8,
  };
}

export async function setWaterToday(
  userId: string,
  input: { localDate?: unknown; glasses?: unknown; goal?: unknown }
) {
  const date = parseLocalDate(input.localDate);
  if (!date) throw new HttpError(400, 'localDate (YYYY-MM-DD) is required');

  const glassesNum = Math.max(0, Math.floor(Number(input.glasses ?? 0)));
  const goalNum = input.goal != null ? Math.max(1, Math.floor(Number(input.goal))) : undefined;

  const row = await prisma.waterIntake.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      glasses: glassesNum,
      ...(goalNum ? { goal: goalNum } : {}),
    },
    update: {
      glasses: glassesNum,
      ...(goalNum ? { goal: goalNum } : {}),
    },
  });

  return { glasses: row.glasses, goal: row.goal };
}

export async function getWaterHistory(userId: string, daysValue: unknown) {
  const days = Math.min(365, Math.max(1, Math.floor(Number(daysValue) || 30)));

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const rows = await prisma.waterIntake.findMany({
    where: { userId, date: { gte: since } },
    orderBy: { date: 'asc' },
  });

  const items = rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    glasses: row.glasses,
    goal: row.goal,
  }));

  const totalGlasses = items.reduce((acc, row) => acc + row.glasses, 0);
  const avgGlasses = items.length ? totalGlasses / items.length : 0;

  return {
    items,
    avgGlasses: Math.round(avgGlasses * 10) / 10,
    totalGlasses,
    daysTracked: items.length,
  };
}
