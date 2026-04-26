import { Router } from 'express';
import {
  listSounds,
  createSession,
  getToday,
  getHistory,
} from '../controllers/meditation.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/sounds', listSounds);
router.post('/sessions', createSession);
router.get('/today', getToday);
router.get('/history', getHistory);

export default router;
