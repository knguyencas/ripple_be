import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as waterService from '../services/water.service';
import { sendControllerError } from '../utils/controller.utils';

export const getToday = async (req: AuthRequest, res: Response) => {
  try {
    const result = await waterService.getWaterToday(req.userId!, req.query.localDate);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'water.getToday', 'Failed to fetch water intake');
  }
};

export const setToday = async (req: AuthRequest, res: Response) => {
  try {
    const result = await waterService.setWaterToday(req.userId!, req.body ?? {});
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'water.setToday', 'Failed to save water intake');
  }
};

export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const result = await waterService.getWaterHistory(req.userId!, req.query.days);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'water.getHistory', 'Failed to fetch water history');
  }
};
