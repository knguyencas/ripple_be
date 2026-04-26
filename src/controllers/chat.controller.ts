import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as chatService from '../services/chat.service';
import { sendControllerError } from '../utils/controller.utils';

export const chatWithAI = async (req: AuthRequest, res: Response) => {
  try {
    const result = await chatService.chatWithAI(req.userId!, req.body?.messages);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'chatWithAI', 'AI service unavailable');
  }
};
