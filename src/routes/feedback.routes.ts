import { Router } from 'express';
import { submitFeedback } from '../controllers/feedback.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);
router.post('/', submitFeedback);

export default router;
