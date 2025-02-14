/**
 * This file contains the core logic for:
 * 1) Full initialization of the leaderboard (loading all players into Redis).
 * 2) Paged delta synchronization of new players.
 * 3) Retrieving leaderboard data.
 * 4) Autocomplete functionality.
 * 5) Weekly distribution of rewards.
 */

import { db, redis } from '../db';
import { ensureSchemaExists } from '../config/schema';
import { PlayerRow, PlayerJoined, LeaderboardEntry } from '../types';
import setImmediatePromise from '../utils/setImmediatePromise';

let processing = false;

/**
 * A simple concurrency lock checker for asynchronous tasks.
 */
export function isProcessing(): boolean {
  return processing;
}

/**
 * Marks the concurrency lock so that no two large tasks run simultaneously.
 */
function setProcessing(value: boolean): void {
  processing = value;
}

/**
 * Initializes the leaderboard by reading all players from PostgreSQL
 * and inserting them into a Redis sorted set in descending order by "money".
 * Also sets up a few Redis keys for offset tracking.
 */
export async function initializeLeaderboard(): Promise<void> {
  if (isProcessing()) {
    console.log('[INIT] Skipping because a process is already running...');
    return;
  }
  setProcessing(true);

  try {
    console.log('[INIT] Starting full leaderboard initialization...');
    await ensureSchemaExists();

    // Clear the init_done flag in Redis
    await redis.del('leaderboard:init_done');

    // Clear the entire leaderboard
    await redis.del('leaderboard');

    // Reset the offset for delta synchronization
    await redis.set('leaderboard:sync_offset', '0');

    let pageSizeDB = 500_000;     // Number of rows to fetch from DB at once
    let chunkSizeRedis = 50_000;  // Number of rows to insert into Redis at once

    let offset = 0;
    let totalProcessed = 0;
    let pageIndex = 0;

    while (true) {
      let rows: Array<{ id: number; money: number }> = [];

      try {
        const { rows: dbRows } = await db.query<{ id: number; money: number }>(`
          SELECT id, money
          FROM public.players
          ORDER BY id ASC
          LIMIT $1 OFFSET $2
        `, [pageSizeDB, offset]);
        rows = dbRows;
      } catch (err) {
        console.error(`[INIT] Database error, pageSizeDB=${pageSizeDB}`, err);
        // If there is an error, reduce pageSizeDB and try again
        pageSizeDB = Math.floor(pageSizeDB / 2);
        if (pageSizeDB < 1000) {
          console.error('[INIT] pageSizeDB < 1000 => ABORT');
          throw err;
        }
        continue;
      }

      if (rows.length === 0) {
        console.log('[INIT] No more players => initialization done.');
        break;
      }

      pageIndex++;
      console.log(`[INIT] Page #${pageIndex}: read=${rows.length}, offset=${offset}`);

      // Insert in chunks to avoid RangeError
      let i = 0;
      while (i < rows.length) {
        const remain = rows.length - i;
        if (remain < chunkSizeRedis) chunkSizeRedis = remain;

        let success = false;
        while (!success) {
          try {
            const slice = rows.slice(i, i + chunkSizeRedis);
            const pipeline = redis.pipeline();
            for (const r of slice) {
              pipeline.zadd('leaderboard', r.money, r.id.toString());
            }
            await pipeline.exec();

            success = true;
            i += slice.length;
            totalProcessed += slice.length;

            // Wait briefly to avoid blocking
            await setImmediatePromise();
          } catch (e: any) {
            if (e instanceof RangeError) {
              console.warn(`[INIT] RangeError => halving chunkSizeRedis from ${chunkSizeRedis}`);
              chunkSizeRedis = Math.floor(chunkSizeRedis / 2);
              if (chunkSizeRedis < 1000) throw e;
            } else {
              console.error('[INIT] Non-RangeError => abort', e);
              throw e;
            }
          }
        }
      }

      offset += rows.length;
      await setImmediatePromise();

      // Scale up pageSizeDB and chunkSizeRedis to speed up subsequent reads
      pageSizeDB = Math.min(pageSizeDB * 2, 1_000_000);
      chunkSizeRedis = Math.min(chunkSizeRedis * 2, 100_000);
      console.log(`[INIT] Completed page #${pageIndex}, totalProcessed=${totalProcessed}, pageSizeDB=${pageSizeDB}, chunkSizeRedis=${chunkSizeRedis}`);
    }

    // Record the maximum ID for delta sync references
    const { rows: maxRow } = await db.query<{ maxid: number }>(`
      SELECT COALESCE(MAX(id), 0) as maxid FROM public.players
    `);
    const maxId = maxRow[0].maxid;
    await redis.set('leaderboard:last_known_id', maxId.toString());

    // Mark init_done as "1"
    await redis.set('leaderboard:init_done', '1');

    console.log(`[INIT] Complete => totalProcessed=${totalProcessed}, last_known_id=${maxId}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * Processes a single page of "new" players (IDs > last_known_id), adding them to Redis in chunks.
 * Returns true if no more new players remain.
 */
export async function syncOnePageOfNewPlayers(): Promise<boolean> {
  await ensureSchemaExists();

  // Last known ID from Redis
  const lastKnownIdStr = await redis.get('leaderboard:last_known_id');
  let lastKnownId = lastKnownIdStr ? parseInt(lastKnownIdStr, 10) : 0;

  // Current offset in the "new players" list
  const syncOffsetStr = await redis.get('leaderboard:sync_offset');
  let syncOffset = syncOffsetStr ? parseInt(syncOffsetStr, 10) : 0;

  let pageSizeDB = 100_000;
  let chunkSizeRedis = 50_000;

  console.log(`[deltaOnePage] lastKnownId=${lastKnownId}, offset=${syncOffset}, pageSize=${pageSizeDB}`);

  const { rows } = await db.query<PlayerRow>(`
    SELECT id, money
    FROM public.players
    WHERE id > $1
    ORDER BY id ASC
    LIMIT $2 OFFSET $3
  `, [lastKnownId, pageSizeDB, syncOffset]);

  if (rows.length === 0) {
    console.log('[deltaOnePage] No more new players => reset offset to 0');
    await redis.set('leaderboard:sync_offset', '0');
    return true;
  }

  let i = 0;
  while (i < rows.length) {
    const remain = rows.length - i;
    if (remain < chunkSizeRedis) chunkSizeRedis = remain;

    let success = false;
    while (!success) {
      try {
        const slice = rows.slice(i, i + chunkSizeRedis);
        const pipeline = redis.pipeline();
        for (const r of slice) {
          pipeline.zadd('leaderboard', r.money, r.id.toString());
        }
        await pipeline.exec();

        success = true;
        i += slice.length;

        // Avoid blocking
        await setImmediatePromise();
      } catch (e: any) {
        if (e instanceof RangeError) {
          chunkSizeRedis = Math.floor(chunkSizeRedis / 2);
          if (chunkSizeRedis < 1000) throw e;
        } else {
          throw e;
        }
      }
    }
  }

  const newOffset = syncOffset + rows.length;
  await redis.set('leaderboard:sync_offset', newOffset.toString());
  console.log(`[deltaOnePage] processed ${rows.length} => new sync_offset=${newOffset}`);
  return false;
}

/**
 * Retrieves the top 100 players from Redis (descending by money),
 * plus up to 3 above / 2 below the requested player (if provided).
 */
export async function getLeaderboardData(playerId?: string) {
  // Ensure leaderboard key exists. If it does not, re-initialize.
  const lbExists = await redis.exists('leaderboard');
  if (!lbExists) {
    await initializeLeaderboard();
  } else {
    const cnt = await redis.zcard('leaderboard');
    if (cnt === 0) {
      await initializeLeaderboard();
    }
  }

  // First, get the top 100 players
  const top100 = await redis.zrevrange('leaderboard', 0, 99);

  let unionIds: string[] = [];

  if (playerId) {
    const rank = await redis.zrevrank('leaderboard', playerId);
    if (rank === null) {
      // Player not found in Redis
      return { error: 'Player not found in leaderboard yet' };
    }

    // If player is already in top 100, we just show top 100
    if (rank < 100) {
      unionIds = top100;
    } else {
      // Get 3 above, 2 below
      const extraStart = Math.max(rank - 3, 0);
      const extraEnd = rank + 2;
      const extra = await redis.zrevrange('leaderboard', extraStart, extraEnd);
      const filtered = extra.filter((x) => !top100.includes(x));
      unionIds = [...top100, ...filtered];
    }
  } else {
    // If no specific player, just top 100
    unionIds = top100;
  }

  if (unionIds.length === 0) {
    return [];
  }

  // Query the database for these union IDs
  const placeholders = unionIds.map((_, i) => `$${i + 1}`).join(',');
  const { rows: joined } = await db.query<PlayerJoined>(`
    SELECT p.id, p.name, c.name as country, p.money
    FROM public.players p
    JOIN public.countries c ON p.country_id = c.id
    WHERE p.id IN (${placeholders})
  `, unionIds);

  // Build a map to quickly find row data
  const map = new Map<string, PlayerJoined>();
  joined.forEach((pl) => map.set(String(pl.id), pl));

  // Build final result array in the correct order
  const result: Array<PlayerJoined & { rank: number | null }> = [];
  for (const id of unionIds) {
    const item = map.get(id);
    if (item) {
      const r = await redis.zrevrank('leaderboard', id);
      result.push({
        ...item,
        rank: r !== null ? r + 1 : null
      });
    }
  }

  return result;
}

/**
 * Autocomplete: returns up to 10 players whose name ILIKE '%q%'
 */
export async function autocompletePlayers(query: string) {
  const like = `%${query}%`;
  const { rows } = await db.query<{ id: number; name: string }>(`
    SELECT id, name
    FROM public.players
    WHERE name ILIKE $1
    ORDER BY name ASC
    LIMIT 10
  `, [like]);
  return rows;
}

/**
 * Distributes weekly rewards to top 100 players (based on Redis).
 * 2% of total money from those 100 players is used as a "pool",
 * with custom distribution for rank 1, 2, 3, and a uniform share for others.
 */
export async function distributeWeeklyRewards(): Promise<void> {
  console.log('[weeklyDist] Retrieving top 100 from Redis...');
  const data = await redis.zrevrange('leaderboard', 0, 99, 'WITHSCORES');
  const playersList: LeaderboardEntry[] = [];

  for (let i = 0; i < data.length; i += 2) {
    playersList.push({
      id: data[i],
      score: Number(data[i + 1])
    });
  }

  const totalMoney = playersList.reduce((acc, p) => acc + p.score, 0);
  const totalPool = totalMoney * 0.02; // 2% of total

  // Distribution: top 3 have specific percentages, the remainder share the rest
  const distribution = [
    { rank: 1, pct: 20 },
    { rank: 2, pct: 15 },
    { rank: 3, pct: 10 }
  ];

  const updates: Promise<any>[] = [];
  for (let i = 0; i < playersList.length; i++) {
    const rank = i + 1;
    let amount = 0;
    if (rank <= 3) {
      amount = totalPool * (distribution[rank - 1].pct / 100);
    } else {
      const usedForTopThree = totalPool * ((20 + 15 + 10) / 100);
      const remaining = totalPool - usedForTopThree;
      amount = remaining / 97;
    }
    updates.push(
      db.query('UPDATE public.players SET money = money + $1 WHERE id = $2', [
        Math.round(amount),
        playersList[i].id
      ])
    );
  }

  await Promise.all(updates);
  console.log('[weeklyDist] Weekly rewards distribution completed successfully.');
}
