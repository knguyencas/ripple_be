import bcrypt from 'bcrypt';
import prisma from '../models/prisma';
import { HttpError } from '../utils/http-error';
import { getUserStreak } from './streak.service';

interface UpdateUserInput {
  displayName?: string | null;
  ageGroup?: string | null;
  bio?: string | null;
  avatar?: string | null;
  city?: string | null;
}

interface ChangePasswordInput {
  currentPassword?: string;
  newPassword?: string;
}

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
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
      createdAt: true,
      profileClass: true,
    },
  });
  if (!user) throw new HttpError(404, 'User not found');
  return user;
}

export async function updateUserProfile(userId: string, input: UpdateUserInput) {
  const data: UpdateUserInput = {};

  if (input.displayName !== undefined) {
    if (input.displayName !== null && typeof input.displayName !== 'string') {
      throw new HttpError(400, 'displayName must be a string');
    }
    const trimmed = typeof input.displayName === 'string' ? input.displayName.trim() : null;
    if (trimmed && trimmed.length > 50) {
      throw new HttpError(400, 'displayName too long (max 50)');
    }
    data.displayName = trimmed || null;
  }

  if (input.ageGroup !== undefined) {
    if (input.ageGroup !== null && typeof input.ageGroup !== 'string') {
      throw new HttpError(400, 'ageGroup must be a string');
    }
    data.ageGroup = typeof input.ageGroup === 'string' ? input.ageGroup.trim() || null : null;
  }

  if (input.bio !== undefined) data.bio = typeof input.bio === 'string' ? input.bio : null;
  if (input.avatar !== undefined) data.avatar = typeof input.avatar === 'string' ? input.avatar : null;
  if (input.city !== undefined) data.city = typeof input.city === 'string' ? input.city : null;

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, 'No fields to update');
  }

  return prisma.user.update({
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
      createdAt: true,
    },
  });
}

export async function changeUserPassword(userId: string, input: ChangePasswordInput) {
  const { currentPassword, newPassword } = input;

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    throw new HttpError(400, 'currentPassword và newPassword là bắt buộc');
  }
  if (newPassword.length < 6) {
    throw new HttpError(400, 'Mật khẩu mới tối thiểu 6 ký tự');
  }
  if (newPassword === currentPassword) {
    throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu cũ');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new HttpError(401, 'Mật khẩu hiện tại không đúng');

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  });

  return { ok: true };
}

export async function getUserStats(userId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const [streak, totalLogs, recentLogs] = await Promise.all([
    getUserStreak(userId),
    prisma.personalLog.count({ where: { userId } }),
    prisma.personalLog.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      select: { moodScore: true },
    }),
  ]);

  const avgMood = recentLogs.length > 0
    ? Math.round((recentLogs.reduce((sum, log) => sum + log.moodScore, 0) / recentLogs.length) * 10) / 10
    : null;

  return {
    streak: streak.currentStreak,
    totalLogs,
    avgMood,
    avgMoodWindowDays: 30,
  };
}
