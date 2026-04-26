import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as healthService from '../services/health.service';
import { sendControllerError } from '../utils/controller.utils';

export const saveSteps = async (req: AuthRequest, res: Response) => {
  try {
    const record = await healthService.saveSteps(req.userId!, req.body ?? {});
    return res.status(201).json(record);
  } catch (error) {
    return sendControllerError(res, error, 'saveSteps', 'Failed to save steps');
  }
};

export const saveSleep = async (req: AuthRequest, res: Response) => {
  try {
    const session = await healthService.saveSleep(req.userId!, req.body ?? {});
    return res.status(201).json(session);
  } catch (error) {
    return sendControllerError(res, error, 'saveSleep', 'Failed to save sleep session');
  }
};

export const getSummary = async (req: AuthRequest, res: Response) => {
  try {
    const summary = await healthService.getHealthSummary(req.userId!, req.query.days);
    return res.json(summary);
  } catch (error) {
    return sendControllerError(res, error, 'getSummary', 'Failed to get health summary');
  }
};

export const getToday = async (req: AuthRequest, res: Response) => {
  try {
    const today = await healthService.getHealthToday(req.userId!);
    return res.json(today);
  } catch (error) {
    return sendControllerError(res, error, 'getToday', 'Failed to get today health data');
  }
};
