import { NextFunction, Request, Response } from 'express';
import {
  ensureRootAdminAccount,
  resolveAdminSession,
  type SafeAdminAccount,
} from '../services/admin-account.service';
import { errorResponse } from '../utils/http-error';

declare global {
  namespace Express {
    interface Request {
      admin?: SafeAdminAccount;
    }
  }
}

export async function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const root = await ensureRootAdminAccount();
    if (!root) {
      return res.status(503).json({
        error: 'Admin root account is not configured. Set ADMIN_ROOT_PASSWORD or ADMIN_PASSWORD.',
      });
    }

    const bearer = req.headers.authorization?.split(' ')[1];
    if (!bearer) return res.status(401).json({ error: 'Missing admin token' });

    req.admin = await resolveAdminSession(bearer);
    return next();
  } catch (error) {
    const response = errorResponse(error, 'Invalid admin token');
    return res.status(response.status).json({ error: response.message });
  }
}

export function requireRootAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.admin?.isRoot) {
    return res.status(403).json({ error: 'Only root admin can manage admin accounts' });
  }
  return next();
}
