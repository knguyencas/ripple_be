import { Router } from 'express';
import { chatWithAI } from '../controllers/chat.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authMiddleware, chatWithAI);

export default router;