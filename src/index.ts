import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import chatRoutes from './routes/chat.routes';
import logRoutes from './routes/log.routes';



dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/logs', logRoutes);


app.get('/', (req, res) => {
  res.json({ message: 'Ripple API is running 🌊' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});