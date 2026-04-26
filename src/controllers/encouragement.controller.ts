import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as encouragementService from '../services/encouragement.service';
import { sendControllerError } from '../utils/controller.utils';

export const getEncouragement = async (req: AuthRequest, res: Response) => {
  try {
    const payload = await encouragementService.getEncouragement(req.userId!);
    return res.json(payload);
  } catch (error) {
    return sendControllerError(res, error, 'getEncouragement', 'Failed to load encouragement');
  }
};
