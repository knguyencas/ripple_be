import prisma from '../models/prisma';
import { cloudinary } from '../middlewares/upload.middleware';
import { analyzeText, mapAlertLevel } from './nlp.service';
import { getUserStreak, touchLogStreak } from './streak.service';
import { HttpError } from '../utils/http-error';

interface CreateLogInput {
  mood?: string;
  moodScore?: number;
  factors?: string[];
  note?: string | null;
}

interface UpdateLogInput {
  mood?: string;
  moodScore?: number;
  factors?: string[];
  note?: string | null;
}

type CloudinaryResourceType = 'image' | 'video' | 'raw';

function getCloudinaryResourceType(
  resourceType: string | null | undefined,
  encrypted: boolean,
  fallback: Exclude<CloudinaryResourceType, 'raw'>
): CloudinaryResourceType {
  if (resourceType === 'image' || resourceType === 'video' || resourceType === 'raw') {
    return resourceType;
  }
  return encrypted ? 'raw' : fallback;
}

function parsePagination(limit: unknown, offset: unknown) {
  const take = Math.min(Math.max(parseInt(String(limit ?? '20'), 10) || 20, 1), 300);
  const skip = Math.max(parseInt(String(offset ?? '0'), 10) || 0, 0);
  return { take, skip };
}

function triggerLogNlpAnalysis(logId: string, userId: string, note?: string | null) {
  if (!note || note.trim().length < 5) return;

  void analyzeText(note, userId)
    .then(async (nlp) => {
      if (!nlp) return;
      await prisma.personalLog.update({
        where: { id: logId },
        data: {
          nlpScore: nlp.phq_score,
          nlpEmotion: nlp.severity,
          alertLevel: mapAlertLevel(nlp),
        },
      });

      if (nlp.risk_flag) {
        console.warn(`[RISK] userId=${userId} | severity=${nlp.severity} | c9=${nlp.c9_ideation}`);
      }
    })
    .catch((error) => console.error('log NLP analysis failed:', error));
}

async function createAnonymousLog(userId: string, input: Required<Pick<CreateLogInput, 'mood' | 'moodScore'>> & CreateLogInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const now = new Date();
  await prisma.anonymousLog.create({
    data: {
      userId,
      mood: input.mood,
      moodScore: input.moodScore,
      factors: input.factors || [],
      ageGroup: user.ageGroup || null,
      city: user.city || null,
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
    },
  });
}

export async function createLog(userId: string, input: CreateLogInput) {
  const { mood, moodScore, factors, note } = input;

  if (!mood || moodScore === undefined) {
    throw new HttpError(400, 'mood and moodScore are required');
  }
  if (typeof moodScore !== 'number') {
    throw new HttpError(400, 'moodScore must be a number');
  }

  const log = await prisma.personalLog.create({
    data: {
      userId,
      mood,
      moodScore,
      factors: Array.isArray(factors) ? factors : [],
      note: note || null,
    },
  });

  await touchLogStreak(userId);
  await createAnonymousLog(userId, { mood, moodScore, factors, note });
  triggerLogNlpAnalysis(log.id, userId, note);

  return log;
}

export async function getLogs(userId: string, limit: unknown, offset: unknown) {
  const { take, skip } = parsePagination(limit, offset);
  return prisma.personalLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    skip,
  });
}

export async function getLogStats(userId: string) {
  const [logs, totalLogs, streak] = await Promise.all([
    prisma.personalLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.personalLog.count({ where: { userId } }),
    getUserStreak(userId),
  ]);

  if (logs.length === 0) {
    return { totalLogs: 0, avgMood: 0, streak: streak.currentStreak, weeklyData: [] };
  }

  const avgMood = logs.reduce((sum, log) => sum + log.moodScore, 0) / logs.length;
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dayLogs = logs.filter((log) => {
      const logDate = new Date(log.createdAt);
      return logDate.toDateString() === date.toDateString();
    });

    return {
      date: date.toISOString().split('T')[0],
      avgMood: dayLogs.length
        ? dayLogs.reduce((sum, log) => sum + log.moodScore, 0) / dayLogs.length
        : null,
      count: dayLogs.length,
    };
  });

  return {
    totalLogs,
    avgMood: Math.round(avgMood * 10) / 10,
    streak: streak.currentStreak,
    weeklyData,
  };
}

export async function getRecentLogs(userId: string) {
  return prisma.personalLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
}

export async function getLogById(userId: string, id: string) {
  const log = await prisma.personalLog.findFirst({
    where: { id, userId },
    include: {
      audioRecordings: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          url: true,
          label: true,
          encrypted: true,
          iv: true,
          mimeType: true,
          createdAt: true,
        },
      },
      photoAttachments: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          url: true,
          order: true,
          encrypted: true,
          iv: true,
          mimeType: true,
        },
      },
    },
  });

  if (!log) throw new HttpError(404, 'Log not found');
  return log;
}

export async function updateLog(userId: string, id: string, input: UpdateLogInput) {
  const existing = await prisma.personalLog.findFirst({ where: { id, userId } });
  if (!existing) throw new HttpError(404, 'Log not found');

  const data: UpdateLogInput = {};
  if (input.mood) data.mood = input.mood;
  if (input.moodScore !== undefined) data.moodScore = input.moodScore;
  if (Array.isArray(input.factors)) data.factors = input.factors;
  if (input.note !== undefined) data.note = input.note;

  const updated = await prisma.personalLog.update({ where: { id }, data });
  triggerLogNlpAnalysis(id, userId, input.note);
  return updated;
}

export async function getTodayLog(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return prisma.personalLog.findFirst({
    where: {
      userId,
      createdAt: { gte: start, lte: end },
    },
  });
}

export async function deleteLog(userId: string, id: string) {
  const log = await prisma.personalLog.findFirst({
    where: { id, userId },
    include: {
      audioRecordings: true,
      photoAttachments: true,
    },
  });
  if (!log) throw new HttpError(404, 'Log not found');

  await Promise.allSettled([
    ...log.photoAttachments.map((photo) =>
      cloudinary.uploader.destroy(photo.publicId, {
        resource_type: getCloudinaryResourceType(photo.resourceType, photo.encrypted, 'image'),
      })
    ),
    ...log.audioRecordings.map((audio) =>
      cloudinary.uploader.destroy(audio.publicId, {
        resource_type: getCloudinaryResourceType(audio.resourceType, audio.encrypted, 'video'),
      })
    ),
  ]);

  await prisma.personalLog.delete({ where: { id } });
  await touchLogStreak(userId);
  return { success: true };
}
