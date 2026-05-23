import bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';
import prisma from '../models/prisma';
import { dateKeyUTC, toDateOnlyUTC } from '../utils/date.utils';
import { HttpError } from '../utils/http-error';
import { findActiveRecoveryRequestForUser } from './account-recovery.service';
import { refreshProfileClass } from './profile-class.service';

const MAX_DAYS = 365;
const DEFAULT_DAYS = 30;
const PROFILE_CLASSES = ['undetermined', 'healthy_baseline', 'at_risk_baseline'];

type TimelineRow = {
  date: string;
  signups: number;
  logs: number;
  activeUserIds: Set<string>;
  estimatedUsageMinutes: number;
  chatMessages: number;
  moodTotal: number;
  moodCount: number;
  avgMood: number | null;
  steps: number | null;
  sleepMinutes: number | null;
  waterGlasses: number | null;
  waterGoal: number | null;
  meditationMinutes: number;
  chatAlertScore: number | null;
};

type WellnessPeriod = 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

type WellnessAggregateBucket = {
  periodType: WellnessPeriod;
  periodStart: Date;
  periodEnd: Date;
  phqScores: number[];
  moodScores: number[];
  alertCounts: Record<string, number>;
  chatScores: number[];
  chatMessageCount: number;
  keywordCounts: Record<string, number>;
};

function parseIntParam(value: unknown, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

function parseDays(value: unknown) {
  return parseIntParam(value, DEFAULT_DAYS, MAX_DAYS);
}

function rangeStart(days: number) {
  const start = toDateOnlyUTC(new Date());
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

function makeTimeline(days: number, from: Date) {
  const rows = new Map<string, TimelineRow>();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(from);
    date.setUTCDate(from.getUTCDate() + i);
    const key = dateKeyUTC(date);
    rows.set(key, {
      date: key,
      signups: 0,
      logs: 0,
      activeUserIds: new Set<string>(),
      estimatedUsageMinutes: 0,
      chatMessages: 0,
      moodTotal: 0,
      moodCount: 0,
      avgMood: null,
      steps: null,
      sleepMinutes: null,
      waterGlasses: null,
      waterGoal: null,
      meditationMinutes: 0,
      chatAlertScore: null,
    });
  }
  return rows;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function maxValue(values: number[]) {
  if (!values.length) return null;
  return Math.max(...values);
}

function increment(map: Record<string, number>, key: string | null | undefined, amount = 1) {
  const normalized = key?.trim() || 'unknown';
  map[normalized] = (map[normalized] ?? 0) + amount;
}

function topEntries(map: Record<string, number>, limit = 10) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function bucketActivityFrequency(activeDayCounts: number[]) {
  const buckets = [
    { label: '1 day', min: 1, max: 1, count: 0 },
    { label: '2-3 days', min: 2, max: 3, count: 0 },
    { label: '4-7 days', min: 4, max: 7, count: 0 },
    { label: '8-14 days', min: 8, max: 14, count: 0 },
    { label: '15+ days', min: 15, max: Number.POSITIVE_INFINITY, count: 0 },
  ];

  for (const activeDays of activeDayCounts) {
    const bucket = buckets.find((item) => activeDays >= item.min && activeDays <= item.max);
    if (bucket) bucket.count += 1;
  }

  return buckets.map(({ label, count }) => ({ label, count }));
}

function topLabels(map: Record<string, number>, limit = 12) {
  return topEntries(map, limit).map((item) => item.label);
}

function dominantLabel(map: Record<string, number>) {
  return topEntries(map, 1)[0]?.label ?? null;
}

function startOfUTCWeek(date: Date) {
  const start = toDateOnlyUTC(date);
  const day = start.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setUTCDate(start.getUTCDate() + mondayOffset);
  return start;
}

function startOfUTCMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfUTCQuarter(date: Date) {
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterMonth, 1));
}

function startOfUTCYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function periodStart(date: Date, periodType: WellnessPeriod) {
  if (periodType === 'WEEK') return startOfUTCWeek(date);
  if (periodType === 'MONTH') return startOfUTCMonth(date);
  if (periodType === 'QUARTER') return startOfUTCQuarter(date);
  return startOfUTCYear(date);
}

function periodEnd(start: Date, periodType: WellnessPeriod) {
  const end = new Date(start);
  if (periodType === 'WEEK') end.setUTCDate(end.getUTCDate() + 7);
  if (periodType === 'MONTH') end.setUTCMonth(end.getUTCMonth() + 1);
  if (periodType === 'QUARTER') end.setUTCMonth(end.getUTCMonth() + 3);
  if (periodType === 'YEAR') end.setUTCFullYear(end.getUTCFullYear() + 1);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return end;
}

function aggregateBucket(
  buckets: Map<string, WellnessAggregateBucket>,
  date: Date,
  periodType: WellnessPeriod
) {
  const start = periodStart(date, periodType);
  const key = `${periodType}:${dateKeyUTC(start)}`;
  const existing = buckets.get(key);
  if (existing) return existing;

  const bucket: WellnessAggregateBucket = {
    periodType,
    periodStart: start,
    periodEnd: periodEnd(start, periodType),
    phqScores: [],
    moodScores: [],
    alertCounts: {},
    chatScores: [],
    chatMessageCount: 0,
    keywordCounts: {},
  };
  buckets.set(key, bucket);
  return bucket;
}

function pushToAggregateBuckets(
  buckets: Map<string, WellnessAggregateBucket>,
  date: Date,
  apply: (bucket: WellnessAggregateBucket) => void
) {
  (['WEEK', 'MONTH', 'QUARTER', 'YEAR'] as WellnessPeriod[]).forEach((periodType) => {
    apply(aggregateBucket(buckets, date, periodType));
  });
}

function isElevatedAlert(level: string | null | undefined) {
  return ['moderate', 'high', 'critical', 'severe'].includes(level ?? '');
}

function maxDate(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}

function phqBandWhere(phqBand: string): Prisma.PersonalLogWhereInput | null {
  const ranges: Record<string, Prisma.PersonalLogWhereInput> = {
    minimal: { nlpScore: { gte: 0, lt: 5 } },
    mild: { nlpScore: { gte: 5, lt: 10 } },
    moderate: { nlpScore: { gte: 10, lt: 15 } },
    mod_severe: { nlpScore: { gte: 15, lt: 20 } },
    severe: { nlpScore: { gte: 20 } },
  };
  return ranges[phqBand] ?? null;
}

function userSearchWhere(
  search: unknown,
  profileClass: unknown,
  alertLevel?: unknown,
  phqBand?: unknown,
  keyword?: unknown
): Prisma.UserWhereInput {
  const q = typeof search === 'string' ? search.trim() : '';
  const cls = typeof profileClass === 'string' ? profileClass.trim() : '';
  const level = typeof alertLevel === 'string' ? alertLevel.trim() : '';
  const band = typeof phqBand === 'string' ? phqBand.trim() : '';
  const kw = typeof keyword === 'string' ? keyword.trim() : '';
  const and: Prisma.UserWhereInput[] = [];

  if (q) {
    and.push({
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  if (cls && cls !== 'all') {
    and.push({ profileClass: cls });
  }

  if (level && level !== 'all') {
    and.push({
      OR: [
        { personalLogs: { some: { alertLevel: level } } },
        { chatInsights: { some: { alertLevel: level } } },
      ],
    });
  }

  if (band && band !== 'all') {
    const bandWhere = phqBandWhere(band);
    if (bandWhere) and.push({ personalLogs: { some: bandWhere } });
  }

  if (kw) {
    and.push({ chatInsights: { some: { keywords: { has: kw } } } });
  }

  return and.length ? { AND: and } : {};
}

function normalizeNullableString(value: unknown, maxLength: number) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, 'Invalid string field');
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `Field is too long. Max ${maxLength} characters`);
  }
  return trimmed || null;
}

export async function getAdminOverview(daysValue: unknown) {
  const days = parseDays(daysValue);
  const from = rangeStart(days);
  const timeline = makeTimeline(days, from);

  const [
    totalUsers,
    newUsers,
    activeUsers,
    totalLogs,
    allUsers,
    newUserRows,
    logs,
    chatInsights,
    feedbacks,
    profileGroups,
    meditationSessions,
    waterRows,
    stepRows,
    sleepRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: from } } }),
    prisma.user.count({
      where: {
        OR: [
          { personalLogs: { some: { createdAt: { gte: from } } } },
          { chatInsights: { some: { date: { gte: from } } } },
          { stepCounts: { some: { date: { gte: from } } } },
          { sleepSessions: { some: { wakeTime: { gte: from } } } },
          { waterIntakes: { some: { date: { gte: from } } } },
          { meditationSessions: { some: { startedAt: { gte: from } } } },
          { feedbacks: { some: { createdAt: { gte: from } } } },
        ],
      },
    }),
    prisma.personalLog.count(),
    prisma.user.findMany({
      select: { id: true, streak: true },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: from } },
      select: { id: true, username: true, displayName: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.personalLog.findMany({
      where: { createdAt: { gte: from } },
      select: {
        userId: true,
        mood: true,
        moodScore: true,
        factors: true,
        alertLevel: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.chatInsight.findMany({
      where: { date: { gte: from } },
      select: {
        userId: true,
        date: true,
        alertLevel: true,
        alertScore: true,
        messageCount: true,
        keywords: true,
        user: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: [{ alertScore: 'desc' }, { date: 'desc' }],
      take: 20,
    }),
    prisma.feedback.findMany({
      where: { createdAt: { gte: from } },
      select: {
        id: true,
        rating: true,
        message: true,
        createdAt: true,
        userId: true,
        user: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.user.groupBy({
      by: ['profileClass'],
      _count: { _all: true },
    }),
    prisma.meditationSession.findMany({
      where: { startedAt: { gte: from } },
      select: { userId: true, startedAt: true, actualMin: true, completed: true },
    }),
    prisma.waterIntake.findMany({
      where: { date: { gte: from } },
      select: { userId: true, date: true, glasses: true, goal: true },
    }),
    prisma.stepCount.findMany({
      where: { date: { gte: from } },
      select: { userId: true, date: true, steps: true },
    }),
    prisma.sleepSession.findMany({
      where: { wakeTime: { gte: from } },
      select: { userId: true, wakeTime: true, duration: true },
    }),
  ]);

  const moodDistribution: Record<string, number> = {};
  const factorDistribution: Record<string, number> = {};
  const alertDistribution: Record<string, number> = {};
  const atRiskUserIds = new Set<string>();
  const activeDayKeysByUser = new Map<string, Set<string>>();
  const estimatedUsageMinutesByUser = new Map<string, number>();

  const markActivity = (userId: string, at: Date, estimatedMinutes: number) => {
    const key = dateKeyUTC(at);
    const row = timeline.get(key);
    if (!row) return;

    row.activeUserIds.add(userId);
    row.estimatedUsageMinutes += Math.max(0, estimatedMinutes);

    const activeDays = activeDayKeysByUser.get(userId) ?? new Set<string>();
    activeDays.add(key);
    activeDayKeysByUser.set(userId, activeDays);
    estimatedUsageMinutesByUser.set(
      userId,
      (estimatedUsageMinutesByUser.get(userId) ?? 0) + Math.max(0, estimatedMinutes)
    );
  };

  for (const user of newUserRows) {
    const row = timeline.get(dateKeyUTC(user.createdAt));
    if (row) row.signups += 1;
  }

  for (const log of logs) {
    const key = dateKeyUTC(log.createdAt);
    const row = timeline.get(key);
    if (row) {
      row.logs += 1;
      row.moodTotal += log.moodScore;
      row.moodCount += 1;
    }
    markActivity(log.userId, log.createdAt, 6);
    increment(moodDistribution, log.mood);
    increment(alertDistribution, log.alertLevel ?? 'none');
    for (const factor of log.factors) increment(factorDistribution, factor);
    if (isElevatedAlert(log.alertLevel)) atRiskUserIds.add(log.userId);
  }

  for (const insight of chatInsights) {
    const row = timeline.get(dateKeyUTC(insight.date));
    if (row) {
      row.chatAlertScore = Math.max(row.chatAlertScore ?? 0, insight.alertScore);
      row.chatMessages += insight.messageCount;
    }
    markActivity(insight.userId, insight.date, Math.min(90, insight.messageCount * 0.75));
    if (isElevatedAlert(insight.alertLevel)) atRiskUserIds.add(insight.userId);
  }

  for (const feedback of feedbacks) {
    markActivity(feedback.userId, feedback.createdAt, 3);
  }

  for (const session of meditationSessions) {
    const row = timeline.get(dateKeyUTC(session.startedAt));
    if (row) row.meditationMinutes += session.actualMin;
    markActivity(session.userId, session.startedAt, Math.max(1, session.actualMin));
  }

  for (const water of waterRows) {
    const row = timeline.get(dateKeyUTC(water.date));
    if (row) {
      row.waterGlasses = (row.waterGlasses ?? 0) + water.glasses;
      row.waterGoal = (row.waterGoal ?? 0) + water.goal;
    }
    markActivity(water.userId, water.date, 1.5);
  }

  for (const steps of stepRows) {
    const row = timeline.get(dateKeyUTC(steps.date));
    if (row) row.steps = (row.steps ?? 0) + steps.steps;
    markActivity(steps.userId, steps.date, 1);
  }

  for (const sleep of sleepRows) {
    const row = timeline.get(dateKeyUTC(sleep.wakeTime));
    if (row) row.sleepMinutes = (row.sleepMinutes ?? 0) + sleep.duration;
    markActivity(sleep.userId, sleep.wakeTime, 2);
  }

  let cumulativeUsers = totalUsers - newUsers;
  const series = Array.from(timeline.values()).map((row) => {
    cumulativeUsers += row.signups;
    return {
      date: row.date,
      signups: row.signups,
      totalUsers: cumulativeUsers,
      activeUsers: row.activeUserIds.size,
      estimatedUsageHours: round(row.estimatedUsageMinutes / 60, 2),
      chatMessages: row.chatMessages,
      logs: row.logs,
      avgMood: row.moodCount ? round(row.moodTotal / row.moodCount) : null,
      steps: row.steps,
      sleepMinutes: row.sleepMinutes,
      waterGlasses: row.waterGlasses,
      waterGoal: row.waterGoal,
      meditationMinutes: row.meditationMinutes,
      chatAlertScore: row.chatAlertScore,
    };
  });

  const moodScores = logs.map((log) => log.moodScore);
  const streakValues = allUsers.map((user) => user.streak);
  const activeDayCounts = Array.from(activeDayKeysByUser.values()).map((days) => days.size);
  const estimatedUsageMinutes = Array.from(estimatedUsageMinutesByUser.values());
  const regularThresholdDays = Math.max(2, Math.ceil(days * 0.25));
  const regularUsers = activeDayCounts.filter((count) => count >= regularThresholdDays).length;
  const totalEstimatedUsageMinutes = sum(estimatedUsageMinutes);
  const feedbackRatings = feedbacks.map((feedback) => feedback.rating);
  const meditationMinutes = meditationSessions.reduce((sum, session) => sum + session.actualMin, 0);
  const completedMeditations = meditationSessions.filter((session) => session.completed).length;
  const dominantMood = topEntries(moodDistribution, 1)[0]?.label ?? null;

  return {
    range: {
      days,
      from: dateKeyUTC(from),
      to: dateKeyUTC(new Date()),
    },
    cards: {
      totalUsers,
      newUsers,
      activeUsers,
      totalLogs,
      logsInRange: logs.length,
      avgMood: average(moodScores),
      dominantMood,
      avgStreak: average(streakValues),
      maxStreak: maxValue(streakValues),
      regularUsers,
      regularThresholdDays,
      regularAccessRate: activeUsers ? round((regularUsers / activeUsers) * 100) : null,
      avgActiveDaysPerActiveUser: average(activeDayCounts),
      totalEstimatedUsageHours: round(totalEstimatedUsageMinutes / 60, 2),
      avgEstimatedUsageHoursPerActiveUser: activeUsers
        ? round(totalEstimatedUsageMinutes / activeUsers / 60, 2)
        : null,
      atRiskUsers: atRiskUserIds.size,
      feedbackCount: feedbacks.length,
      avgRating: average(feedbackRatings),
      meditationMinutes,
      meditationCompletionRate: meditationSessions.length
        ? round((completedMeditations / meditationSessions.length) * 100)
        : null,
    },
    series,
    distributions: {
      mood: topEntries(moodDistribution),
      factors: topEntries(factorDistribution),
      alerts: topEntries(alertDistribution),
      activityFrequency: bucketActivityFrequency(activeDayCounts),
      profileClass: profileGroups.map((group) => ({
        label: group.profileClass,
        count: group._count._all,
      })),
    },
    dataQuality: [
      {
        key: 'usage-hours',
        status: 'estimated',
        message: 'No app session table yet. Usage hours are estimated from logs, chat daily insights, meditation, health records, and feedback events.',
      },
      {
        key: 'login-streak',
        status: 'missing',
        message: 'No user login history yet. Average streak currently uses the log streak stored on User.streak.',
      },
    ],
    recentRisk: chatInsights.map((insight) => ({
      userId: insight.user.id,
      username: insight.user.username,
      displayName: insight.user.displayName,
      date: dateKeyUTC(insight.date),
      alertLevel: insight.alertLevel,
      alertScore: insight.alertScore,
      messageCount: insight.messageCount,
      keywords: insight.keywords.slice(0, 8),
    })),
    recentFeedbacks: feedbacks,
  };
}

export async function listAdminUsers(query: {
  q?: unknown;
  page?: unknown;
  limit?: unknown;
  profileClass?: unknown;
  alertLevel?: unknown;
  phqBand?: unknown;
  keyword?: unknown;
}) {
  const page = parseIntParam(query.page, 1, 5000);
  const limit = parseIntParam(query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const where = userSearchWhere(
    query.q,
    query.profileClass,
    query.alertLevel,
    query.phqBand,
    query.keyword
  );

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        ageGroup: true,
        city: true,
        streak: true,
        lastLogDate: true,
        profileClass: true,
        profileClassUpdatedAt: true,
        createdAt: true,
        personalLogs: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, mood: true, moodScore: true, alertLevel: true },
        },
        chatInsights: {
          take: 1,
          orderBy: { date: 'desc' },
          select: { date: true, alertLevel: true, alertScore: true },
        },
        stepCounts: {
          take: 1,
          orderBy: { date: 'desc' },
          select: { date: true, steps: true },
        },
        sleepSessions: {
          take: 1,
          orderBy: { wakeTime: 'desc' },
          select: { wakeTime: true, duration: true },
        },
        waterIntakes: {
          take: 1,
          orderBy: { updatedAt: 'desc' },
          select: { date: true, glasses: true, goal: true, updatedAt: true },
        },
        meditationSessions: {
          take: 1,
          orderBy: { startedAt: 'desc' },
          select: { startedAt: true, actualMin: true },
        },
        feedbacks: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, rating: true },
        },
        _count: {
          select: {
            personalLogs: true,
            chatInsights: true,
            stepCounts: true,
            sleepSessions: true,
            waterIntakes: true,
            meditationSessions: true,
            feedbacks: true,
          },
        },
      },
    }),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    items: users.map((user) => {
      const latestLog = user.personalLogs[0] ?? null;
      const latestChat = user.chatInsights[0] ?? null;
      const latestSteps = user.stepCounts[0] ?? null;
      const latestSleep = user.sleepSessions[0] ?? null;
      const latestWater = user.waterIntakes[0] ?? null;
      const latestMeditation = user.meditationSessions[0] ?? null;
      const latestFeedback = user.feedbacks[0] ?? null;

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatar: undefined,
        hasAvatar: Boolean(user.avatar),
        bio: user.bio,
        ageGroup: user.ageGroup,
        city: user.city,
        streak: user.streak,
        lastLogDate: user.lastLogDate,
        profileClass: user.profileClass,
        profileClassUpdatedAt: user.profileClassUpdatedAt,
        createdAt: user.createdAt,
        counts: user._count,
        latest: {
          log: latestLog,
          chatInsight: latestChat,
          steps: latestSteps,
          sleep: latestSleep,
          water: latestWater,
          meditation: latestMeditation,
          feedback: latestFeedback,
        },
        lastActivityAt: maxDate([
          latestLog?.createdAt,
          latestChat?.date,
          latestSteps?.date,
          latestSleep?.wakeTime,
          latestWater?.updatedAt,
          latestMeditation?.startedAt,
          latestFeedback?.createdAt,
        ]),
      };
    }),
  };
}

async function refreshUserWellnessAggregates(userId: string) {
  const from = rangeStart(MAX_DAYS);
  const [logs, chatInsights] = await Promise.all([
    prisma.personalLog.findMany({
      where: { userId, createdAt: { gte: from } },
      select: {
        createdAt: true,
        moodScore: true,
        nlpScore: true,
        alertLevel: true,
      },
    }),
    prisma.chatInsight.findMany({
      where: { userId, date: { gte: from } },
      select: {
        date: true,
        alertLevel: true,
        alertScore: true,
        messageCount: true,
        keywords: true,
      },
    }),
  ]);

  const buckets = new Map<string, WellnessAggregateBucket>();

  logs.forEach((log) => {
    pushToAggregateBuckets(buckets, log.createdAt, (bucket) => {
      if (typeof log.nlpScore === 'number') bucket.phqScores.push(log.nlpScore);
      bucket.moodScores.push(log.moodScore);
      increment(bucket.alertCounts, log.alertLevel ?? 'none');
    });
  });

  chatInsights.forEach((insight) => {
    pushToAggregateBuckets(buckets, insight.date, (bucket) => {
      bucket.chatScores.push(insight.alertScore);
      bucket.chatMessageCount += insight.messageCount;
      increment(bucket.alertCounts, insight.alertLevel ?? 'none');
      insight.keywords.forEach((keyword) => increment(bucket.keywordCounts, keyword));
    });
  });

  await Promise.all(
    Array.from(buckets.values()).map((bucket) => {
      const data = {
        periodEnd: bucket.periodEnd,
        avgPhqScore: average(bucket.phqScores),
        maxPhqScore: maxValue(bucket.phqScores),
        avgMoodScore: average(bucket.moodScores),
        dominantAlertLevel: dominantLabel(bucket.alertCounts),
        logCount: bucket.moodScores.length,
        chatAlertAvg: average(bucket.chatScores),
        chatAlertMax: maxValue(bucket.chatScores),
        chatMessageCount: bucket.chatMessageCount,
        topKeywords: topLabels(bucket.keywordCounts),
      };

      return prisma.userWellnessAggregate.upsert({
        where: {
          userId_periodType_periodStart: {
            userId,
            periodType: bucket.periodType,
            periodStart: bucket.periodStart,
          },
        },
        create: {
          userId,
          periodType: bucket.periodType,
          periodStart: bucket.periodStart,
          ...data,
        },
        update: data,
      });
    })
  );

  return prisma.userWellnessAggregate.findMany({
    where: { userId },
    orderBy: [{ periodType: 'asc' }, { periodStart: 'desc' }],
    take: 80,
  });
}

export async function getAdminUserTracking(userId: string, daysValue: unknown) {
  const days = parseDays(daysValue);
  const from = rangeStart(days);
  const timeline = makeTimeline(days, from);

  const [
    user,
    logs,
    anonymousLogs,
    steps,
    sleepSessions,
    waterRows,
    meditationSessions,
    chatInsights,
    feedbacks,
    notifications,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        ageGroup: true,
        city: true,
        streak: true,
        lastLogDate: true,
        profileClass: true,
        profileClassUpdatedAt: true,
        passwordResetToken: true,
        passwordResetExpires: true,
        createdAt: true,
        mediaKeyVersion: true,
        mediaKeySalt: true,
        encryptedMediaKey: true,
        _count: {
          select: {
            personalLogs: true,
            anonymousLogs: true,
            stepCounts: true,
            sleepSessions: true,
            waterIntakes: true,
            meditationSessions: true,
            chatInsights: true,
            feedbacks: true,
            notifications: true,
            audioRecordings: true,
            photoAttachments: true,
          },
        },
      },
    }),
    prisma.personalLog.findMany({
      where: { userId, createdAt: { gte: from } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        mood: true,
        moodScore: true,
        factors: true,
        note: true,
        nlpScore: true,
        nlpEmotion: true,
        alertLevel: true,
        createdAt: true,
        _count: {
          select: { audioRecordings: true, photoAttachments: true },
        },
      },
    }),
    prisma.anonymousLog.findMany({
      where: { userId, createdAt: { gte: from } },
      orderBy: { createdAt: 'desc' },
      select: {
        mood: true,
        moodScore: true,
        factors: true,
        nlpScore: true,
        nlpEmotion: true,
        hour: true,
        dayOfWeek: true,
        createdAt: true,
      },
    }),
    prisma.stepCount.findMany({
      where: { userId, date: { gte: from } },
      orderBy: { date: 'asc' },
      select: { date: true, steps: true, createdAt: true },
    }),
    prisma.sleepSession.findMany({
      where: { userId, wakeTime: { gte: from } },
      orderBy: { wakeTime: 'asc' },
      select: { id: true, bedtime: true, wakeTime: true, duration: true, createdAt: true },
    }),
    prisma.waterIntake.findMany({
      where: { userId, date: { gte: from } },
      orderBy: { date: 'asc' },
      select: { date: true, glasses: true, goal: true, createdAt: true, updatedAt: true },
    }),
    prisma.meditationSession.findMany({
      where: { userId, startedAt: { gte: from } },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        targetMin: true,
        actualMin: true,
        completed: true,
        startedAt: true,
        completedAt: true,
        sound: { select: { id: true, name: true } },
      },
    }),
    prisma.chatInsight.findMany({
      where: { userId, date: { gte: from } },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        alertLevel: true,
        alertScore: true,
        messageCount: true,
        keywords: true,
        notableSentences: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.feedback.findMany({
      where: { userId, createdAt: { gte: from } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, rating: true, message: true, createdAt: true },
    }),
    prisma.notification.findMany({
      where: { userId, createdAt: { gte: from } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  if (!user) throw new HttpError(404, 'User not found');

  const [wellnessAggregates, activeRecoveryRequest] = await Promise.all([
    refreshUserWellnessAggregates(userId),
    findActiveRecoveryRequestForUser(userId),
  ]);

  const moodDistribution: Record<string, number> = {};
  const factorDistribution: Record<string, number> = {};
  const alertDistribution: Record<string, number> = {};
  const anonymousHourDistribution: Record<string, number> = {};
  const anonymousDayDistribution: Record<string, number> = {};

  for (const log of logs) {
    const row = timeline.get(dateKeyUTC(log.createdAt));
    if (row) {
      row.logs += 1;
      row.moodTotal += log.moodScore;
      row.moodCount += 1;
    }
    increment(moodDistribution, log.mood);
    increment(alertDistribution, log.alertLevel ?? 'none');
    for (const factor of log.factors) increment(factorDistribution, factor);
  }

  for (const log of anonymousLogs) {
    increment(anonymousHourDistribution, String(log.hour).padStart(2, '0'));
    increment(anonymousDayDistribution, String(log.dayOfWeek));
  }

  for (const step of steps) {
    const row = timeline.get(dateKeyUTC(step.date));
    if (row) row.steps = step.steps;
  }

  for (const sleep of sleepSessions) {
    const row = timeline.get(dateKeyUTC(sleep.wakeTime));
    if (row) row.sleepMinutes = (row.sleepMinutes ?? 0) + sleep.duration;
  }

  for (const water of waterRows) {
    const row = timeline.get(dateKeyUTC(water.date));
    if (row) {
      row.waterGlasses = water.glasses;
      row.waterGoal = water.goal;
    }
  }

  for (const session of meditationSessions) {
    const row = timeline.get(dateKeyUTC(session.startedAt));
    if (row) row.meditationMinutes += session.actualMin;
  }

  for (const insight of chatInsights) {
    const row = timeline.get(dateKeyUTC(insight.date));
    if (row) row.chatAlertScore = Math.max(row.chatAlertScore ?? 0, insight.alertScore);
  }

  const series = Array.from(timeline.values()).map((row) => ({
    ...row,
    avgMood: row.moodCount ? round(row.moodTotal / row.moodCount) : null,
    moodTotal: undefined,
    moodCount: undefined,
  }));

  const moodScores = logs.map((log) => log.moodScore);
  const stepValues = steps.map((step) => step.steps);
  const sleepValues = sleepSessions.map((sleep) => sleep.duration);
  const feedbackRatings = feedbacks.map((feedback) => feedback.rating);
  const waterGoalHits = waterRows.filter((water) => water.glasses >= water.goal).length;
  const meditationMinutes = meditationSessions.reduce((sum, session) => sum + session.actualMin, 0);
  const meditationCompleted = meditationSessions.filter((session) => session.completed).length;

  return {
    range: {
      days,
      from: dateKeyUTC(from),
      to: dateKeyUTC(new Date()),
    },
    user: {
      ...user,
      avatar: undefined,
      hasAvatar: Boolean(user.avatar),
      hasMediaKey: Boolean(user.mediaKeySalt && user.encryptedMediaKey),
      mediaKeySalt: undefined,
      encryptedMediaKey: undefined,
      passwordResetToken: undefined,
      passwordResetExpires: undefined,
      passwordResetRequested: Boolean(
        activeRecoveryRequest
      ),
      passwordResetExpiresAt: activeRecoveryRequest?.expiresAt ?? null,
      activeRecoveryRequest: activeRecoveryRequest
        ? {
            id: activeRecoveryRequest.id,
            status: activeRecoveryRequest.status,
            reason: activeRecoveryRequest.reason,
            requestedAt: activeRecoveryRequest.requestedAt,
            pinVerifiedAt: activeRecoveryRequest.pinVerifiedAt,
            expiresAt: activeRecoveryRequest.expiresAt,
          }
        : null,
    },
    summary: {
      logs: logs.length,
      avgMood: average(moodScores),
      elevatedLogs: logs.filter((log) => isElevatedAlert(log.alertLevel)).length,
      avgSteps: average(stepValues),
      avgSleepMinutes: average(sleepValues),
      waterDays: waterRows.length,
      waterGoalHitRate: waterRows.length ? round((waterGoalHits / waterRows.length) * 100) : null,
      meditationMinutes,
      meditationCompletionRate: meditationSessions.length
        ? round((meditationCompleted / meditationSessions.length) * 100)
        : null,
      chatDays: chatInsights.length,
      maxChatAlertScore: chatInsights.length
        ? Math.max(...chatInsights.map((insight) => insight.alertScore))
        : null,
      feedbackCount: feedbacks.length,
      avgRating: average(feedbackRatings),
    },
    aggregates: {
      phqByPeriod: wellnessAggregates,
    },
    series,
    distributions: {
      mood: topEntries(moodDistribution),
      factors: topEntries(factorDistribution),
      alerts: topEntries(alertDistribution),
      anonymousHours: topEntries(anonymousHourDistribution, 24),
      anonymousDays: topEntries(anonymousDayDistribution, 7),
    },
    records: {
      logs,
      anonymousLogs,
      steps,
      sleepSessions,
      waterRows,
      meditationSessions,
      chatInsights,
      feedbacks,
      notifications,
    },
  };
}

export async function updateAdminUser(userId: string, input: Record<string, unknown>) {
  const data: Prisma.UserUpdateInput = {};

  if (input.displayName !== undefined) {
    data.displayName = normalizeNullableString(input.displayName, 50);
  }
  if (input.bio !== undefined) {
    data.bio = normalizeNullableString(input.bio, 500);
  }
  if (input.ageGroup !== undefined) {
    data.ageGroup = normalizeNullableString(input.ageGroup, 50);
  }
  if (input.city !== undefined) {
    data.city = normalizeNullableString(input.city, 80);
  }
  if (input.email !== undefined) {
    const email = normalizeNullableString(input.email, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Invalid email');
    }
    data.email = email ? email.toLowerCase() : null;
  }
  if (input.username !== undefined) {
    const username = normalizeNullableString(input.username, 40);
    if (!username || username.length < 3) {
      throw new HttpError(400, 'Username must be at least 3 characters');
    }
    data.username = username;
  }
  if (input.profileClass !== undefined) {
    const cls = normalizeNullableString(input.profileClass, 40);
    if (!cls || !PROFILE_CLASSES.includes(cls)) {
      throw new HttpError(400, 'Invalid profileClass');
    }
    data.profileClass = cls;
    data.profileClassUpdatedAt = new Date();
  }

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, 'No fields to update');
  }

  try {
    return await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        ageGroup: true,
        city: true,
        streak: true,
        profileClass: true,
        profileClassUpdatedAt: true,
        createdAt: true,
      },
    });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new HttpError(409, 'Username or email already exists');
    }
    throw error;
  }
}

export async function resetAdminUserPassword(
  userId: string,
  input: { newPassword?: unknown },
  options: { actorAdminId?: string | null; requireVerifiedRecoveryRequest?: boolean } = {}
) {
  const password = typeof input.newPassword === 'string' ? input.newPassword : '';
  if (password.length < 6) {
    throw new HttpError(400, 'New password must be at least 6 characters');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
    },
  });

  if (!user) throw new HttpError(404, 'User not found');

  const activeRecoveryRequest = await findActiveRecoveryRequestForUser(userId);

  if (options.requireVerifiedRecoveryRequest && !activeRecoveryRequest) {
    throw new HttpError(403, 'User password can only be reset after a PIN-verified recovery request');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(password, 10),
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    if (activeRecoveryRequest) {
      await tx.accountRecoveryRequest.update({
        where: { id: activeRecoveryRequest.id },
        data: {
          status: 'COMPLETED',
          reviewedByAdminId: options.actorAdminId ?? null,
          completedAt: new Date(),
        },
      });
    }
  });

  return { ok: true, recoveryRequestId: activeRecoveryRequest?.id ?? null };
}

export async function refreshAdminUserProfileClass(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new HttpError(404, 'User not found');
  return refreshProfileClass(userId);
}

export async function deleteAdminUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true },
  });
  if (!user) throw new HttpError(404, 'User not found');

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.meditationSession.deleteMany({ where: { userId } }),
    prisma.feedback.deleteMany({ where: { userId } }),
    prisma.chatInsight.deleteMany({ where: { userId } }),
    prisma.photoAttachment.deleteMany({ where: { userId } }),
    prisma.audioRecording.deleteMany({ where: { userId } }),
    prisma.personalLog.deleteMany({ where: { userId } }),
    prisma.anonymousLog.deleteMany({ where: { userId } }),
    prisma.stepCount.deleteMany({ where: { userId } }),
    prisma.sleepSession.deleteMany({ where: { userId } }),
    prisma.waterIntake.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return { ok: true, deletedUser: user };
}
