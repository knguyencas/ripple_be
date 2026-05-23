import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth.routes';
import chatRoutes from './routes/chat.routes';
import logRoutes from './routes/log.routes';
import healthRoutes from './routes/health.routes';
import userRoutes from './routes/user.routes';
import waterRoutes from './routes/water.routes';
import feedbackRoutes from './routes/feedback.routes';
import encouragementRoutes from './routes/encouragement.routes';
import meditationRoutes from './routes/meditation.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/water', waterRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/encouragement', encouragementRoutes);
app.use('/api/meditation', meditationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (_req, res) => {
  res.json({ message: 'Ripple API is running' });
});

app.get('/api', (_req, res) => {
  res.json({ message: 'Ripple API is running' });
});

app.get(['/privacy', '/privacy-policy'], (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'privacy.html'));
});

export default app;
