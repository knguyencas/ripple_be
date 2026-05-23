import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../models/prisma';
import { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from '../types';
import { sendPasswordResetEmail } from './email.service';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 60 phút

function normalizeOptionalRecoveryPin(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('PIN khôi phục không hợp lệ');
  const pin = value.trim();
  if (!/^\d{4,12}$/.test(pin)) {
    throw new Error('PIN khôi phục phải gồm 4-12 chữ số');
  }
  return pin;
}

function authUserPayload(user: {
  id: string;
  email: string | null;
  username: string;
  displayName: string | null;
  avatar?: string | null;
  ageGroup?: string | null;
  mediaKeySalt?: string | null;
  encryptedMediaKey?: string | null;
  mediaKeyIv?: string | null;
  mediaKeyVersion?: number | null;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar ?? null,
    ageGroup: user.ageGroup ?? null,
    mediaKeySalt: user.mediaKeySalt ?? null,
    encryptedMediaKey: user.encryptedMediaKey ?? null,
    mediaKeyIv: user.mediaKeyIv ?? null,
    mediaKeyVersion: user.mediaKeyVersion ?? 1,
  };
}

export const registerUser = async (input: RegisterInput) => {
  const {
    email,
    username,
    password,
    ageGroup,
    mediaKeySalt,
    encryptedMediaKey,
    mediaKeyIv,
    mediaKeyVersion,
    recoveryPin,
    pin,
  } = input;

  const existingUsername = await prisma.user.findUnique({
    where: { username },
  });
  if (existingUsername) {
    throw new Error('Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác.');
  }

  if (email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      throw new Error('Email đã được sử dụng. Vui lòng nhập email khác.');
    }
  }

  const hashed = await bcrypt.hash(password, 10);
  const normalizedRecoveryPin = normalizeOptionalRecoveryPin(recoveryPin ?? pin);
  const recoveryPinHash = normalizedRecoveryPin
    ? await bcrypt.hash(normalizedRecoveryPin, 12)
    : undefined;
  let user;
  try {
    user = await prisma.user.create({
      data: {
        username,
        password: hashed,
        ageGroup,
        mediaKeySalt: mediaKeySalt || null,
        encryptedMediaKey: encryptedMediaKey || null,
        mediaKeyIv: mediaKeyIv || null,
        mediaKeyVersion: mediaKeyVersion || 1,
        ...(recoveryPinHash ? { recoveryPinHash } : {}),
        ...(email ? { email } : {})
      }
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(',') : String(error?.meta?.target ?? '');
      if (target.includes('email')) {
        throw new Error('Email đã được sử dụng. Vui lòng nhập email khác.');
      }
      throw new Error('Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác.');
    }
    throw error;
  }

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, {
    expiresIn: '30d'
  });

  return {
    token,
    user: authUserPayload(user)
  };
};

export const requestPasswordReset = async (input: ForgotPasswordInput) => {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email) throw new Error('Vui lòng nhập email');

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return { ok: true };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: token,
      passwordResetExpires: expiresAt,
    },
  });

  try {
    await sendPasswordResetEmail(email, token);
  } catch (err) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: null, passwordResetExpires: null },
    });
    console.error('[forgotPassword] sendEmail error:', err);
    throw new Error('Không gửi được email khôi phục. Vui lòng thử lại sau.');
  }

  return { ok: true };
};

export const resetUserPassword = async (input: ResetPasswordInput) => {
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';

  if (!token || !newPassword) {
    throw new Error('Thiếu token hoặc mật khẩu mới');
  }
  if (newPassword.length < 6) {
    throw new Error('Mật khẩu mới tối thiểu 6 ký tự');
  }

  const user = await prisma.user.findUnique({ where: { passwordResetToken: token } });
  if (!user) throw new Error('Link khôi phục không hợp lệ hoặc đã được sử dụng');

  if (!user.passwordResetExpires || user.passwordResetExpires.getTime() < Date.now()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: null, passwordResetExpires: null },
    });
    throw new Error('Link khôi phục đã hết hạn. Vui lòng yêu cầu link mới.');
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  return { ok: true };
};

export const loginUser = async (input: LoginInput) => {
  const { username, password } = input;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error('Username không tồn tại');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Sai mật khẩu');

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, {
    expiresIn: '30d'
  });

  return {
    token,
    user: authUserPayload(user)
  };
};
