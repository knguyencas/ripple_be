import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as logService from '../services/log.service';
import { sendControllerError } from '../utils/controller.utils';

export const createLog = async (req: AuthRequest, res: Response) => {
  try {
    const log = await logService.createLog(req.userId!, req.body);
    return res.status(201).json(log);
  } catch (error) {
    return sendControllerError(res, error, 'createLog', 'Failed to create log');
  }
};

export const getLogs = async (req: AuthRequest, res: Response) => {
  try {
    const logs = await logService.getLogs(req.userId!, req.query.limit, req.query.offset);
    return res.json(logs);
  } catch (error) {
    return sendControllerError(res, error, 'getLogs', 'Failed to get logs');
  }
};

export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = await logService.getLogStats(req.userId!);
    return res.json(stats);
  } catch (error) {
    return sendControllerError(res, error, 'getStats', 'Failed to get stats');
  }
};

export const getRecentLogs = async (req: AuthRequest, res: Response) => {
  try {
    const logs = await logService.getRecentLogs(req.userId!);
    return res.json(logs);
  } catch (error) {
    return sendControllerError(res, error, 'getRecentLogs', 'Failed to get recent logs');
  }
};

export const getLog = async (req: AuthRequest, res: Response) => {
  try {
    const log = await logService.getLogById(req.userId!, req.params['id'] as string);
    return res.json(log);
  } catch (error) {
    return sendControllerError(res, error, 'getLog', 'Failed to get log');
  }
};

export const updateLog = async (req: AuthRequest, res: Response) => {
  try {
    const updated = await logService.updateLog(req.userId!, req.params['id'] as string, req.body);
    return res.json(updated);
  } catch (error) {
    return sendControllerError(res, error, 'updateLog', 'Failed to update log');
  }
};

export const getTodayLog = async (req: AuthRequest, res: Response) => {
  try {
    const log = await logService.getTodayLog(req.userId!);
    return res.json({ log });
  } catch (error) {
    return sendControllerError(res, error, 'getTodayLog', 'Failed to check today log');
  }
};

export const deleteLog = async (req: AuthRequest, res: Response) => {
  try {
    const result = await logService.deleteLog(req.userId!, req.params['id'] as string);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'deleteLog', 'Failed to delete log');
  }
};
