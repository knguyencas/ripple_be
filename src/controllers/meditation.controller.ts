import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as meditationService from '../services/meditation.service';
import { sendControllerError } from '../utils/controller.utils';

export const listSounds = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await meditationService.listSounds();
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'meditation.listSounds', 'Failed to list sounds');
  }
};

export const createSession = async (req: AuthRequest, res: Response) => {
  try {
    const session = await meditationService.createSession(req.userId!, req.body ?? {});
    return res.status(201).json(session);
  } catch (error) {
    return sendControllerError(res, error, 'meditation.createSession', 'Failed to create session');
  }
};

export const getToday = async (req: AuthRequest, res: Response) => {
  try {
    const result = await meditationService.getToday(req.userId!, req.query.localDate);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'meditation.getToday', 'Failed to fetch today meditation');
  }
};

export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const result = await meditationService.getHistory(req.userId!, req.query.days);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'meditation.getHistory', 'Failed to fetch meditation history');
  }
};
