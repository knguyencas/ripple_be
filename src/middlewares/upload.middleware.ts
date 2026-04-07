import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key:    process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const audioStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'ripple/audio',
    resource_type:   'video',
    allowed_formats: ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'webm', 'caf'],
  } as any,
});

const photoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'ripple/photos',
    resource_type:   'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
    transformation:  [{ quality: 'auto', fetch_format: 'auto' }],
  } as any,
});

export const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
}).single('audio');

export const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('photo');

export { cloudinary };
