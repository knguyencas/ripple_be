import { Router } from 'express';
import { createLog, getLogs, getStats, getRecentLogs } from '../controllers/log.controller';
import { authMiddleware} from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/', createLog);
router.get('/', getLogs);
router.get('/stats', getStats);
router.get('/recent', getRecentLogs);

export default router;