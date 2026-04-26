import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as mediaService from '../services/media.service';
import { sendControllerError } from '../utils/controller.utils';

type UploadedFile = { path: string; filename: string };

export const uploadPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const record = await mediaService.uploadPhoto(
      req.userId!,
      req.params['id'] as string,
      req.file as UploadedFile | undefined
    );
    return res.status(201).json(record);
  } catch (error) {
    return sendControllerError(res, error, 'uploadPhoto', 'Failed to upload photo');
  }
};

export const deletePhoto = async (req: AuthRequest, res: Response) => {
  try {
    const result = await mediaService.deletePhoto(
      req.userId!,
      req.params['id'] as string,
      req.params['photoId'] as string
    );
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'deletePhoto', 'Failed to delete photo');
  }
};
