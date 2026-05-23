import prisma from '../models/prisma';
import { cloudinary } from '../middlewares/upload.middleware';
import { analyzeText, mapAlertLevel } from './nlp.service';
import { getUserStreak, touchLogStreak } from './streak.service';
import { upsertJournalDailyInsight } from './journal-insight.service';
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

function triggerLogNlpAnalysis(
  logId: string,
  userId: string,
  note?: string | null,
  logDate: Date = new Date()
) {
  // Fix B: nếu note quá ngắn/rỗng → CLEAR nlpScore cũ để tránh stale.
  // Trước đây chỉ aggregate JDI với nlpScore cũ → JDI sai khi user xoá hết note.
  if (!note || note.trim().length < 5) {
    // updateMany: silent skip nếu log đã bị xoá trong lúc fire-and-forget chạy
    void prisma.personalLog
      .updateMany({
        where: { id: logId },
        data: { nlpScore: null, nlpEmotion: null, alertLevel: null },
      })
      .then(() => upsertJournalDailyInsight(userId, logDate))
      .catch((e) =>
        console.error('clear stale nlp / aggregate failed:', e)
      );
    return;
  }

  void analyzeText(note, userId)
    .then(async (nlp) => {
      if (!nlp) {
        await upsertJournalDailyInsight(userId, logDate);
        return;
      }
      // updateMany: silent skip nếu log đã bị xoá trong lúc NLP đang chạy
      const updated = await prisma.personalLog.updateMany({
        where: { id: logId },
        data: {
          nlpScore: nlp.phq_score,
          nlpEmotion: nlp.severity,
          alertLevel: mapAlertLevel(nlp),
        },
      });
      if (updated.count === 0) return; // log bị xoá → bỏ qua aggregate

      if (nlp.risk_flag) {
        console.warn(`[RISK] userId=${userId} | severity=${nlp.severity} | c9=${nlp.c9_ideation}`);
      }

      // Sau khi PersonalLog đã có nlpScore → recompute aggregate day + lifetime
      await upsertJournalDailyInsight(userId, logDate);
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

  // Fix A: enforce 1-log/day ở BE (FE đã enforce qua useTodayJournal, nhưng
  // BE cần chống race condition / FE bug / direct API call).
  // Dùng local day boundary để khớp với getTodayLog (user-facing "today").
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const existingToday = await prisma.personalLog.findFirst({
    where: { userId, createdAt: { gte: todayStart, lte: todayEnd } },
    select: { id: true },
  });
  if (existingToday) {
    throw new HttpError(
      409,
      'Bạn đã có nhật ký hôm nay. Vui lòng cập nhật log cũ thay vì tạo mới.'
    );
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
  triggerLogNlpAnalysis(log.id, userId, note, log.createdAt);

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
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 29);

  const [logs, totalLogs, streak, dailyInsights, userRow] = await Promise.all([
    prisma.personalLog.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { moodScore: true, createdAt: true },
    }),
    prisma.personalLog.count({ where: { userId } }),
    getUserStreak(userId),
    prisma.journalDailyInsight.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { date: true, avgPhqScore: true, logCount: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { lifetimeJournalScore: true, totalJournalDays: true },
    }),
  ]);

  if (logs.length === 0 && dailyInsights.length === 0) {
    return {
      totalLogs: 0,
      avgMood: 0,
      avgPhq: null,
      lifetimePhq: userRow?.lifetimeJournalScore ?? 0,
      streak: streak.currentStreak,
      weeklyData: [],
    };
  }

  const avgMood = logs.length
    ? logs.reduce((sum, log) => sum + log.moodScore, 0) / logs.length
    : 0;

  const scoredDays = dailyInsights.filter((d) => d.avgPhqScore != null);
  const totalLogsScored = scoredDays.reduce((s, d) => s + d.logCount, 0);
  const avgPhq = totalLogsScored
    ? scoredDays.reduce((s, d) => s + (d.avgPhqScore ?? 0) * d.logCount, 0) / totalLogsScored
    : null;

  const phqByDate = new Map<string, number | null>();
  for (const d of dailyInsights) {
    phqByDate.set(d.date.toISOString().slice(0, 10), d.avgPhqScore);
  }

  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dayKey = date.toISOString().slice(0, 10);
    const dayLogs = logs.filter(
      (log) => new Date(log.createdAt).toISOString().slice(0, 10) === dayKey
    );

    return {
      date: dayKey,
      avgMood: dayLogs.length
        ? dayLogs.reduce((sum, log) => sum + log.moodScore, 0) / dayLogs.length
        : null,
      avgPhq: phqByDate.get(dayKey) ?? null,
      count: dayLogs.length,
    };
  });

  return {
    totalLogs,
    avgMood: Math.round(avgMood * 10) / 10,
    avgPhq: avgPhq != null ? Math.round(avgPhq * 10) / 10 : null,
    lifetimePhq: userRow?.lifetimeJournalScore
      ? Math.round(userRow.lifetimeJournalScore * 10) / 10
      : 0,
    totalJournalDays: userRow?.totalJournalDays ?? 0,
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

  // Fix C: chỉ re-run NLP khi note THẬT SỰ đổi (tiết kiệm Groq/HF compute).
  // - Note đổi → triggerLogNlpAnalysis (re-NLP + clear-stale nếu rỗng + recompute JDI).
  // - Note không đổi (chỉ sửa mood/factors) → bỏ qua NLP nhưng vẫn upsert JDI
  //   vì factorsHit có thể đổi.
  const noteChanged = input.note !== undefined && input.note !== existing.note;
  if (noteChanged) {
    triggerLogNlpAnalysis(id, userId, input.note, existing.createdAt);
  } else {
    void upsertJournalDailyInsight(userId, existing.createdAt).catch((e) =>
      console.error('journal aggregate (no-note-change) failed:', e)
    );
  }

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

  const deletedAt = log.createdAt;
  await prisma.personalLog.delete({ where: { id } });
  await touchLogStreak(userId);
  // Recompute aggregate cho ngày bị xoá log
  await upsertJournalDailyInsight(userId, deletedAt).catch((e) =>
    console.error('journal aggregate (delete) failed:', e)
  );
  return { success: true };
}
