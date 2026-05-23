import { Router } from 'express';
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  requestPinRecovery,
} from '../controllers/auth.controller';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/recovery/pin/verify', requestPinRecovery);

export default router;
