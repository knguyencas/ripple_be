import { Request, Response } from 'express';
import {
  registerUser,
  loginUser,
  requestPasswordReset,
  resetUserPassword,
} from '../services/auth.service';

export const register = async (req: Request, res: Response) => {
  try {
    const result = await registerUser(req.body);
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Register failed';
    res.status(400).json({ error: message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const result = await loginUser(req.body);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    res.status(400).json({ error: message });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const result = await requestPasswordReset(req.body ?? {});
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Forgot password failed';
    res.status(400).json({ error: message });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const result = await resetUserPassword(req.body ?? {});
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reset password failed';
    res.status(400).json({ error: message });
  }
};
