import bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';
import prisma from '../models/prisma';
import { dateKeyUTC, toDateOnlyUTC } from '../utils/date.utils';
import { HttpError } from '../utils/http-error';
import { refreshProfileClass } from './profile-class.service';

const MAX_DAYS = 365;
const DEFAULT_DAYS = 30;
const PROFILE_CLASSES = ['undetermined', 'healthy_baseline', 'at_risk_baseline'];

type TimelineRow = {
  date: string;
  signups: number;
  logs: number;
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

function userSearchWhere(search: unknown, profileClass: unknown): Prisma.UserWhereInput {
  const q = typeof search === 'string' ? search.trim() : '';
  const cls = typeof profileClass === 'string' ? profileClass.trim() : '';
  const where: Prisma.UserWhereInput = {};

  if (q) {
    where.OR = [
      { username: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { displayName: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (cls && cls !== 'all') {
    where.profileClass = cls;
  }

  return where;
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
    users,
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
      select: { startedAt: true, actualMin: true, completed: true },
    }),
    prisma.waterIntake.findMany({
      where: { date: { gte: from } },
      select: { date: true, glasses: true, goal: true },
    }),
    prisma.stepCount.findMany({
      where: { date: { gte: from } },
      select: { date: true, steps: true },
    }),
    prisma.sleepSession.findMany({
      where: { wakeTime: { gte: from } },
      select: { wakeTime: true, duration: true },
    }),
  ]);

  const moodDistribution: Record<string, number> = {};
  const factorDistribution: Record<string, number> = {};
  const alertDistribution: Record<string, number> = {};
  const atRiskUserIds = new Set<string>();

  for (const user of users) {
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
    increment(moodDistribution, log.mood);
    increment(alertDistribution, log.alertLevel ?? 'none');
    for (const factor of log.factors) increment(factorDistribution, factor);
    if (isElevatedAlert(log.alertLevel)) atRiskUserIds.add(log.userId);
  }

  for (const insight of chatInsights) {
    const row = timeline.get(dateKeyUTC(insight.date));
    if (row) row.chatAlertScore = Math.max(row.chatAlertScore ?? 0, insight.alertScore);
    if (isElevatedAlert(insight.alertLevel)) atRiskUserIds.add(insight.userId);
  }

  for (const session of meditationSessions) {
    const row = timeline.get(dateKeyUTC(session.startedAt));
    if (row) row.meditationMinutes += session.actualMin;
  }

  for (const water of waterRows) {
    const row = timeline.get(dateKeyUTC(water.date));
    if (row) {
      row.waterGlasses = (row.waterGlasses ?? 0) + water.glasses;
      row.waterGoal = (row.waterGoal ?? 0) + water.goal;
    }
  }

  for (const steps of stepRows) {
    const row = timeline.get(dateKeyUTC(steps.date));
    if (row) row.steps = (row.steps ?? 0) + steps.steps;
  }

  for (const sleep of sleepRows) {
    const row = timeline.get(dateKeyUTC(sleep.wakeTime));
    if (row) row.sleepMinutes = (row.sleepMinutes ?? 0) + sleep.duration;
  }

  const series = Array.from(timeline.values()).map((row) => ({
    ...row,
    avgMood: row.moodCount ? round(row.moodTotal / row.moodCount) : null,
    moodTotal: undefined,
    moodCount: undefined,
  }));

  const moodScores = logs.map((log) => log.moodScore);
  const feedbackRatings = feedbacks.map((feedback) => feedback.rating);
  const meditationMinutes = meditationSessions.reduce((sum, session) => sum + session.actualMin, 0);
  const completedMeditations = meditationSessions.filter((session) => session.completed).length;

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
      profileClass: profileGroups.map((group) => ({
        label: group.profileClass,
        count: group._count._all,
      })),
    },
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
}) {
  const page = parseIntParam(query.page, 1, 5000);
  const limit = parseIntParam(query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const where = userSearchWhere(query.q, query.profileClass);

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
        avatar: user.avatar,
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
      hasMediaKey: Boolean(user.mediaKeySalt && user.encryptedMediaKey),
      mediaKeySalt: undefined,
      encryptedMediaKey: undefined,
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

export async function resetAdminUserPassword(userId: string, input: { newPassword?: unknown }) {
  const password = typeof input.newPassword === 'string' ? input.newPassword : '';
  if (password.length < 6) {
    throw new HttpError(400, 'New password must be at least 6 characters');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(password, 10) },
  });

  return { ok: true };
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
