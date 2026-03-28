import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  userId?: string;
}

// POST /api/logs
export const createLog = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { mood, moodScore, factors, note } = req.body;

    if (!mood || moodScore === undefined) {
      return res.status(400).json({ error: 'mood and moodScore are required' });
    }

    const log = await prisma.personalLog.create({
      data: {
        userId,
        mood,
        moodScore,
        factors: factors || [],
        note: note || null,
      },
    });

    await updateStreak(userId);

    // Save anonymous log for community stats
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const now = new Date();
      await prisma.anonymousLog.create({
        data: {
          userId,
          mood,
          moodScore,
          factors: factors || [],
          ageGroup: user.ageGroup || null,
          city: user.city || null,
          hour: now.getHours(),
          dayOfWeek: now.getDay(),
        },
      });
    }

    return res.status(201).json(log);
  } catch (error) {
    console.error('createLog error:', error);
    return res.status(500).json({ error: 'Failed to create log' });
  }
};

// GET /api/logs
export const getLogs = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { limit = '20', offset = '0' } = req.query;

    const logs = await prisma.personalLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    return res.json(logs);
  } catch (error) {
    console.error('getLogs error:', error);
    return res.status(500).json({ error: 'Failed to get logs' });
  }
};

// GET /api/logs/stats
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const logs = await prisma.personalLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    if (logs.length === 0) {
      return res.json({ totalLogs: 0, avgMood: 0, streak: 0, weeklyData: [] });
    }

    const avgMood = logs.reduce((sum, l) => sum + l.moodScore, 0) / logs.length;

    // Last 7 days data
    const weeklyData = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dayLogs = logs.filter(l => {
        const logDate = new Date(l.createdAt);
        return logDate.toDateString() === date.toDateString();
      });
      return {
        date: date.toISOString().split('T')[0],
        avgMood: dayLogs.length
          ? dayLogs.reduce((s, l) => s + l.moodScore, 0) / dayLogs.length
          : null,
        count: dayLogs.length,
      };
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });

    return res.json({
      totalLogs: logs.length,
      avgMood: Math.round(avgMood * 10) / 10,
      streak: user?.streak || 0,
      weeklyData,
    });
  } catch (error) {
    console.error('getStats error:', error);
    return res.status(500).json({ error: 'Failed to get stats' });
  }
};

// GET /api/logs/recent 
export const getRecentLogs = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const logs = await prisma.personalLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return res.json(logs);
  } catch (error) {
    console.error('getRecentLogs error:', error);
    return res.status(500).json({ error: 'Failed to get recent logs' });
  }
};

async function updateStreak(userId: string) {
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