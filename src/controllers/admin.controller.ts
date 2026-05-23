import { Request, Response } from 'express';
import {
  createManagerAdmin,
  deleteManagerAdmin,
  getAdminMe,
  listManagerAdmins,
  loginAdminAccount,
  recordAdminAudit,
  updateManagerAdmin,
} from '../services/admin-account.service';
import { listActiveRecoveryRequests } from '../services/account-recovery.service';
import * as adminService from '../services/admin.service';
import { sendControllerError } from '../utils/controller.utils';

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? '';
}

export const loginAdmin = async (req: Request, res: Response) => {
  try {
    const result = await loginAdminAccount(req.body ?? {});
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'loginAdmin', 'Admin login failed');
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    if (!req.admin) return res.status(401).json({ error: 'Missing admin session' });
    const admin = await getAdminMe(req.admin.id);
    return res.json({ admin });
  } catch (error) {
    return sendControllerError(res, error, 'getAdminMe', 'Failed to fetch admin profile');
  }
};

export const listAdmins = async (_req: Request, res: Response) => {
  try {
    const admins = await listManagerAdmins();
    return res.json({ items: admins });
  } catch (error) {
    return sendControllerError(res, error, 'listAdmins', 'Failed to fetch admin accounts');
  }
};

export const createAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.admin) return res.status(401).json({ error: 'Missing admin session' });
    const admin = await createManagerAdmin(req.admin, req.body ?? {});
    return res.status(201).json({ admin });
  } catch (error) {
    return sendControllerError(res, error, 'createAdmin', 'Failed to create admin account');
  }
};

export const updateAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.admin) return res.status(401).json({ error: 'Missing admin session' });
    const admin = await updateManagerAdmin(req.admin, paramValue(req.params.id), req.body ?? {});
    return res.json({ admin });
  } catch (error) {
    return sendControllerError(res, error, 'updateAdmin', 'Failed to update admin account');
  }
};

export const deleteAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.admin) return res.status(401).json({ error: 'Missing admin session' });
    const result = await deleteManagerAdmin(req.admin, paramValue(req.params.id));
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'deleteAdmin', 'Failed to delete admin account');
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
      alertLevel: req.query.alertLevel,
      phqBand: req.query.phqBand,
      keyword: req.query.keyword,
    });
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'listAdminUsers', 'Failed to fetch users');
  }
};

export const listRecoveryRequests = async (_req: Request, res: Response) => {
  try {
    const items = await listActiveRecoveryRequests();
    return res.json({ items });
  } catch (error) {
    return sendControllerError(res, error, 'listRecoveryRequests', 'Failed to fetch recovery requests');
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
    const userId = paramValue(req.params.id);
    const result = await adminService.updateAdminUser(userId, req.body ?? {});
    await recordAdminAudit(req.admin?.id ?? null, 'USER_UPDATED', 'User', userId, {
      fields: Object.keys(req.body ?? {}),
    });
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'updateAdminUser', 'Failed to update user');
  }
};

export const resetUserPassword = async (req: Request, res: Response) => {
  try {
    const userId = paramValue(req.params.id);
    const result = await adminService.resetAdminUserPassword(userId, req.body ?? {}, {
      actorAdminId: req.admin?.id ?? null,
      requireVerifiedRecoveryRequest: !req.admin?.isRoot,
    });
    await recordAdminAudit(req.admin?.id ?? null, 'USER_PASSWORD_RESET', 'User', userId, {
      actorRole: req.admin?.role,
      requiredUserRequest: !req.admin?.isRoot,
    });
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'resetAdminUserPassword', 'Failed to reset user password');
  }
};

export const refreshUserProfileClass = async (req: Request, res: Response) => {
  try {
    const userId = paramValue(req.params.id);
    const result = await adminService.refreshAdminUserProfileClass(userId);
    await recordAdminAudit(req.admin?.id ?? null, 'USER_PROFILE_CLASS_REFRESHED', 'User', userId, {
      profileClass: result.cls,
    });
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'refreshAdminUserProfileClass', 'Failed to refresh profile class');
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const userId = paramValue(req.params.id);
    const result = await adminService.deleteAdminUser(userId);
    await recordAdminAudit(req.admin?.id ?? null, 'USER_DELETED', 'User', userId, {
      username: result.deletedUser.username,
      email: result.deletedUser.email,
    });
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'deleteAdminUser', 'Failed to delete user');
  }
};
