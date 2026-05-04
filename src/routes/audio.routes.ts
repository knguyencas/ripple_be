import { Router } from 'express';
import { uploadAudioToLog, deleteAudio } from '../controllers/audio.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { uploadAudio } from '../middlewares/upload.middleware';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.post('/', (req, res, next) => {
  uploadAudio(req, res, (err: any) => {
    if (err) {
      console.error('[audio upload] multer/cloudinary error:', {
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
      console.warn('[audio upload] no file on request after multer');
    }
    next();
  });
}, uploadAudioToLog);

// DELETE /api/logs/:id/audio/:audioId
router.delete('/:audioId', deleteAudio);

export default router;
