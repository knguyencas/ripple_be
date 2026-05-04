import { Router } from 'express';
import { uploadPhoto as uploadPhotoHandler, deletePhoto } from '../controllers/photo.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { uploadPhoto } from '../middlewares/upload.middleware';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.post('/', (req, res, next) => {
  uploadPhoto(req, res, (err: any) => {
    if (err) {
      console.error('[photo upload] multer/cloudinary error:', {
        code: err.code,
        message: err.message,
        field: err.field,
        name: err.name,
        http_code: err.http_code,
      });
      return res.status(400).json({
        error: err.message ?? 'Upload failed',
        code: err.code,
      });
    }
    if (!req.file) {
      console.warn('[photo upload] no file on request after multer');
    }
    next();
  });
}, uploadPhotoHandler);

// DELETE /api/logs/:id/photo/:photoId
router.delete('/:photoId', deletePhoto);

export default router;
