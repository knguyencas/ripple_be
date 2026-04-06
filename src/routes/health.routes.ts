import { Router } from 'express';
import { saveSteps, saveSleep, getSummary, getToday } from '../controllers/health.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/today', getToday);
router.get('/summary', getSummary);
router.post('/steps', saveSteps);
router.post('/sleep', saveSleep);

export default router;
