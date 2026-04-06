import { Router } from 'express';
import { uploadAudioToLog, deleteAudio } from '../controllers/audio.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { uploadAudio } from '../middlewares/upload.middleware';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

// POST /api/logs/:id/audio
router.post('/', (req, res, next) => {
  uploadAudio(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message ?? 'Upload failed' });
    next();
  });
}, uploadAudioToLog);

// DELETE /api/logs/:id/audio/:audioId
router.delete('/:audioId', deleteAudio);

export default router;
