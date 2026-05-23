import bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';
import prisma from '../models/prisma';
import { HttpError } from '../utils/http-error';

const RECOVERY_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

const recoveryRequestSelect = {
  id: true,
  userId: true,
  status: true,
  reason: true,
  requestedAt: true,
  pinVerifiedAt: true,
  expiresAt: true,
  reviewedByAdminId: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      profileClass: true,
      createdAt: true,
    },
  },
} satisfies Prisma.AccountRecoveryRequestSelect;

export type SafeAccountRecoveryRequest = Prisma.AccountRecoveryRequestGetPayload<{
  select: typeof recoveryRequestSelect;
}>;

function normalizeIdentifier(value: unknown) {
  if (typeof value !== 'string') throw new HttpError(400, 'Username or email is required');
  const identifier = value.trim().toLowerCase();
  if (!identifier) throw new HttpError(400, 'Username or email is required');
  if (identifier.length > 160) throw new HttpError(400, 'Identifier is too long');
  return identifier;
}

function normalizePin(value: unknown) {
  if (typeof value !== 'string') throw new HttpError(400, 'PIN is required');
  const pin = value.trim();
  if (!/^\d{4,12}$/.test(pin)) {
    throw new HttpError(400, 'PIN must be 4-12 digits');
  }
  return pin;
}

function normalizeReason(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Invalid recovery reason');
  const reason = value.trim();
  if (reason.length > 500) throw new HttpError(400, 'Recovery reason is too long');
  return reason || null;
}

export async function setUserRecoveryPin(userId: string, input: Record<string, unknown>) {
  const pin = normalizePin(input.pin ?? input.recoveryPin);
  await prisma.user.update({
    where: { id: userId },
    data: { recoveryPinHash: await bcrypt.hash(pin, 12) },
  });
  return { ok: true, recoveryPinSet: true };
}

export async function clearUserRecoveryPin(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { recoveryPinHash: null },
  });
}

export async function createPinVerifiedRecoveryRequest(input: Record<string, unknown>) {
  const identifier = normalizeIdentifier(input.identifier ?? input.username ?? input.email);
  const pin = normalizePin(input.pin);
  const reason = normalizeReason(input.reason);

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: identifier }, { email: identifier }],
    },
    select: {
      id: true,
      recoveryPinHash: true,
    },
  });

  if (!user) throw new HttpError(401, 'Invalid username or PIN');
  if (!user.recoveryPinHash) {
    throw new HttpError(409, 'Recovery PIN is not configured for this account');
  }

  const valid = await bcrypt.compare(pin, user.recoveryPinHash);
  if (!valid) throw new HttpError(401, 'Invalid username or PIN');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RECOVERY_REQUEST_TTL_MS);

  const request = await prisma.$transaction(async (tx) => {
    await tx.accountRecoveryRequest.updateMany({
      where: {
        userId: user.id,
        status: 'PIN_VERIFIED',
        expiresAt: { gt: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    return tx.accountRecoveryRequest.create({
      data: {
        userId: user.id,
        status: 'PIN_VERIFIED',
        reason,
        pinVerifiedAt: now,
        expiresAt,
      },
      select: recoveryRequestSelect,
    });
  });

  return {
    ok: true,
    request: {
      id: request.id,
      status: request.status,
      expiresAt: request.expiresAt,
    },
  };
}

export async function listActiveRecoveryRequests() {
  const now = new Date();
  return prisma.accountRecoveryRequest.findMany({
    where: {
      status: 'PIN_VERIFIED',
      expiresAt: { gt: now },
    },
    orderBy: { requestedAt: 'desc' },
    select: recoveryRequestSelect,
  });
}

export async function findActiveRecoveryRequestForUser(userId: string) {
  return prisma.accountRecoveryRequest.findFirst({
    where: {
      userId,
      status: 'PIN_VERIFIED',
      expiresAt: { gt: new Date() },
    },
    orderBy: { requestedAt: 'desc' },
    select: recoveryRequestSelect,
  });
}
