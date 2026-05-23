import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { AdminAccount, AdminRole, Prisma } from '@prisma/client';
import prisma from '../models/prisma';
import { HttpError } from '../utils/http-error';

const ADMIN_TOKEN_TTL = '12h';

type AdminTokenPayload = jwt.JwtPayload & {
  adminId?: string;
  role?: AdminRole;
  isRoot?: boolean;
  scope?: string;
};

const adminSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  role: true,
  isRoot: true,
  active: true,
  createdById: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AdminAccountSelect;

export type SafeAdminAccount = Prisma.AdminAccountGetPayload<{ select: typeof adminSelect }>;

function normalizeString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string') throw new HttpError(400, `${label} is required`);
  const trimmed = value.trim();
  if (!trimmed) throw new HttpError(400, `${label} is required`);
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${label} is too long. Max ${maxLength} characters`);
  }
  return trimmed;
}

function normalizeNullableString(value: unknown, label: string, maxLength: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `Invalid ${label}`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${label} is too long. Max ${maxLength} characters`);
  }
  return trimmed || null;
}

function normalizeEmail(value: unknown) {
  const email = normalizeString(value, 'Email', 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Invalid email');
  }
  return email;
}

function normalizeUsername(value: unknown) {
  const username = normalizeString(value, 'Username', 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new HttpError(400, 'Username must be 3-40 characters and use letters, numbers, dot, dash, or underscore');
  }
  return username;
}

function normalizePassword(value: unknown) {
  const password = normalizeString(value, 'Password', 200);
  if (password.length < 10) {
    throw new HttpError(400, 'Password must be at least 10 characters');
  }
  return password;
}

function sessionSecret() {
  return (
    process.env.ADMIN_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.ADMIN_ROOT_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    ''
  );
}

function rootBootstrapConfig() {
  const password = process.env.ADMIN_ROOT_PASSWORD || process.env.ADMIN_PASSWORD || '';
  return {
    email: (process.env.ADMIN_ROOT_EMAIL || 'root@ripple.local').trim().toLowerCase(),
    username: (process.env.ADMIN_ROOT_USERNAME || 'root').trim().toLowerCase(),
    password,
    displayName: process.env.ADMIN_ROOT_NAME?.trim() || 'Root Admin',
  };
}

function toSafeAdmin(admin: SafeAdminAccount): SafeAdminAccount {
  return admin;
}

function isUniqueConstraint(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export async function recordAdminAudit(
  actorAdminId: string | null,
  action: string,
  targetType: string,
  targetId?: string | null,
  metadata?: Prisma.InputJsonValue
) {
  await prisma.adminAuditLog.create({
    data: {
      actorAdminId,
      action,
      targetType,
      targetId: targetId ?? null,
      metadata: metadata ?? undefined,
    },
  });
}

export async function ensureRootAdminAccount() {
  const existingRoot = await prisma.adminAccount.findFirst({
    where: { isRoot: true },
    select: adminSelect,
  });

  if (existingRoot) {
    if (!existingRoot.active || existingRoot.role !== 'SUPER_ADMIN') {
      return prisma.adminAccount.update({
        where: { id: existingRoot.id },
        data: { active: true, role: 'SUPER_ADMIN', isRoot: true },
        select: adminSelect,
      });
    }
    return existingRoot;
  }

  const root = rootBootstrapConfig();
  if (!root.password) return null;

  const created = await prisma.adminAccount.create({
    data: {
      email: root.email,
      username: root.username,
      password: await bcrypt.hash(root.password, 12),
      displayName: root.displayName,
      role: 'SUPER_ADMIN',
      isRoot: true,
      active: true,
    },
    select: adminSelect,
  });

  await recordAdminAudit(created.id, 'ROOT_BOOTSTRAPPED', 'AdminAccount', created.id, {
    email: created.email,
    username: created.username,
  });

  return created;
}

export function isAdminAuthConfigured() {
  return Boolean(sessionSecret() && (process.env.ADMIN_ROOT_PASSWORD || process.env.ADMIN_PASSWORD));
}

export function createAdminSessionToken(admin: Pick<AdminAccount, 'id' | 'role' | 'isRoot'>) {
  const secret = sessionSecret();
  if (!secret) throw new Error('ADMIN_JWT_SECRET is required for admin sessions');

  return jwt.sign(
    {
      scope: 'admin',
      adminId: admin.id,
      role: admin.role,
      isRoot: admin.isRoot,
    },
    secret,
    { expiresIn: ADMIN_TOKEN_TTL }
  );
}

export async function loginAdminAccount(input: {
  identifier?: unknown;
  username?: unknown;
  email?: unknown;
  password?: unknown;
}) {
  const root = await ensureRootAdminAccount();
  if (!root) {
    throw new HttpError(503, 'Admin root account is not configured. Set ADMIN_ROOT_PASSWORD or ADMIN_PASSWORD.');
  }

  const identifierValue = input.identifier ?? input.username ?? input.email;
  const identifier = normalizeString(identifierValue, 'Admin login', 160).toLowerCase();
  const password = normalizeString(input.password, 'Password', 200);

  const admin = await prisma.adminAccount.findFirst({
    where: {
      OR: [{ email: identifier }, { username: identifier }],
    },
  });

  if (!admin || !admin.active) {
    throw new HttpError(401, 'Invalid admin credentials');
  }

  const ok = await bcrypt.compare(password, admin.password);
  if (!ok) throw new HttpError(401, 'Invalid admin credentials');

  const safeAdmin = await prisma.adminAccount.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
    select: adminSelect,
  });

  await recordAdminAudit(safeAdmin.id, 'ADMIN_LOGIN', 'AdminAccount', safeAdmin.id);

  return {
    admin: toSafeAdmin(safeAdmin),
    token: createAdminSessionToken(safeAdmin),
    expiresIn: ADMIN_TOKEN_TTL,
  };
}

export async function resolveAdminSession(bearer: string) {
  const secret = sessionSecret();
  if (!secret) throw new HttpError(503, 'Admin auth is not configured');

  let decoded: AdminTokenPayload;
  try {
    decoded = jwt.verify(bearer, secret) as AdminTokenPayload;
  } catch {
    throw new HttpError(401, 'Invalid admin token');
  }

  if (decoded.scope !== 'admin' || !decoded.adminId) {
    throw new HttpError(403, 'Invalid admin scope');
  }

  const admin = await prisma.adminAccount.findUnique({
    where: { id: decoded.adminId },
    select: adminSelect,
  });

  if (!admin || !admin.active) {
    throw new HttpError(401, 'Admin account is inactive');
  }

  return toSafeAdmin(admin);
}

export async function getAdminMe(adminId: string) {
  const admin = await prisma.adminAccount.findUnique({
    where: { id: adminId },
    select: adminSelect,
  });
  if (!admin) throw new HttpError(404, 'Admin account not found');
  return admin;
}

export async function listManagerAdmins() {
  await ensureRootAdminAccount();
  return prisma.adminAccount.findMany({
    where: { isRoot: false },
    orderBy: { createdAt: 'desc' },
    select: adminSelect,
  });
}

export async function createManagerAdmin(
  actor: SafeAdminAccount,
  input: Record<string, unknown>
) {
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);
  const password = normalizePassword(input.password);
  const displayName = normalizeNullableString(input.displayName, 'displayName', 80);

  try {
    const admin = await prisma.adminAccount.create({
      data: {
        email,
        username,
        password: await bcrypt.hash(password, 12),
        displayName,
        role: 'MANAGER',
        isRoot: false,
        active: true,
        createdById: actor.id,
      },
      select: adminSelect,
    });

    await recordAdminAudit(actor.id, 'MANAGER_CREATED', 'AdminAccount', admin.id, {
      email: admin.email,
      username: admin.username,
    });

    return admin;
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new HttpError(409, 'Admin email or username already exists');
    }
    throw error;
  }
}

export async function updateManagerAdmin(
  actor: SafeAdminAccount,
  adminId: string,
  input: Record<string, unknown>
) {
  const target = await prisma.adminAccount.findUnique({
    where: { id: adminId },
    select: { id: true, isRoot: true, role: true },
  });

  if (!target) throw new HttpError(404, 'Admin account not found');
  if (target.isRoot || target.role !== 'MANAGER') {
    throw new HttpError(403, 'Cannot update root or super admin accounts');
  }

  const data: Prisma.AdminAccountUpdateInput = {};

  if (input.email !== undefined) data.email = normalizeEmail(input.email);
  if (input.username !== undefined) data.username = normalizeUsername(input.username);
  if (input.displayName !== undefined) {
    data.displayName = normalizeNullableString(input.displayName, 'displayName', 80);
  }
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new HttpError(400, 'Invalid active flag');
    data.active = input.active;
  }
  if (input.password !== undefined && input.password !== null && input.password !== '') {
    data.password = await bcrypt.hash(normalizePassword(input.password), 12);
  }

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, 'No fields to update');
  }

  try {
    const admin = await prisma.adminAccount.update({
      where: { id: adminId },
      data,
      select: adminSelect,
    });

    await recordAdminAudit(actor.id, 'MANAGER_UPDATED', 'AdminAccount', admin.id, {
      active: admin.active,
    });

    return admin;
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new HttpError(409, 'Admin email or username already exists');
    }
    throw error;
  }
}

export async function deleteManagerAdmin(actor: SafeAdminAccount, adminId: string) {
  const target = await prisma.adminAccount.findUnique({
    where: { id: adminId },
    select: { id: true, username: true, email: true, isRoot: true, role: true },
  });

  if (!target) throw new HttpError(404, 'Admin account not found');
  if (target.isRoot || target.role !== 'MANAGER') {
    throw new HttpError(403, 'Cannot delete root or super admin accounts');
  }

  await prisma.adminAccount.delete({ where: { id: adminId } });
  await recordAdminAudit(actor.id, 'MANAGER_DELETED', 'AdminAccount', target.id, {
    email: target.email,
    username: target.username,
  });

  return { ok: true, deletedAdmin: target };
}
