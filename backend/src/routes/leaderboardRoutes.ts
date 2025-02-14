/**
 * leaderboardRoutes.ts
 * Express routes for leaderboard operations (group by country, normal scoreboard, autocomplete).
 */

import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { redis } from '../db';
import { db } from '../db';
import { getLeaderboardData, autocompletePlayers } from '../services/leaderboardService';
// Eğer "isProcessing()" varsa import edin:
// import { isProcessing } from '../services/leaderboardService';

const router = Router();

/**
 * GET /api/leaderboard
 * - If ?group=1 => grouped by country (top 10 each).
 * - Otherwise => normal scoreboard (top100 + near the searched player).
 * - If init not done or concurrency lock => 503.
 */
router.get('/leaderboard', asyncHandler(async (req, res) => {
  // 1) initDone kontrolü
  const initDone = await redis.get('leaderboard:init_done');
  // 2) concurrency lock kontrolü (opsiyonel)
  // const locked = isProcessing();

  if (!initDone /* || locked */) {
    return res.status(503).json({
      error: 'IndexingInProgress',
      message: 'We are indexing data. Please try a few minutes later.'
    });
  }

  // 3) group=1 mi?
  const group = req.query.group === '1';
  if (group) {
    // "Group by Country" sorgusu => her ülkenin en yüksek paraya sahip ilk 10 oyuncusu
    // ve bunların ülke içindeki rank(1..10) değeri.
    const sql = `
      SELECT sub.id,
             sub.name,
             sub.country,
             sub.money,
             sub.rank
      FROM (
        SELECT p.id,
               p.name,
               c.name AS country,
               p.money,
               ROW_NUMBER() OVER (
                 PARTITION BY p.country_id
                 ORDER BY p.money DESC
               ) AS rank
        FROM public.players p
        JOIN public.countries c ON p.country_id = c.id
      ) sub
      WHERE sub.rank <= 10
      ORDER BY sub.country, sub.rank;
    `;
    const { rows } = await db.query(sql);
    return res.json(rows);
  }

  // 4) Normal scoreboard => top 100 + near the searched player
  const playerId = req.query.playerId as string | undefined;
  const result = await getLeaderboardData(playerId);
  return res.json(result);
}));

/**
 * GET /api/players/autocomplete
 * - Returns up to 10 players whose names match the query (?q=)
 * - If init not done => 503
 */
router.get('/players/autocomplete', asyncHandler(async (req, res) => {
  const initDone = await redis.get('leaderboard:init_done');
  // const locked = isProcessing();
  if (!initDone /* || locked */) {
    return res.status(503).json({
      error: 'IndexingInProgress',
      message: 'We are indexing data, Please try a few minutes later.'
    });
  }

  const q = (req.query.q as string) || '';
  if (!q) {
    return res.json([]);
  }
  const results = await autocompletePlayers(q);
  return res.json(results);
}));

export default router;
