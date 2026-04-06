import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { cloudinary } from '../middlewares/upload.middleware';

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  userId?: string;
}

// POST /api/logs/:id/audio
export const uploadAudioToLog = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const logId  = req.params['id'];

    const log = await prisma.personalLog.findFirst({
      where: { id: logId, userId },
    });
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const file = req.file as any;
    if (!file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const existingCount = await prisma.audioRecording.count({
      where: { logId },
    });

    const record = await prisma.audioRecording.create({
      data: {
        logId,
        userId,
        url:      file.path,
        publicId: file.filename,
        label:    `Ghi âm ${existingCount + 1}`,
      },
    });

    return res.status(201).json(record);
  } catch (error) {
    console.error('uploadAudio error:', error);
    return res.status(500).json({ error: 'Failed to upload audio' });
  }
};

// DELETE /api/logs/:id/audio/:audioId
export const deleteAudio = async (req: AuthRequest, res: Response) => {
  try {
    const userId  = req.userId!;
    const logId   = req.params['id'];
    const audioId = req.params['audioId'];

    const record = await prisma.audioRecording.findFirst({
      where: { id: audioId, logId, userId },
    });
    if (!record) {
      return res.status(404).json({ error: 'Audio recording not found' });
    }

    await cloudinary.uploader.destroy(record.publicId, { resource_type: 'video' });
    await prisma.audioRecording.delete({ where: { id: audioId } });

    const remaining = await prisma.audioRecording.findMany({
      where: { logId },
      orderBy: { createdAt: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      await prisma.audioRecording.update({
        where: { id: remaining[i].id },
        data:  { label: `Ghi âm ${i + 1}` },
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('deleteAudio error:', error);
    return res.status(500).json({ error: 'Failed to delete audio' });
  }
};
