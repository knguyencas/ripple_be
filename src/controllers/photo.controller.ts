import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { cloudinary } from '../middlewares/upload.middleware';

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  userId?: string;
}

// POST /api/logs/:id/photo
export const uploadPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const logId  = req.params['id'] as string;

    const log = await prisma.personalLog.findFirst({
      where: { id: logId, userId },
    });
    if (!log) return res.status(404).json({ error: 'Log not found' });

    const file = req.file as any;
    if (!file) return res.status(400).json({ error: 'No photo file provided' });

    const existingCount = await prisma.photoAttachment.count({ where: { logId } });

    const record = await prisma.photoAttachment.create({
      data: {
        logId,
        userId,
        url:      file.path,
        publicId: file.filename,
        order:    existingCount,
      },
    });

    return res.status(201).json(record);
  } catch (error) {
    console.error('uploadPhoto error:', error);
    return res.status(500).json({ error: 'Failed to upload photo' });
  }
};

// DELETE /api/logs/:id/photo/:photoId
export const deletePhoto = async (req: AuthRequest, res: Response) => {
  try {
    const userId  = req.userId!;
    const logId   = req.params['id']     as string;
    const photoId = req.params['photoId'] as string;

    const record = await prisma.photoAttachment.findFirst({
      where: { id: photoId, logId, userId },
    });
    if (!record) return res.status(404).json({ error: 'Photo not found' });

    await cloudinary.uploader.destroy(record.publicId, { resource_type: 'image' });
    await prisma.photoAttachment.delete({ where: { id: photoId } });

    const remaining = await prisma.photoAttachment.findMany({
      where: { logId },
      orderBy: { order: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      await prisma.photoAttachment.update({
        where: { id: remaining[i].id },
        data:  { order: i },
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('deletePhoto error:', error);
    return res.status(500).json({ error: 'Failed to delete photo' });
  }
};
