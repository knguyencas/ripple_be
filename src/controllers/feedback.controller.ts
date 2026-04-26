import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as feedbackService from '../services/feedback.service';
import { sendControllerError } from '../utils/controller.utils';

export const submitFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const result = await feedbackService.submitFeedback(req.userId!, req.body ?? {});
    return res.status(201).json(result);
  } catch (error) {
    return sendControllerError(res, error, 'submitFeedback', 'Failed to submit feedback');
  }
};
