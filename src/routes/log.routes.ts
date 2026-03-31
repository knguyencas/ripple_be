import { Router } from 'express';
import { createLog, getLogs, getStats, getRecentLogs, getLog, updateLog, getTodayLog } from '../controllers/log.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/today', getTodayLog);
router.get('/stats', getStats);
router.get('/recent', getRecentLogs);
router.get('/', getLogs);
router.post('/', createLog);
router.get('/:id', getLog);
router.put('/:id', updateLog);

export default router;