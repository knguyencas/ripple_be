import { Router } from 'express';
import {
  pingStreak,
  getStreak,
  getStats,
  getMe,
  updateMe,
  updateAvatar,
  updateMediaKey,
  updateRecoveryPin,
  changePassword,
  resetPin,
} from '../controllers/user.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { uploadAvatar } from '../middlewares/upload.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/me', getMe);
router.put('/me', updateMe);
router.post('/avatar', (req, res, next) => {
  uploadAvatar(req, res, (err: any) => {
    if (err) {
      console.error('[avatar upload] multer/cloudinary error:', {
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
    next();
  });
}, updateAvatar);
router.put('/media-key', updateMediaKey);
router.put('/recovery-pin', updateRecoveryPin);
router.post('/streak/ping', pingStreak);
router.get('/streak', getStreak);
router.get('/stats', getStats);
router.put('/password', changePassword);
router.post('/pin/reset', resetPin);

export default router;
