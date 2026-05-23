import prisma from '../models/prisma';
import { toDateOnlyUTC } from '../utils/date.utils';

const LEVEL_RANK: Record<string, number> = { low: 0, moderate: 1, high: 2 };

export async function upsertJournalDailyInsight(userId: string, sourceDate: Date) {
  const day = toDateOnlyUTC(sourceDate);
  const dayEnd = new Date(day.getTime() + 86400000);

  const logs = await prisma.personalLog.findMany({
    where: { userId, createdAt: { gte: day, lt: dayEnd } },
    select: {
      nlpScore: true,
      nlpEmotion: true,
      alertLevel: true,
      factors: true,
    },
  });

  if (logs.length === 0) {
    await prisma.journalDailyInsight.deleteMany({ where: { userId, date: day } });
    await recomputeUserLifetimeJournalStats(userId);
    return;
  }

  const scored = logs.filter((l) => l.nlpScore != null);
  const avgPhq = scored.length
    ? scored.reduce((s, l) => s + (l.nlpScore ?? 0), 0) / scored.length
    : null;
  const maxPhq = scored.length ? Math.max(...scored.map((l) => l.nlpScore ?? 0)) : null;

  const levelCounts: Record<string, number> = {};
  const emotionCounts: Record<string, number> = {};
  for (const l of logs) {
    if (l.alertLevel) levelCounts[l.alertLevel] = (levelCounts[l.alertLevel] ?? 0) + 1;
    if (l.nlpEmotion) emotionCounts[l.nlpEmotion] = (emotionCounts[l.nlpEmotion] ?? 0) + 1;
  }

  const dominantLevel =
    Object.keys(levelCounts).sort((a, b) => (LEVEL_RANK[b] ?? -1) - (LEVEL_RANK[a] ?? -1))[0] ??
    null;
  const dominantEmotion =
    Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const hasIdeation = logs.some((l) => l.alertLevel === 'high');

  const factorsSet = new Set<string>();
  logs.forEach((l) => l.factors?.forEach((f) => factorsSet.add(f)));

  await prisma.journalDailyInsight.upsert({
    where: { userId_date: { userId, date: day } },
    create: {
      userId,
      date: day,
      logCount: logs.length,
      avgPhqScore: avgPhq,
      maxPhqScore: maxPhq,
      dominantLevel,
      dominantEmotion,
      hasIdeation,
      factorsHit: [...factorsSet],
    },
    update: {
      logCount: logs.length,
      avgPhqScore: avgPhq,
      maxPhqScore: maxPhq,
      dominantLevel,
      dominantEmotion,
      hasIdeation,
      factorsHit: [...factorsSet],
    },
  });

  await recomputeUserLifetimeJournalStats(userId);
}

export async function recomputeUserLifetimeJournalStats(userId: string) {
  const days = await prisma.journalDailyInsight.findMany({
    where: { userId, avgPhqScore: { not: null } },
    select: { avgPhqScore: true, date: true },
    orderBy: { date: 'asc' },
  });

  const totalDays = days.length;
  const lifetimeAvg = totalDays
    ? days.reduce((s, d) => s + (d.avgPhqScore ?? 0), 0) / totalDays
    : 0;
  const firstLogDate = days[0]?.date ?? null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      lifetimeJournalScore: lifetimeAvg,
      totalJournalDays: totalDays,
      firstLogDate,
    },
  });
}
