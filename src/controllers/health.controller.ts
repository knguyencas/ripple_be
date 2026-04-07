import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  userId?: string;
}

function toDateOnly(d: string | Date): Date {
  const dt = typeof d === 'string' ? new Date(d) : new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

// POST /api/health/steps
export const saveSteps = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { date, steps } = req.body;

    if (!date || steps === undefined) {
      return res.status(400).json({ error: 'date and steps are required' });
    }
    if (typeof steps !== 'number' || steps < 0) {
      return res.status(400).json({ error: 'steps must be a non-negative number' });
    }

    const dateOnly = toDateOnly(date);

    const record = await prisma.stepCount.upsert({
      where: { userId_date: { userId, date: dateOnly } },
      update: { steps },
      create: { userId, date: dateOnly, steps },
    });

    return res.status(201).json(record);
  } catch (error) {
    console.error('saveSteps error:', error);
    return res.status(500).json({ error: 'Failed to save steps' });
  }
};

// POST /api/health/sleep
export const saveSleep = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { bedtime, wakeTime, duration } = req.body;

    if (!bedtime || !wakeTime || duration === undefined) {
      return res.status(400).json({ error: 'bedtime, wakeTime, and duration are required' });
    }
    if (typeof duration !== 'number' || duration < 0) {
      return res.status(400).json({ error: 'duration must be a non-negative number (minutes)' });
    }

    const session = await prisma.sleepSession.create({
      data: {
        userId,
        bedtime:  new Date(bedtime),
        wakeTime: new Date(wakeTime),
        duration,
      },
    });

    return res.status(201).json(session);
  } catch (error) {
    console.error('saveSleep error:', error);
    return res.status(500).json({ error: 'Failed to save sleep session' });
  }
};

// GET /api/health/summary
export const getSummary = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const days = Math.min(Math.max(parseInt((req.query['days'] as string) || '7', 10), 1), 90);

    const today = toDateOnly(new Date());
    const from  = new Date(today);
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
      const date    = new Date(from);
      date.setUTCDate(from.getUTCDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const stepRecord = stepRecords.find(
        (s) => s.date.toISOString().split('T')[0] === dateStr
      );

      const daySleepSessions  = sleepRecords.filter(
        (s) => s.wakeTime.toISOString().split('T')[0] === dateStr
      );
      const totalSleepMinutes = daySleepSessions.reduce(
        (sum: number, s: typeof sleepRecords[0]) => sum + s.duration, 0
      );

      return {
        date:          dateStr,
        steps:         stepRecord?.steps ?? null,
        sleepMinutes:  daySleepSessions.length > 0 ? totalSleepMinutes : null,
        sleepSessions: daySleepSessions.length,
      };
    });

    const stepsWithData = dailyData.filter(d => d.steps !== null);
    const sleepWithData = dailyData.filter(d => d.sleepMinutes !== null);

    return res.json({
      days,
      dailyData,
      averages: {
        steps: stepsWithData.length > 0
          ? Math.round(stepsWithData.reduce((s, d) => s + (d.steps ?? 0), 0) / stepsWithData.length)
          : null,
        sleepMinutes: sleepWithData.length > 0
          ? Math.round(sleepWithData.reduce((s, d) => s + (d.sleepMinutes ?? 0), 0) / sleepWithData.length)
          : null,
      },
    });
  } catch (error) {
    console.error('getSummary error:', error);
    return res.status(500).json({ error: 'Failed to get health summary' });
  }
};

// GET /api/health/today
export const getToday = async (req: AuthRequest, res: Response) => {
  try {
    const userId     = req.userId!;
    const todayStart = toDateOnly(new Date());
    const todayEnd   = new Date(todayStart.getTime() + 86400000);

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

    return res.json({
      date:  todayStart.toISOString().split('T')[0],
      steps: stepRecord?.steps ?? null,
      sleep: {
        sessions:     sleepSessions,
        totalMinutes: sleepSessions.reduce((sum: number, s: typeof sleepSessions[0]) => sum + s.duration, 0),
      },
    });
  } catch (error) {
    console.error('getToday error:', error);
    return res.status(500).json({ error: 'Failed to get today health data' });
  }
};
