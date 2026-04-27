import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as notificationService from '../services/notification.service';
import { sendControllerError } from '../utils/controller.utils';

export const listNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const result = await notificationService.listNotifications(req.userId!, req.query.limit);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'notification.list', 'Failed to list notifications');
  }
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  try {
    const result = await notificationService.markNotificationRead(req.userId!, String(req.params.id));
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'notification.markRead', 'Failed to mark notification read');
  }
};

export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  try {
    const result = await notificationService.markAllNotificationsRead(req.userId!);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'notification.markAllRead', 'Failed to mark notifications read');
  }
};
