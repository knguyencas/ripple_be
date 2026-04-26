import { Router } from 'express';
import { getToday, setToday, getHistory } from '../controllers/water.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/today', getToday);
router.put('/', setToday);
router.get('/history', getHistory);

export default router;
