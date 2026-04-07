import { Router } from 'express';
import { uploadPhoto as uploadPhotoHandler, deletePhoto } from '../controllers/photo.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { uploadPhoto } from '../middlewares/upload.middleware';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

// POST /api/logs/:id/photo
router.post('/', (req, res, next) => {
  uploadPhoto(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message ?? 'Upload failed' });
    next();
  });
}, uploadPhotoHandler);

// DELETE /api/logs/:id/photo/:photoId
router.delete('/:photoId', deletePhoto);

export default router;
