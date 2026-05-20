import { Request, Response } from 'express';
import {
  createAdminSessionToken,
  isAdminAuthConfigured,
  validateAdminCredential,
} from '../middlewares/admin.middleware';
import * as adminService from '../services/admin.service';
import { sendControllerError } from '../utils/controller.utils';

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

export const loginAdmin = async (req: Request, res: Response) => {
  try {
    if (!isAdminAuthConfigured()) {
      return res.status(503).json({
        error: 'Admin auth is not configured. Set ADMIN_PASSWORD or ADMIN_TOKEN.',
      });
    }

    if (!validateAdminCredential(req.body?.password)) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    return res.json({
      token: createAdminSessionToken(),
      expiresIn: '12h',
    });
  } catch (error) {
    return sendControllerError(res, error, 'loginAdmin', 'Admin login failed');
  }
};

export const getOverview = async (req: Request, res: Response) => {
  try {
    const result = await adminService.getAdminOverview(req.query.days);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'getAdminOverview', 'Failed to fetch admin overview');
  }
};

export const listUsers = async (req: Request, res: Response) => {
  try {
    const result = await adminService.listAdminUsers({
      q: req.query.q,
      page: req.query.page,
      limit: req.query.limit,
      profileClass: req.query.profileClass,
    });
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'listAdminUsers', 'Failed to fetch users');
  }
};

export const getUserTracking = async (req: Request, res: Response) => {
  try {
    const result = await adminService.getAdminUserTracking(paramValue(req.params.id), req.query.days);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'getAdminUserTracking', 'Failed to fetch user tracking');
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const result = await adminService.updateAdminUser(paramValue(req.params.id), req.body ?? {});
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'updateAdminUser', 'Failed to update user');
  }
};

export const resetUserPassword = async (req: Request, res: Response) => {
  try {
    const result = await adminService.resetAdminUserPassword(paramValue(req.params.id), req.body ?? {});
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'resetAdminUserPassword', 'Failed to reset user password');
  }
};

export const refreshUserProfileClass = async (req: Request, res: Response) => {
  try {
    const result = await adminService.refreshAdminUserProfileClass(paramValue(req.params.id));
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'refreshAdminUserProfileClass', 'Failed to refresh profile class');
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const result = await adminService.deleteAdminUser(paramValue(req.params.id));
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'deleteAdminUser', 'Failed to delete user');
  }
};
