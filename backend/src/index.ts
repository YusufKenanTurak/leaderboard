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
const port = 5000;

// Basic middlewares
app.use(
  cors({
    origin: ['https://leaderboardprojectapi.loca.lt'], 
    methods: 'GET,POST,PUT,DELETE',
    allowedHeaders: 'Content-Type,Authorization,bypass-tunnel-reminder',
  })
);

app.use(express.json());

// Simple readiness route
app.get('/', (req, res) => {
  res.send('Leaderboard Backend is running...');
});

// Leaderboard routes
app.use('/api', leaderboardRoutes);

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on port ${port}`);
  // Attempt to initialize the leaderboard on startup
  initializeLeaderboard().catch((error) => console.error('[init error]', error));
});
