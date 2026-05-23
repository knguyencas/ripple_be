import { Router } from 'express';
import {
  createAdmin,
  deleteAdmin,
  getMe,
  deleteUser,
  getOverview,
  getUserTracking,
  listRecoveryRequests,
  listAdmins,
  listUsers,
  loginAdmin,
  refreshUserProfileClass,
  resetUserPassword,
  updateAdmin,
  updateUser,
} from '../controllers/admin.controller';
import { adminAuthMiddleware, requireRootAdmin } from '../middlewares/admin.middleware';

const router = Router();

router.post('/login', loginAdmin);

router.use(adminAuthMiddleware);

router.get('/me', getMe);
router.get('/overview', getOverview);
router.get('/recovery-requests', listRecoveryRequests);
router.get('/users', listUsers);
router.get('/users/:id', getUserTracking);
router.patch('/users/:id', updateUser);
router.post('/users/:id/password', resetUserPassword);
router.post('/users/:id/profile-class/refresh', refreshUserProfileClass);
router.delete('/users/:id', requireRootAdmin, deleteUser);

router.get('/admins', requireRootAdmin, listAdmins);
router.post('/admins', requireRootAdmin, createAdmin);
router.patch('/admins/:id', requireRootAdmin, updateAdmin);
router.delete('/admins/:id', requireRootAdmin, deleteAdmin);

export default router;
