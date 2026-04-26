import prisma from '../models/prisma';
import { cloudinary } from '../middlewares/upload.middleware';
import { HttpError } from '../utils/http-error';

interface UploadedFile {
  path: string;
  filename: string;
}

async function ensureOwnedLog(userId: string, logId: string) {
  const log = await prisma.personalLog.findFirst({ where: { id: logId, userId } });
  if (!log) throw new HttpError(404, 'Log not found');
  return log;
}

export async function uploadPhoto(userId: string, logId: string, file?: UploadedFile) {
  await ensureOwnedLog(userId, logId);
  if (!file) throw new HttpError(400, 'No photo file provided');

  const existingCount = await prisma.photoAttachment.count({ where: { logId } });
  return prisma.photoAttachment.create({
    data: {
      logId,
      userId,
      url: file.path,
      publicId: file.filename,
      order: existingCount,
    },
  });
}

export async function deletePhoto(userId: string, logId: string, photoId: string) {
  const record = await prisma.photoAttachment.findFirst({
    where: { id: photoId, logId, userId },
  });
  if (!record) throw new HttpError(404, 'Photo not found');

  await cloudinary.uploader.destroy(record.publicId, { resource_type: 'image' });
  await prisma.photoAttachment.delete({ where: { id: photoId } });

  const remaining = await prisma.photoAttachment.findMany({
    where: { logId },
    orderBy: { order: 'asc' },
  });

  await Promise.all(
    remaining.map((photo, order) =>
      prisma.photoAttachment.update({
        where: { id: photo.id },
        data: { order },
      })
    )
  );

  return { success: true };
}

export async function uploadAudio(userId: string, logId: string, file?: UploadedFile) {
  await ensureOwnedLog(userId, logId);
  if (!file) throw new HttpError(400, 'No audio file provided');

  const existingCount = await prisma.audioRecording.count({ where: { logId } });
  return prisma.audioRecording.create({
    data: {
      logId,
      userId,
      url: file.path,
      publicId: file.filename,
      label: `Ghi âm ${existingCount + 1}`,
    },
  });
}

export async function deleteAudio(userId: string, logId: string, audioId: string) {
  const record = await prisma.audioRecording.findFirst({
    where: { id: audioId, logId, userId },
  });
  if (!record) throw new HttpError(404, 'Audio recording not found');

  await cloudinary.uploader.destroy(record.publicId, { resource_type: 'video' });
  await prisma.audioRecording.delete({ where: { id: audioId } });

  const remaining = await prisma.audioRecording.findMany({
    where: { logId },
    orderBy: { createdAt: 'asc' },
  });

  await Promise.all(
    remaining.map((audio, index) =>
      prisma.audioRecording.update({
        where: { id: audio.id },
        data: { label: `Ghi âm ${index + 1}` },
      })
    )
  );

  return { success: true };
}
