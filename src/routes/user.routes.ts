import { Router } from 'express';
import {
  pingStreak, getStreak, getStats, getMe, updateMe, changePassword,
} from '../controllers/user.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/me', getMe);
router.put('/me', updateMe);
router.post('/streak/ping', pingStreak);
router.get('/streak', getStreak);
router.get('/stats', getStats);
router.put('/password', changePassword);

export default router;
