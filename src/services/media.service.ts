import prisma from '../models/prisma';
import { cloudinary } from '../middlewares/upload.middleware';
import { HttpError } from '../utils/http-error';

interface UploadedFile {
  path: string;
  filename: string;
  mimetype?: string;
}

interface MediaUploadMetadata {
  encrypted?: boolean | string;
  iv?: string;
  mimeType?: string;
}

type CloudinaryResourceType = 'image' | 'video' | 'raw';

async function ensureOwnedLog(userId: string, logId: string) {
  const log = await prisma.personalLog.findFirst({ where: { id: logId, userId } });
  if (!log) throw new HttpError(404, 'Log not found');
  return log;
}

function normalizeMetadata(
  file: UploadedFile,
  fallbackResourceType: 'image' | 'video',
  metadata: MediaUploadMetadata = {}
) {
  const encrypted =
    metadata.encrypted === true ||
    metadata.encrypted === 'true' ||
    file.mimetype === 'application/octet-stream';
  const iv = typeof metadata.iv === 'string' ? metadata.iv : null;
  const mimeType = typeof metadata.mimeType === 'string' ? metadata.mimeType : null;

  if (encrypted && (!iv || !mimeType)) {
    throw new HttpError(400, 'Missing encrypted media metadata');
  }

  return {
    encrypted,
    iv,
    mimeType,
    resourceType: encrypted ? 'raw' : fallbackResourceType,
  };
}

function cloudinaryResourceType(
  record: { encrypted?: boolean; resourceType?: string | null },
  fallback: Exclude<CloudinaryResourceType, 'raw'>
): CloudinaryResourceType {
  const { resourceType } = record;
  if (resourceType === 'image' || resourceType === 'video' || resourceType === 'raw') {
    return resourceType;
  }
  return record.encrypted ? 'raw' : fallback;
}

export async function uploadPhoto(userId: string, logId: string, file?: UploadedFile, metadata?: MediaUploadMetadata) {
  await ensureOwnedLog(userId, logId);
  if (!file) throw new HttpError(400, 'No photo file provided');
  const normalized = normalizeMetadata(file, 'image', metadata);

  const existingCount = await prisma.photoAttachment.count({ where: { logId } });
  return prisma.photoAttachment.create({
    data: {
      logId,
      userId,
      url: file.path,
      publicId: file.filename,
      order: existingCount,
      encrypted: normalized.encrypted,
      iv: normalized.iv,
      mimeType: normalized.mimeType,
      resourceType: normalized.resourceType,
    },
  });
}

export async function deletePhoto(userId: string, logId: string, photoId: string) {
  const record = await prisma.photoAttachment.findFirst({
    where: { id: photoId, logId, userId },
  });
  if (!record) throw new HttpError(404, 'Photo not found');

  await cloudinary.uploader.destroy(record.publicId, {
    resource_type: cloudinaryResourceType(record, 'image'),
  });
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

export async function uploadAudio(userId: string, logId: string, file?: UploadedFile, metadata?: MediaUploadMetadata) {
  await ensureOwnedLog(userId, logId);
  if (!file) throw new HttpError(400, 'No audio file provided');
  const normalized = normalizeMetadata(file, 'video', metadata);

  const existingCount = await prisma.audioRecording.count({ where: { logId } });
  return prisma.audioRecording.create({
    data: {
      logId,
      userId,
      url: file.path,
      publicId: file.filename,
      label: `Ghi âm ${existingCount + 1}`,
      encrypted: normalized.encrypted,
      iv: normalized.iv,
      mimeType: normalized.mimeType,
      resourceType: normalized.resourceType,
    },
  });
}

export async function deleteAudio(userId: string, logId: string, audioId: string) {
  const record = await prisma.audioRecording.findFirst({
    where: { id: audioId, logId, userId },
  });
  if (!record) throw new HttpError(404, 'Audio recording not found');

  await cloudinary.uploader.destroy(record.publicId, {
    resource_type: cloudinaryResourceType(record, 'video'),
  });
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
