import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import cors from 'cors';
import cron from 'node-cron';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ===================== PostgreSQL & Redis =====================
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:admin@localhost:5432/leaderboard'
});
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// ====================== Tipler ======================
interface PlayerRow {
  id: number;
  name: string;
  country_id: number;
  money: number;
}
interface PlayerJoined {
  id: number;
  name: string;
  country: string;
  money: number;
}
interface LeaderboardEntry {
  id: string;
  score: number;
}

// ===================== Hata Yakalama (Async) =====================
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler => {
  return (req, res, next) => fn(req, res, next).catch(next);
};

// ============= Global Concurrency Lock =============
let isProcessing = false;

// ===================== ensureSchemaExists =====================
async function ensureSchemaExists(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.countries (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.players (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      country_id INT NOT NULL,
      money BIGINT DEFAULT 0,
      FOREIGN KEY (country_id) REFERENCES public.countries(id)
    );
  `);
  console.log('Schema ensured. Checking pg_trgm...');

  await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_players_name_trgm
    ON public.players USING gin (name gin_trgm_ops);
  `);

  console.log('pg_trgm + index ensured.');
}

// ===================== initializeLeaderboard =====================
async function initializeLeaderboard(): Promise<void> {
  if (isProcessing) {
    console.log('[initializeLeaderboard] Another process is running, skip...');
    return;
  }
  isProcessing = true;
  try {
    console.log('[INIT] Start dynamic paged+chunk from players DB...');
    await ensureSchemaExists();
    await redis.del('leaderboard');

    let pageSizeDB = 100_000;
    let chunkSizeRedis = 10_000;

    let offset = 0;
    let totalProcessed = 0;
    let pageIndex = 0;

    while (true) {
      let rows: { id: number; money: number }[] = [];
      try {
        const { rows: dbRows } = await db.query<{ id: number; money: number }>(`
          SELECT id, money
          FROM public.players
          ORDER BY id ASC
          LIMIT $1 OFFSET $2
        `, [pageSizeDB, offset]);
        rows = dbRows;
      } catch (err) {
        console.error(`[INIT] DB error pageSizeDB=${pageSizeDB}`, err);
        pageSizeDB = Math.floor(pageSizeDB / 2);
        if (pageSizeDB < 1000) {
          console.error('[INIT] pageSizeDB < 1000 => abort');
          throw err;
        }
        continue;
      }

      if (rows.length === 0) {
        console.log('[INIT] no more players => done.');
        break;
      }

      pageIndex++;
      console.log(`[INIT] page #${pageIndex}: read=${rows.length}, offset=${offset}`);

      let i = 0;
      while (i < rows.length) {
        const remain = rows.length - i;
        if (remain < chunkSizeRedis) chunkSizeRedis = remain;

        let success = false;
        while (!success) {
          try {
            const slice = rows.slice(i, i + chunkSizeRedis);
            const pipeline = redis.pipeline();
            for (const p of slice) {
              pipeline.zadd('leaderboard', p.money, p.id.toString());
            }
            await pipeline.exec();

            success = true;
            i += slice.length;
            totalProcessed += slice.length;

            await new Promise((r) => setImmediate(r));

          } catch (e: any) {
            if (e instanceof RangeError) {
              console.warn(`[INIT] RangeError chunkSizeRedis=${chunkSizeRedis}, halving...`);
              chunkSizeRedis = Math.floor(chunkSizeRedis / 2);
              if (chunkSizeRedis < 1000) {
                console.error('[INIT] chunkSizeRedis < 1000 => abort');
                throw e;
              }
            } else {
              console.error('[INIT] Non-RangeError => abort', e);
              throw e;
            }
          }
        }
      }
      offset += rows.length;

      // sayfa bitiş
      await new Promise((r) => setImmediate(r));

      pageSizeDB = Math.min(pageSizeDB * 2, 1_000_000);
      chunkSizeRedis = Math.min(chunkSizeRedis * 2, 50_000);
      console.log(`[INIT] done page #${pageIndex}, totalProcessed=${totalProcessed}, pageSizeDB=${pageSizeDB}, chunkSizeRedis=${chunkSizeRedis}`);
    }

    const { rows: maxRow } = await db.query<{ maxid: number }>(`
      SELECT COALESCE(MAX(id),0) as maxid FROM public.players
    `);
    const maxId = maxRow[0].maxid;
    await redis.set('leaderboard:last_known_id', String(maxId));
    console.log(`[INIT] complete => totalProcessed=${totalProcessed}, last_known_id=${maxId}`);

  } finally {
    isProcessing = false;
  }
}

// ===================== syncNewPlayersToLeaderboard =====================
async function syncNewPlayersToLeaderboard() {
  if (isProcessing) {
    console.log('[SYNC] Another process is running, skip...');
    return;
  }
  isProcessing = true;
  try {
    const lastKnownId = await redis.get('leaderboard:last_known_id');
    let lk = lastKnownId ? parseInt(lastKnownId, 10) : 0;
    console.log(`[SYNC] start => last_known_id=${lk}`);

    let pageSizeDB = 100_000;
    let chunkSizeRedis = 10_000;

    let offset = 0;
    let totalSynced = 0;
    let pageIndex = 0;

    while (true) {
      let rows: { id: number; money: number }[] = [];
      try {
        const { rows: dbRows } = await db.query<{ id: number; money: number }>(`
          SELECT id, money
          FROM public.players
          WHERE id > $1
          ORDER BY id ASC
          LIMIT $2 OFFSET $3
        `, [lk, pageSizeDB, offset]);
        rows = dbRows;
      } catch (err) {
        console.error(`[SYNC] DB error (pageSizeDB=${pageSizeDB})`, err);
        pageSizeDB = Math.floor(pageSizeDB / 2);
        if (pageSizeDB < 1000) {
          console.error('[SYNC] pageSizeDB < 1000 => abort sync');
          throw err;
        }
        continue;
      }

      if (rows.length === 0) {
        console.log('[SYNC] no more new players => done');
        break;
      }

      pageIndex++;
      offset += rows.length;
      console.log(`[SYNC] page #${pageIndex}: read=${rows.length}, offset=${offset}`);

      let i = 0;
      while (i < rows.length) {
        const remain = rows.length - i;
        if (remain < chunkSizeRedis) chunkSizeRedis = remain;

        let success = false;
        while (!success) {
          try {
            const slice = rows.slice(i, i + chunkSizeRedis);
            const pipeline = redis.pipeline();
            for (const p of slice) {
              pipeline.zadd('leaderboard', p.money, p.id.toString());
            }
            await pipeline.exec();

            success = true;
            i += slice.length;
            totalSynced += slice.length;

            await new Promise((r) => setImmediate(r));

          } catch (e: any) {
            if (e instanceof RangeError) {
              console.warn(`[SYNC] RangeError chunkSizeRedis=${chunkSizeRedis}, halving...`);
              chunkSizeRedis = Math.floor(chunkSizeRedis / 2);
              if (chunkSizeRedis < 1000) {
                console.error('[SYNC] chunkSizeRedis < 1000 => abort sync');
                throw e;
              }
            } else {
              console.error('[SYNC] Non-RangeError => abort sync', e);
              throw e;
            }
          }
        }
      }

      // sayfa bitimi
      await new Promise((r) => setImmediate(r));

      const localMax = Math.max(...rows.map(r => r.id));
      if (localMax > lk) lk = localMax;

      pageSizeDB = Math.min(pageSizeDB * 2, 1_000_000);
      chunkSizeRedis = Math.min(chunkSizeRedis * 2, 50_000);
      console.log(`[SYNC] done page #${pageIndex}, totalSynced=${totalSynced}, pageSizeDB=${pageSizeDB}, chunkSizeRedis=${chunkSizeRedis}`);
    }

    if (totalSynced > 0) {
      await redis.set('leaderboard:last_known_id', String(lk));
      console.log(`[SYNC] done => last_known_id=${lk}, totalSynced=${totalSynced}`);
    } else {
      console.log(`[SYNC] no new data => last_known_id remains=${lk}`);
    }

  } finally {
    isProcessing = false;
  }
}

// ===================== Endpoint'ler =====================

app.get('/api/leaderboard', asyncHandler(async (req, res) => {
  if (req.query.group === '1') {
    // Her ülkenin top10
    const sql = `
      SELECT sub.id, sub.name, sub.country, sub.money, sub.rownum as rank
      FROM (
        SELECT p.id, p.name, c.name as country, p.money,
               ROW_NUMBER() OVER (PARTITION BY p.country_id ORDER BY p.money DESC) as rownum
        FROM public.players p
        JOIN public.countries c ON p.country_id = c.id
      ) sub
      WHERE sub.rownum <= 10
      ORDER BY sub.country ASC, sub.rownum ASC
    `;
    const { rows } = await db.query(sql);
    return res.json(rows);
  }

  // Normal => top100 + 3üst2alt
  const playerId = req.query.playerId as string | undefined;
  if (!(await redis.exists('leaderboard'))) {
    await initializeLeaderboard();
  } else {
    const c = await redis.zcard('leaderboard');
    if (c === 0) await initializeLeaderboard();
  }

  const top100 = await redis.zrevrange('leaderboard', 0, 99);
  let unionIds: string[] = [];

  if (playerId) {
    const rank = await redis.zrevrank('leaderboard', playerId);
    if (rank === null) {
      return res.status(404).json({ error: 'Player not found' });
    }
    if (rank < 100) {
      unionIds = top100;
    } else {
      const extraStart = Math.max(rank - 3, 0);
      const extraEnd = rank + 2;
      const extra = await redis.zrevrange('leaderboard', extraStart, extraEnd);
      const filtered = extra.filter((id) => !top100.includes(id));
      unionIds = [...top100, ...filtered];
    }
  } else {
    unionIds = top100;
  }
  if (unionIds.length === 0) return res.json([]);

  const placeholders = unionIds.map((_, i) => `$${i+1}`).join(',');
  const { rows: joined } = await db.query<PlayerJoined>(`
    SELECT p.id, p.name, c.name as country, p.money
    FROM public.players p
    JOIN public.countries c ON p.country_id = c.id
    WHERE p.id IN (${placeholders})
  `, unionIds);

  const map = new Map<string, PlayerJoined>();
  joined.forEach((pl) => map.set(String(pl.id), pl));

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
  return res.json(result);
}));

app.get('/api/players/autocomplete', asyncHandler(async (req, res) => {
  const q = (req.query.q as string) || '';
  if (!q) return res.json([]);
  const like = `%${q}%`;

  const { rows } = await db.query<{ id: number; name: string }>(`
    SELECT id, name
    FROM public.players
    WHERE name ILIKE $1
    ORDER BY name ASC
    LIMIT 10
  `, [like]);

  res.json(rows);
}));

// ===================== Haftalık ödül =====================
cron.schedule('0 0 * * 0', async () => {
  if (isProcessing) {
    console.log('[weeklyDist] skip => isProcessing...');
    return;
  }
  isProcessing = true;
  try {
    console.log('[weeklyDist] start...');
    const data = await redis.zrevrange('leaderboard', 0, 99, 'WITHSCORES');
    const playersList: LeaderboardEntry[] = [];
    for (let i = 0; i < data.length; i += 2) {
      playersList.push({ id: data[i], score: Number(data[i+1]) });
    }

    const totalMoney = playersList.reduce((acc, p) => acc + p.score, 0);
    const totalPool = totalMoney * 0.02;
    const dist = [
      { rank: 1, pct: 20 },
      { rank: 2, pct: 15 },
      { rank: 3, pct: 10 }
    ];

    const promises: Promise<any>[] = [];
    for (let i = 0; i < playersList.length; i++) {
      const rank = i+1;
      let amt = 0;
      if (rank <= 3) {
        amt = totalPool * (dist[rank-1].pct/100);
      } else {
        const remain = totalPool - totalPool*((20+15+10)/100);
        amt = remain/97;
      }
      promises.push(
        db.query('UPDATE public.players SET money=money+$1 WHERE id=$2', [Math.round(amt), playersList[i].id])
      );
    }
    await Promise.all(promises);

    await initializeLeaderboard();
    console.log('[weeklyDist] done.');
  } catch (err) {
    console.error('[weeklyDist] error', err);
  } finally {
    isProcessing = false;
  }
});

// Dakikada bir => delta
cron.schedule('*/1 * * * *', () => {
  if (!isProcessing) {
    syncNewPlayersToLeaderboard().catch((err) => console.error('[cron delta] error', err));
  } else {
    console.log('[cron delta] skip => isProcessing...');
  }
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
  initializeLeaderboard().catch(err => console.error('[init error]', err));
});
