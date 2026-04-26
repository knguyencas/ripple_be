import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as userService from '../services/user.service';
import * as streakService from '../services/streak.service';
import { sendControllerError } from '../utils/controller.utils';

export const pingStreak = async (req: AuthRequest, res: Response) => {
  try {
    const result = await streakService.pingUserStreak(req.userId!, req.body?.localDate);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'pingStreak', 'Failed to ping streak');
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await userService.getUserProfile(req.userId!);
    return res.json(user);
  } catch (error) {
    return sendControllerError(res, error, 'getMe', 'Failed to fetch user');
  }
};

export const updateMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await userService.updateUserProfile(req.userId!, req.body ?? {});
    return res.json(user);
  } catch (error) {
    return sendControllerError(res, error, 'updateMe', 'Failed to update user');
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const result = await userService.changeUserPassword(req.userId!, req.body ?? {});
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'changePassword', 'Failed to change password');
  }
};

export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = await userService.getUserStats(req.userId!);
    return res.json(stats);
  } catch (error) {
    return sendControllerError(res, error, 'getStats', 'Failed to fetch stats');
  }
};

export const getStreak = async (req: AuthRequest, res: Response) => {
  try {
    const streak = await streakService.getUserStreak(req.userId!);
    return res.json(streak);
  } catch (error) {
    return sendControllerError(res, error, 'getStreak', 'Failed to fetch streak');
  }
};
