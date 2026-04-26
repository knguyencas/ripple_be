import prisma from '../models/prisma';
import { dateKeyUTC, toDateOnlyUTC } from '../utils/date.utils';
import { HttpError } from '../utils/http-error';

export async function saveSteps(userId: string, input: { date?: unknown; steps?: unknown }) {
  const { date, steps } = input;

  if (!date || steps === undefined) {
    throw new HttpError(400, 'date and steps are required');
  }
  if (typeof steps !== 'number' || steps < 0) {
    throw new HttpError(400, 'steps must be a non-negative number');
  }

  const dateOnly = toDateOnlyUTC(String(date));
  return prisma.stepCount.upsert({
    where: { userId_date: { userId, date: dateOnly } },
    update: { steps },
    create: { userId, date: dateOnly, steps },
  });
}

export async function saveSleep(
  userId: string,
  input: { bedtime?: unknown; wakeTime?: unknown; duration?: unknown }
) {
  const { bedtime, wakeTime, duration } = input;

  if (!bedtime || !wakeTime || duration === undefined) {
    throw new HttpError(400, 'bedtime, wakeTime, and duration are required');
  }
  if (typeof duration !== 'number' || duration < 0) {
    throw new HttpError(400, 'duration must be a non-negative number (minutes)');
  }

  return prisma.sleepSession.create({
    data: {
      userId,
      bedtime: new Date(String(bedtime)),
      wakeTime: new Date(String(wakeTime)),
      duration,
    },
  });
}

export async function getHealthSummary(userId: string, daysValue: unknown) {
  const days = Math.min(Math.max(parseInt(String(daysValue || '7'), 10), 1), 90);

  const today = toDateOnlyUTC(new Date());
  const from = new Date(today);
  from.setUTCDate(today.getUTCDate() - (days - 1));

  const [stepRecords, sleepRecords] = await Promise.all([
    prisma.stepCount.findMany({
      where: { userId, date: { gte: from, lte: today } },
      orderBy: { date: 'asc' },
    }),
    prisma.sleepSession.findMany({
      where: {
        userId,
        wakeTime: { gte: from, lte: new Date(today.getTime() + 86400000) },
      },
      orderBy: { wakeTime: 'asc' },
    }),
  ]);

  const dailyData = Array.from({ length: days }, (_, i) => {
    const date = new Date(from);
    date.setUTCDate(from.getUTCDate() + i);
    const dateStr = dateKeyUTC(date);

    const stepRecord = stepRecords.find((record) => dateKeyUTC(record.date) === dateStr);
    const daySleepSessions = sleepRecords.filter((session) => dateKeyUTC(session.wakeTime) === dateStr);
    const totalSleepMinutes = daySleepSessions.reduce((sum, session) => sum + session.duration, 0);

    return {
      date: dateStr,
      steps: stepRecord?.steps ?? null,
      sleepMinutes: daySleepSessions.length > 0 ? totalSleepMinutes : null,
      sleepSessions: daySleepSessions.length,
    };
  });

  const stepsWithData = dailyData.filter((day) => day.steps !== null);
  const sleepWithData = dailyData.filter((day) => day.sleepMinutes !== null);

  return {
    days,
    dailyData,
    averages: {
      steps: stepsWithData.length > 0
        ? Math.round(stepsWithData.reduce((sum, day) => sum + (day.steps ?? 0), 0) / stepsWithData.length)
        : null,
      sleepMinutes: sleepWithData.length > 0
        ? Math.round(sleepWithData.reduce((sum, day) => sum + (day.sleepMinutes ?? 0), 0) / sleepWithData.length)
        : null,
    },
  };
}

export async function getHealthToday(userId: string) {
  const todayStart = toDateOnlyUTC(new Date());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const [stepRecord, sleepSessions] = await Promise.all([
    prisma.stepCount.findUnique({
      where: { userId_date: { userId, date: todayStart } },
    }),
    prisma.sleepSession.findMany({
      where: {
        userId,
        wakeTime: { gte: todayStart, lt: todayEnd },
      },
      orderBy: { wakeTime: 'desc' },
    }),
  ]);

  return {
    date: dateKeyUTC(todayStart),
    steps: stepRecord?.steps ?? null,
    sleep: {
      sessions: sleepSessions,
      totalMinutes: sleepSessions.reduce((sum, session) => sum + session.duration, 0),
    },
  };
}
