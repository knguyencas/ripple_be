import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

interface AdminTokenPayload extends jwt.JwtPayload {
  scope?: string;
}

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || '';
}

function adminToken() {
  return process.env.ADMIN_TOKEN?.trim() || '';
}

function sessionSecret() {
  return (
    process.env.ADMIN_JWT_SECRET ||
    process.env.JWT_SECRET ||
    adminToken() ||
    adminPassword()
  );
}

export function isAdminAuthConfigured() {
  return Boolean(adminPassword() || adminToken());
}

export function validateAdminCredential(value: unknown) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return false;

  const password = adminPassword();
  const token = adminToken();

  return Boolean(
    (password && safeEquals(candidate, password)) ||
    (token && safeEquals(candidate, token))
  );
}

export function createAdminSessionToken() {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error('Admin auth is not configured');
  }

  return jwt.sign({ scope: 'admin' }, secret, { expiresIn: '12h' });
}

export function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!isAdminAuthConfigured()) {
    return res.status(503).json({
      error: 'Admin auth is not configured. Set ADMIN_PASSWORD or ADMIN_TOKEN.',
    });
  }

  const bearer = req.headers.authorization?.split(' ')[1];
  if (!bearer) return res.status(401).json({ error: 'Missing admin token' });

  const rawToken = adminToken();
  if (rawToken && safeEquals(bearer, rawToken)) {
    return next();
  }

  try {
    const decoded = jwt.verify(bearer, sessionSecret()) as AdminTokenPayload;
    if (decoded.scope !== 'admin') {
      return res.status(403).json({ error: 'Invalid admin scope' });
    }
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
}
