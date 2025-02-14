/**
 * This file handles all scheduled cron jobs, such as periodic delta syncs and weekly distributions.
 */

import cron from 'node-cron';
import { initializeLeaderboard, syncOnePageOfNewPlayers, distributeWeeklyRewards } from '../services/leaderboardService';
import { isProcessing } from '../services/leaderboardService';

/**
 * This cron job runs every 10 seconds to perform a paged delta sync of new players.
 */
cron.schedule('*/10 * * * * *', async () => {
  if (isProcessing()) {
    console.log('[cron delta] Skipping because another process is running...');
    return;
  }

  try {
    // Attempt up to 5 pages per cron trigger
    for (let j = 0; j < 5; j++) {
      const done = await syncOnePageOfNewPlayers();
      if (done) {
        break;
      }
    }
  } catch (error) {
    console.error('[cron delta] Error:', error);
  }
});

/**
 * This cron job runs once a week (Sunday at 00:00) to distribute weekly rewards
 * to the top 100 players.
 */
cron.schedule('0 0 * * 0', async () => {
  if (isProcessing()) {
    console.log('[weeklyDist] Skipping because another process is running...');
    return;
  }

  try {
    console.log('[weeklyDist] Starting weekly distribution...');
    await distributeWeeklyRewards();
    console.log('[weeklyDist] Weekly distribution complete. Re-initializing leaderboard...');
    await initializeLeaderboard();
  } catch (error) {
    console.error('[weeklyDist] Error:', error);
  }
});
