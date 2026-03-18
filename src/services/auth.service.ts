import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../models/prisma';
import { RegisterInput, LoginInput } from '../types';

export const registerUser = async (input: RegisterInput) => {
  const { email, username, password, city, ageGroup } = input;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] }
  });
  if (existing) throw new Error('Email hoặc username đã tồn tại');

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, username, password: hashed, city, ageGroup }
  });

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, {
    expiresIn: '7d'
  });

  return { token, user: { id: user.id, email, username } };
};

export const loginUser = async (input: LoginInput) => {
  const { email, password } = input;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error('Email không tồn tại');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Sai mật khẩu');

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, {
    expiresIn: '7d'
  });

  return { token, user: { id: user.id, email, username: user.username } };
};