/**
 * This file is the main entry point of the backend application.
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
const port = process.env.PORT || 5000;

// Basic middlewares
app.use(cors());
app.use(express.json());

// Simple readiness route
app.get('/', (req, res) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  res.send('Leaderboard Backend is running...');
});

// Leaderboard routes
app.use('/api', leaderboardRoutes);

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
  // Attempt to initialize the leaderboard on startup
  initializeLeaderboard().catch((error) => console.error('[init error]', error));
});
