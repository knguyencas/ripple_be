import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../models/prisma';
import { RegisterInput, LoginInput } from '../types';

export const registerUser = async (input: RegisterInput) => {
  const { email, username, password, ageGroup } = input;

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username },
        ...(email ? [{ email }] : [])
      ]
    }
  });
  if (existing) throw new Error('Username hoặc email đã tồn tại');

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      password: hashed,
      ageGroup,
      ...(email ? { email } : {})
    }
  });

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, {
    expiresIn: '7d'
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName
    }
  };
};

export const loginUser = async (input: LoginInput) => {
  const { username, password } = input;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error('Username không tồn tại');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Sai mật khẩu');

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, {
    expiresIn: '7d'
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName
    }
  };
};