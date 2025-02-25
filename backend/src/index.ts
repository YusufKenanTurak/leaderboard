/**
 * Main entry point for the backend application.
 * It sets up the Express server, loads environment variables, and initiates the leaderboard system.
 */

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

import { ensureSchemaExists } from './config/schema';
import leaderboardRoutes from './routes/leaderboardRoutes';
import { initializeLeaderboard } from './services/leaderboardService';

// Import cron jobs so that they are registered on startup
import './cron/jobs';

dotenv.config();

const app = express();
const port: number = Number(process.env.PORT) || 5000;

app.use(
  cors({
    origin: '*',
    methods: 'GET,POST,PUT,DELETE',
    allowedHeaders: 'Content-Type,Authorization,bypass-tunnel-reminder',
  })
);

app.use(express.json());

app.get('/', (req, res) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  res.send('Leaderboard Backend is running...');
});

app.use('/api', leaderboardRoutes);

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on port ${port}`);
  initializeLeaderboard().catch((error) => console.error('[init error]', error));
});
