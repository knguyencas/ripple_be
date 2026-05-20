import { Router } from 'express';
import {
  deleteUser,
  getOverview,
  getUserTracking,
  listUsers,
  loginAdmin,
  refreshUserProfileClass,
  resetUserPassword,
  updateUser,
} from '../controllers/admin.controller';
import { adminAuthMiddleware } from '../middlewares/admin.middleware';

const router = Router();

router.post('/login', loginAdmin);

router.use(adminAuthMiddleware);

router.get('/overview', getOverview);
router.get('/users', listUsers);
router.get('/users/:id', getUserTracking);
router.patch('/users/:id', updateUser);
router.post('/users/:id/password', resetUserPassword);
router.post('/users/:id/profile-class/refresh', refreshUserProfileClass);
router.delete('/users/:id', deleteUser);

export default router;
