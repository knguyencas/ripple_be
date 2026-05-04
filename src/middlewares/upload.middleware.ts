import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key:    process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const uploadStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req: any, file: Express.Multer.File) => {
    const encrypted =
      file.mimetype === 'application/octet-stream' ||
      file.originalname.toLowerCase().endsWith('.enc.txt');

    if (encrypted) {
      return {
        folder: 'ripple/encrypted-media',
        resource_type: 'raw',
        format: 'txt',
      } as any;
    }

    if (file.fieldname === 'audio') {
      return {
        folder:          'ripple/audio',
        resource_type:   'video',
        allowed_formats: ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'webm', 'caf'],
      } as any;
    }

    if (file.fieldname === 'avatar') {
      return {
        folder:          'ripple/avatars',
        resource_type:   'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
        transformation:  [{ width: 512, height: 512, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }],
      } as any;
    }

    return {
      folder:          'ripple/photos',
      resource_type:   'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
      transformation:  [{ quality: 'auto', fetch_format: 'auto' }],
    } as any;
  },
});

export const uploadAudio = multer({
  storage: uploadStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
}).single('audio');

export const uploadPhoto = multer({
  storage: uploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('photo');

export const uploadAvatar = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('avatar');

export { cloudinary };
