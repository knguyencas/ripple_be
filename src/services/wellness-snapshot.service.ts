import prisma from '../models/prisma';

export type SeverityBand = 'minimal' | 'mild' | 'moderate' | 'mod_severe' | 'severe' | 'unknown';
export type WellnessLevel = 'low' | 'moderate' | 'high';
export type WellnessTrend = 'improving' | 'stable' | 'declining' | 'insufficient';

export interface WellnessSnapshot {
  today: {
    journal: {
      logs: number;
      avgPhq: number | null;
      level: WellnessLevel | null;
      dominantEmotion: SeverityBand;
    };
    chat: {
      messages: number;
      alertScore: number | null;
      level: WellnessLevel | null;
    };
  };
  recent7Logs: {
    avgPhq: number | null;
    maxPhq: number | null;
    elevatedCount: number;
    daysCovered: number;
    trend: WellnessTrend;
    severityBand: SeverityBand;
  };
  recentChat7d: {
    avgScore: number | null;
    elevatedDays: number;
    trend: WellnessTrend;
  };
  lifetime: {
    avgJournalPhq: number;
    totalJournalDays: number;
    avgChatScore: number;
    totalChatDays: number;
    firstLogDate: Date | null;
  };
  combinedLevel: WellnessLevel;
  combinedBand: SeverityBand;
  hasRecentIdeation: boolean;
  lifestyle: {
    avgSleepHours: number | null;
    avgSteps: number | null;
    daysCounted: number;
  };
}

const IDEATION_TERMS = [
  'muốn chết', 'muốn biến mất', 'tự tử', 'tự sát',
  'không muốn sống', 'chẳng ai cần', 'thà chết',
];

function bandFromPhq(phq: number | null): SeverityBand {
  if (phq == null) return 'unknown';
  if (phq < 5) return 'minimal';
  if (phq < 10) return 'mild';
  if (phq < 15) return 'moderate';
  if (phq < 20) return 'mod_severe';
  return 'severe';
}

function levelFromPhq(phq: number | null): WellnessLevel | null {
  if (phq == null) return null;
  if (phq >= 15) return 'high';
  if (phq >= 10) return 'moderate';
  return 'low';
}

function levelFromChatScore(score: number | null): WellnessLevel | null {
  if (score == null) return null;
  if (score >= 0.7) return 'high';
  if (score >= 0.35) return 'moderate';
  return 'low';
}

function trendFromPhq(valuesAsc: number[]): WellnessTrend {
  if (valuesAsc.length < 3) return 'insufficient';
  const half = Math.floor(valuesAsc.length / 2);
  const earlier = valuesAsc.slice(0, half);
  const later = valuesAsc.slice(-half);
  const ea = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const la = later.reduce((a, b) => a + b, 0) / later.length;
  const delta = la - ea;
  if (delta < -1.5) return 'improving';
  if (delta > 1.5) return 'declining';
  return 'stable';
}

function trendFromChat(valuesAsc: number[]): WellnessTrend {
  if (valuesAsc.length < 3) return 'insufficient';
  const half = Math.floor(valuesAsc.length / 2);
  const earlier = valuesAsc.slice(0, half);
  const later = valuesAsc.slice(-half);
  const ea = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const la = later.reduce((a, b) => a + b, 0) / later.length;
  const delta = la - ea;
  if (delta < -0.05) return 'improving';
  if (delta > 0.05) return 'declining';
  return 'stable';
}

function maxLevel(a: WellnessLevel | null, b: WellnessLevel | null): WellnessLevel {
  const rank: Record<WellnessLevel, number> = { low: 0, moderate: 1, high: 2 };
  const ra = a ? rank[a] : -1;
  const rb = b ? rank[b] : -1;
  const m = Math.max(ra, rb, 0);
  if (m === 2) return 'high';
  if (m === 1) return 'moderate';
  return 'low';
}

export async function buildWellnessSnapshot(userId: string): Promise<WellnessSnapshot> {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowUtc = new Date(todayUtc.getTime() + 86400000);
  const sevenDaysAgo = new Date(todayUtc);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

  const [
    user,
    todayJournal,
    todayChat,
    last7Logs,
    last7ChatDays,
    sleepWk,
    stepsWk,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        lifetimeJournalScore: true,
        totalJournalDays: true,
        firstLogDate: true,
        lifetimeChatScore: true,
        totalChatDays: true,
      },
    }),
    prisma.journalDailyInsight.findUnique({
      where: { userId_date: { userId, date: todayUtc } },
    }),
    prisma.chatInsight.findUnique({
      where: { userId_date: { userId, date: todayUtc } },
    }),
    // 7 logs gần nhất có PHQ score (đã được NLP phân tích)
    prisma.personalLog.findMany({
      where: { userId, nlpScore: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 7,
      select: { nlpScore: true, alertLevel: true, createdAt: true, nlpEmotion: true },
    }),
    prisma.chatInsight.findMany({
      where: { userId, date: { gte: sevenDaysAgo, lt: tomorrowUtc } },
      orderBy: { date: 'asc' },
      select: { date: true, alertScore: true, alertLevel: true, keywords: true },
    }),
    prisma.sleepSession.findMany({
      where: { userId, wakeTime: { gte: sevenDaysAgo } },
      select: { duration: true, wakeTime: true },
    }),
    prisma.stepCount.findMany({
      where: { userId, date: { gte: sevenDaysAgo } },
      select: { steps: true },
    }),
  ]);

  // recent7Logs — sort ascending for trend
  const last7Asc = [...last7Logs].reverse();
  const phqVals = last7Asc.map((l) => l.nlpScore).filter((v): v is number => v != null);
  const avgPhq7 = phqVals.length ? phqVals.reduce((a, b) => a + b, 0) / phqVals.length : null;
  const maxPhq7 = phqVals.length ? Math.max(...phqVals) : null;
  const elevatedCount = last7Logs.filter(
    (l) => l.alertLevel === 'moderate' || l.alertLevel === 'high'
  ).length;
  const journalTrend = trendFromPhq(phqVals);

  const chatScores = last7ChatDays.map((c) => c.alertScore);
  const avgChat7 = chatScores.length ? chatScores.reduce((a, b) => a + b, 0) / chatScores.length : null;
  const elevatedChatDays = last7ChatDays.filter(
    (c) => c.alertLevel === 'moderate' || c.alertLevel === 'high'
  ).length;
  const chatTrend = trendFromChat(chatScores);

  const hasRecentIdeation =
    last7ChatDays.some((c) =>
      c.keywords?.some((k) => IDEATION_TERMS.some((t) => k.includes(t)))
    ) || last7Logs.some((l) => l.alertLevel === 'high');

  const sleepByDay = new Map<string, number>();
  for (const s of sleepWk) {
    const k = s.wakeTime.toISOString().slice(0, 10);
    sleepByDay.set(k, (sleepByDay.get(k) ?? 0) + s.duration);
  }
  const sleepDays = [...sleepByDay.values()];
  const avgSleepMin = sleepDays.length
    ? sleepDays.reduce((a, b) => a + b, 0) / sleepDays.length
    : null;
  const avgSteps = stepsWk.length
    ? stepsWk.reduce((a, r) => a + r.steps, 0) / stepsWk.length
    : null;

  const todayJournalLevel = levelFromPhq(todayJournal?.avgPhqScore ?? null);
  const todayChatLevel = levelFromChatScore(todayChat?.alertScore ?? null);
  const recent7Level = levelFromPhq(avgPhq7);
  const recentChatLevel = levelFromChatScore(avgChat7);

  const combinedLevel = maxLevel(
    maxLevel(todayJournalLevel, todayChatLevel),
    maxLevel(recent7Level, recentChatLevel)
  );

  return {
    today: {
      journal: {
        logs: todayJournal?.logCount ?? 0,
        avgPhq: todayJournal?.avgPhqScore ?? null,
        level: todayJournalLevel,
        dominantEmotion:
          (todayJournal?.dominantEmotion as SeverityBand | undefined) ??
          bandFromPhq(todayJournal?.avgPhqScore ?? null),
      },
      chat: {
        messages: todayChat?.messageCount ?? 0,
        alertScore: todayChat?.alertScore ?? null,
        level: todayChatLevel,
      },
    },
    recent7Logs: {
      avgPhq: avgPhq7,
      maxPhq: maxPhq7,
      elevatedCount,
      daysCovered: last7Logs.length,
      trend: journalTrend,
      severityBand: bandFromPhq(avgPhq7),
    },
    recentChat7d: {
      avgScore: avgChat7,
      elevatedDays: elevatedChatDays,
      trend: chatTrend,
    },
    lifetime: {
      avgJournalPhq: user?.lifetimeJournalScore ?? 0,
      totalJournalDays: user?.totalJournalDays ?? 0,
      avgChatScore: user?.lifetimeChatScore ?? 0,
      totalChatDays: user?.totalChatDays ?? 0,
      firstLogDate: user?.firstLogDate ?? null,
    },
    combinedLevel,
    combinedBand: bandFromPhq(avgPhq7),
    hasRecentIdeation,
    lifestyle: {
      avgSleepHours: avgSleepMin != null ? Math.round((avgSleepMin / 60) * 10) / 10 : null,
      avgSteps: avgSteps != null ? Math.round(avgSteps) : null,
      daysCounted: Math.max(sleepDays.length, stepsWk.length),
    },
  };
}
