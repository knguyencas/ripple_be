import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../models/prisma';
import { RegisterInput, LoginInput } from '../types';

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
