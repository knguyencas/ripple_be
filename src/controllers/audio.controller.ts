import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as mediaService from '../services/media.service';
import { sendControllerError } from '../utils/controller.utils';

type UploadedFile = { path: string; filename: string; mimetype?: string };

export const uploadAudioToLog = async (req: AuthRequest, res: Response) => {
  try {
    const record = await mediaService.uploadAudio(
      req.userId!,
      req.params['id'] as string,
      req.file as UploadedFile | undefined,
      req.body ?? {}
    );
    return res.status(201).json(record);
  } catch (error) {
    return sendControllerError(res, error, 'uploadAudio', 'Failed to upload audio');
  }
};

export const deleteAudio = async (req: AuthRequest, res: Response) => {
  try {
    const result = await mediaService.deleteAudio(
      req.userId!,
      req.params['id'] as string,
      req.params['audioId'] as string
    );
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, 'deleteAudio', 'Failed to delete audio');
  }
};
