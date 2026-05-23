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

interface MediaKeyInput {
  mediaKeySalt?: string;
  encryptedMediaKey?: string;
  mediaKeyIv?: string;
  mediaKeyVersion?: number;
  recoveryPin?: string;
  pin?: string;
}

interface ResetPinInput {
  password?: string;
}

const USER_PROFILE_SELECT = {
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
  mediaKeySalt: true,
  encryptedMediaKey: true,
  mediaKeyIv: true,
  mediaKeyVersion: true,
} as const;

function normalizeRecoveryPin(value: unknown) {
  if (typeof value !== 'string') throw new HttpError(400, 'PIN is required');
  const pin = value.trim();
  if (!/^\d{4,12}$/.test(pin)) {
    throw new HttpError(400, 'PIN must be 4-12 digits');
  }
  return pin;
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
      mediaKeySalt: true,
      encryptedMediaKey: true,
      mediaKeyIv: true,
      mediaKeyVersion: true,
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
    select: USER_PROFILE_SELECT,
  });
}

export async function updateUserAvatar(userId: string, avatar: string) {
  if (typeof avatar !== 'string' || !avatar.trim()) {
    throw new HttpError(400, 'Avatar file is required');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { avatar },
    select: USER_PROFILE_SELECT,
  });
}

export async function updateUserMediaKey(userId: string, input: MediaKeyInput) {
  const { mediaKeySalt, encryptedMediaKey, mediaKeyIv, mediaKeyVersion } = input;
  const recoveryPin = input.recoveryPin ?? input.pin;

  if (
    typeof mediaKeySalt !== 'string' ||
    typeof encryptedMediaKey !== 'string' ||
    typeof mediaKeyIv !== 'string'
  ) {
    throw new HttpError(400, 'Invalid media key payload');
  }

  const recoveryPinHash =
    recoveryPin === undefined ? undefined : await bcrypt.hash(normalizeRecoveryPin(recoveryPin), 12);

  return prisma.user.update({
    where: { id: userId },
    data: {
      mediaKeySalt,
      encryptedMediaKey,
      mediaKeyIv,
      mediaKeyVersion: mediaKeyVersion || 1,
      ...(recoveryPinHash ? { recoveryPinHash } : {}),
    },
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
      mediaKeySalt: true,
      encryptedMediaKey: true,
      mediaKeyIv: true,
      mediaKeyVersion: true,
    },
  });
}

export async function updateUserRecoveryPin(userId: string, input: Record<string, unknown>) {
  const pin = normalizeRecoveryPin(input.pin ?? input.recoveryPin);
  await prisma.user.update({
    where: { id: userId },
    data: { recoveryPinHash: await bcrypt.hash(pin, 12) },
  });
  return { ok: true, recoveryPinSet: true };
}

/**
 * Reset PIN: user quên PIN, dùng password để xác minh, sau đó WIPE envelope.
 * Cảnh báo: tất cả media đã encrypt với envelope cũ sẽ KHÔNG decrypt được nữa.
 * Client phải tạo PIN mới + envelope mới sau khi gọi endpoint này.
 */
export async function resetUserPin(userId: string, input: ResetPinInput) {
  const { password } = input;

  if (typeof password !== 'string' || password.length === 0) {
    throw new HttpError(400, 'Vui lòng nhập mật khẩu để xác nhận');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new HttpError(401, 'Mật khẩu không đúng');

  // Wipe envelope: media key cũ không còn cách nào lấy lại
  await prisma.user.update({
    where: { id: userId },
    data: {
      mediaKeySalt: null,
      encryptedMediaKey: null,
      mediaKeyIv: null,
      mediaKeyVersion: 1,
      recoveryPinHash: null,
    },
  });

  return { ok: true };
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

  await prisma.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(newPassword, 10) },
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
