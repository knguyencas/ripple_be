import { Router } from 'express';
import { getEncouragement } from '../controllers/encouragement.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);
router.get('/', getEncouragement);

export default router;
