import prisma from '../models/prisma';

export type ProfileClass = 'undetermined' | 'healthy_baseline' | 'at_risk_baseline';

export interface ClassModifiers {
  mildMultiplier: number;
  moderateThreshold: number;
  highThreshold: number;
}

export function getClassModifiers(cls: ProfileClass): ClassModifiers {
  switch (cls) {
    case 'healthy_baseline':
      return { mildMultiplier: 0.5, moderateThreshold: 0.45, highThreshold: 0.75 };
    case 'at_risk_baseline':
      return { mildMultiplier: 1.0, moderateThreshold: 0.35, highThreshold: 0.7 };
    case 'undetermined':
    default:
      return { mildMultiplier: 0.8, moderateThreshold: 0.40, highThreshold: 0.72 };
  }
}

const IDEATION_TERMS = [
  'muốn chết', 'muốn biến mất', 'tự tử', 'tự sát',
  'không muốn sống', 'chẳng ai cần', 'thà chết',
];

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function diffDays(a: Date, b: Date) {
  return Math.round((startOfDayUTC(a).getTime() - startOfDayUTC(b).getTime()) / 86400000);
}

function hasIdeationKeyword(keywords: string[]): boolean {
  return keywords?.some((k) => IDEATION_TERMS.some((t) => k.includes(t))) ?? false;
}

function countConsecutive(
  insights: { date: Date; alertScore: number }[],
  predicate: (score: number) => boolean
): number {
  let streak = 0;
  for (let i = insights.length - 1; i >= 0; i--) {
    if (predicate(insights[i].alertScore)) streak++;
    else break;
  }
  return streak;
}

export async function computeProfileClass(userId: string): Promise<{
  cls: ProfileClass;
  reason: string;
  daysWithData: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profileClass: true },
  });
  const currentClass = (user?.profileClass ?? 'undetermined') as ProfileClass;

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - 90);

  const insights = await prisma.chatInsight.findMany({
    where: { userId, date: { gte: windowStart } },
    orderBy: { date: 'asc' },
    select: { date: true, alertScore: true, keywords: true },
  });

  const daysWithData = insights.length;
  const anyIdeation90d = insights.some((i) => hasIdeationKeyword(i.keywords));

  // IDEATION one-way gate: immediately promote to at_risk
  if (anyIdeation90d) {
    return { cls: 'at_risk_baseline', reason: 'ideation_detected_90d', daysWithData };
  }

  // Not enough data
  if (daysWithData < 30) {
    return { cls: 'undetermined', reason: 'insufficient_data', daysWithData };
  }

  const baselinePool = insights.slice(0, -3);
  let baselineScore = 0;
  if (baselinePool.length > 0) {
    let wSum = 0, num = 0;
    for (const it of baselinePool) {
      const ageDays = diffDays(now, it.date);
      const w = Math.pow(0.97, ageDays);
      wSum += w;
      num += w * it.alertScore;
    }
    baselineScore = wSum > 0 ? num / wSum : 0;
  }
  const maxScore90d = insights.reduce((m, i) => Math.max(m, i.alertScore), 0);

  const streakAbove035 = countConsecutive(insights, (s) => s > 0.35);
  const streakBelow02 = countConsecutive(insights, (s) => s < 0.2);

  if (currentClass === 'healthy_baseline') {
    if (streakAbove035 >= 14) {
      return { cls: 'at_risk_baseline', reason: 'sustained_elevated_score_14d', daysWithData };
    }
    return { cls: 'healthy_baseline', reason: 'stable_healthy', daysWithData };
  }

  if (currentClass === 'at_risk_baseline') {
    if (streakBelow02 >= 60 && !anyIdeation90d) {
      return { cls: 'healthy_baseline', reason: 'sustained_recovery_60d', daysWithData };
    }
    return { cls: 'at_risk_baseline', reason: 'needs_continued_recovery', daysWithData };
  }

  if (baselineScore < 0.2 && maxScore90d < 0.5) {
    return { cls: 'healthy_baseline', reason: 'first_class_healthy', daysWithData };
  }
  if (baselineScore >= 0.35) {
    return { cls: 'at_risk_baseline', reason: 'first_class_at_risk', daysWithData };
  }
  return { cls: 'undetermined', reason: 'borderline_keep_undetermined', daysWithData };
}

export async function refreshProfileClass(userId: string): Promise<{
  cls: ProfileClass;
  changed: boolean;
  reason: string;
}> {
  const { cls, reason } = await computeProfileClass(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profileClass: true },
  });
  if (user?.profileClass !== cls) {
    await prisma.user.update({
      where: { id: userId },
      data: { profileClass: cls, profileClassUpdatedAt: new Date() },
    });
    return { cls, changed: true, reason };
  }
  return { cls, changed: false, reason };
}
