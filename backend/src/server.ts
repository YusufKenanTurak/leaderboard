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

// PostgreSQL ve Redis
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

// ===================== ensureSchemaExists =====================
async function ensureSchemaExists(): Promise<void> {
  // Tablolar
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

  console.log('Schema ensured. Checking pg_trgm extension + indexes...');

  // pg_trgm uzantısı
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  `);

  // players.name için trigram index
  // "CONCURRENTLY" => tablo büyük olsa bile kilitlenmeyi azaltır
  // eğer tablo çok küçükse "CONCURRENTLY" gerekmeyebilir
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_players_name_trgm 
    ON public.players USING gin (name gin_trgm_ops);
  `);

  // ID alanı zaten PRIMARY KEY => normal index var
  // bu kadar yeterli
  console.log('pg_trgm extension & trigram index created (if not exist).');
}

// ============== Dinamik Paged + Chunk For Leaderboard ==============

/**
 * Tüm tabloyu (players) baştan Redis'e yükler. 
 * Dinamik pageSizeDB ve chunkSizeRedis ile
 * bellek/stack hatası almadıkça boyut artar, aksi halde düşer.
 */
async function initializeLeaderboard(): Promise<void> {
  console.log('Initializing leaderboard from DB (dynamic paged + chunk approach)...');
  await ensureSchemaExists();

  // Leaderboard zset reset
  await redis.del('leaderboard');

  let pageSizeDB = 100_000;       // DB sayfa başlangıç
  let chunkSizeRedis = 10_000;    // Redis pipeline chunk başlangıç

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
    } catch (e) {
      console.error(`DB error with pageSizeDB=${pageSizeDB}`, e);
      // pageSizeDB yarıya indir
      pageSizeDB = Math.floor(pageSizeDB / 2);
      if (pageSizeDB < 1000) {
        console.error('pageSizeDB < 1000 => abort initialize.');
        throw e;
      }
      continue; // yeniden dene
    }

    if (rows.length === 0) {
      console.log('No more players from DB => done.');
      break;
    }

    pageIndex++;
    console.log(`Page #${pageIndex}: read=${rows.length}, pageSizeDB=${pageSizeDB}, offset=${offset}`);

    // chunk'lı ekleme
    let i = 0;
    while (i < rows.length) {
      const remain = rows.length - i;
      if (remain < chunkSizeRedis) {
        chunkSizeRedis = remain;
      }

      // retry block
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

        } catch (err: any) {
          if (err instanceof RangeError) {
            console.warn(`RangeError on chunkSizeRedis=${chunkSizeRedis}, halving...`);
            chunkSizeRedis = Math.floor(chunkSizeRedis / 2);
            if (chunkSizeRedis < 1000) {
              console.error('chunkSizeRedis < 1000 => abort.');
              throw err;
            }
          } else {
            console.error('Non-RangeError => abort init', err);
            throw err;
          }
        }
      }
    }

    offset += rows.length;

    // sayfa bitti => boyutları arttır
    pageSizeDB = Math.min(pageSizeDB * 2, 1_000_000);
    chunkSizeRedis = Math.min(chunkSizeRedis * 2, 50_000);

    console.log(`  => Done page #${pageIndex}, totalProcessed=${totalProcessed}, pageSizeDB=${pageSizeDB}, chunkSizeRedis=${chunkSizeRedis}`);
  }

  // max ID
  const { rows: maxIdRow } = await db.query<{ maxid: number }>('SELECT COALESCE(MAX(id),0) as maxid FROM public.players');
  const maxId = maxIdRow[0].maxid;
  await redis.set('leaderboard:last_known_id', String(maxId));

  console.log(`initializeLeaderboard finished. totalProcessed=${totalProcessed}, last_known_id=${maxId}`);
}

/** 
 * Delta ekleme: DB’de id>last_known_id kayıtları bulur. 
 * Yine dinamik pageSizeDB + chunkSizeRedis yaklaşımı.
 */
async function syncNewPlayersToLeaderboard() {
  try {
    const lastKnownId = await redis.get('leaderboard:last_known_id');
    let lk = lastKnownId ? parseInt(lastKnownId, 10) : 0;
    console.log(`syncNewPlayersToLeaderboard start. last_known_id=${lk}`);

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
        console.error(`DB error on delta read (pageSizeDB=${pageSizeDB})`, err);
        pageSizeDB = Math.floor(pageSizeDB / 2);
        if (pageSizeDB < 1000) {
          console.error('pageSizeDB < 1000 => abort delta sync...');
          throw err;
        }
        continue;
      }

      if (rows.length === 0) {
        console.log('No more new players => delta done.');
        break;
      }

      pageIndex++;
      offset += rows.length;
      console.log(`Delta page #${pageIndex}: read=${rows.length}, pageSizeDB=${pageSizeDB}, offset=${offset}`);

      // chunk
      let i = 0;
      while (i < rows.length) {
        const remain = rows.length - i;
        if (remain < chunkSizeRedis) {
          chunkSizeRedis = remain;
        }
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
          } catch (e: any) {
            if (e instanceof RangeError) {
              console.warn(`RangeError on chunkSizeRedis=${chunkSizeRedis}, halving...`);
              chunkSizeRedis = Math.floor(chunkSizeRedis / 2);
              if (chunkSizeRedis < 1000) {
                console.error('chunkSizeRedis < 1000 => abort delta sync');
                throw e;
              }
            } else {
              console.error('Non-rangeError => abort delta sync', e);
              throw e;
            }
          }
        }
      }

      // localMax
      const localMax = Math.max(...rows.map(r => r.id));
      if (localMax > lk) {
        lk = localMax;
      }

      // sayfa success => arttır
      pageSizeDB = Math.min(pageSizeDB * 2, 1_000_000);
      chunkSizeRedis = Math.min(chunkSizeRedis * 2, 50_000);
      console.log(` => Done delta page #${pageIndex}. totalSynced=${totalSynced}, pageSizeDB=${pageSizeDB}, chunkSizeRedis=${chunkSizeRedis}`);
    }

    // set last_known_id
    if (totalSynced > 0) {
      await redis.set('leaderboard:last_known_id', String(lk));
      console.log(`syncNewPlayers done. last_known_id=${lk}, totalSynced=${totalSynced}`);
    } else {
      console.log('No new data => last_known_id remains:', lk);
    }

  } catch (err) {
    console.error('Error in syncNewPlayersToLeaderboard:', err);
  }
}

// ================ Endpoint'ler =================

/**
 * GET /api/leaderboard
 *  - ?playerId=123 => top100 + (3üst2alt)
 *  - ?group=1 => Her ülkenin top 10
 */
app.get('/api/leaderboard', asyncHandler(async (req, res) => {
  if (req.query.group === '1') {
    // Her ülke money DESC => ROW_NUMBER => top10
    const sql = `
      SELECT sub.id, sub.name, sub.country, sub.money, sub.rownum as rank
      FROM (
        SELECT p.id, p.name, c.name AS country, p.money,
               ROW_NUMBER() OVER (PARTITION BY p.country_id ORDER BY p.money DESC) AS rownum
        FROM public.players p
        JOIN public.countries c ON p.country_id = c.id
      ) sub
      WHERE sub.rownum <= 10
      ORDER BY sub.country ASC, sub.rownum ASC
    `;
    const { rows } = await db.query<{ id: number; name: string; country: string; money: number; rank: number }>(sql);
    return res.json(rows);
  }

  // Normal => top100 + 3üst 2alt
  const playerId = req.query.playerId as string | undefined;
  const leaderboardExists = await redis.exists('leaderboard');
  if (!leaderboardExists) {
    await initializeLeaderboard();
  } else {
    const count = await redis.zcard('leaderboard');
    if (count === 0) {
      await initializeLeaderboard();
    }
  }

  // Top 100
  const top100Ids = await redis.zrevrange('leaderboard', 0, 99);
  let unionIds: string[] = [];

  if (playerId) {
    const rank = await redis.zrevrank('leaderboard', playerId);
    if (rank === null) {
      return res.status(404).json({ error: 'Player not found in leaderboard' });
    }
    if (rank < 100) {
      unionIds = top100Ids;
    } else {
      const extraStart = Math.max(rank - 3, 0);
      const extraEnd = rank + 2;
      const extraIds = await redis.zrevrange('leaderboard', extraStart, extraEnd);
      const filtered = extraIds.filter((id) => !top100Ids.includes(id));
      unionIds = [...top100Ids, ...filtered];
    }
  } else {
    unionIds = top100Ids;
  }

  if (unionIds.length === 0) {
    return res.json([]);
  }

  // DB Join => name, country, money
  const placeholders = unionIds.map((_, i) => `$${i + 1}`).join(',');
  const { rows: joined } = await db.query<PlayerJoined>(`
    SELECT p.id, p.name, c.name AS country, p.money
    FROM public.players p
    JOIN public.countries c ON p.country_id = c.id
    WHERE p.id IN (${placeholders})
  `, unionIds);

  const map = new Map<string, PlayerJoined>();
  joined.forEach((pl) => map.set(String(pl.id), pl));

  const result: Array<PlayerJoined & { rank: number | null }> = [];
  for (const id of unionIds) {
    const p = map.get(id);
    if (p) {
      const r = await redis.zrevrank('leaderboard', id);
      result.push({
        ...p,
        rank: r !== null ? r + 1 : null
      });
    }
  }
  return res.json(result);
}));

/** 
 * GET /api/players/autocomplete?q=... 
 *  => Hızlandırmak için "pg_trgm" index kullandık. 
 *  => “ILIKE $1” (trigram index). 
 */
app.get('/api/players/autocomplete', asyncHandler(async (req, res) => {
  const q = (req.query.q as string) || '';
  if (!q) return res.json([]);

  // lower-case vs. ILIKE => trigram index devreye girer
  // ORDER BY name => mantıklı
  // LIMIT 10 => en fazla 10 sonuc
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

// Dakikada bir => delta
cron.schedule('*/1 * * * *', () => {
  syncNewPlayersToLeaderboard();
});

// Haftalık ödül
cron.schedule('0 0 * * 0', async () => {
  try {
    console.log('Starting weekly prize distribution...');
    const data = await redis.zrevrange('leaderboard', 0, 99, 'WITHSCORES');
    const playersList: LeaderboardEntry[] = [];
    for (let i = 0; i < data.length; i += 2) {
      playersList.push({ id: data[i], score: Number(data[i + 1]) });
    }

    const totalMoney = playersList.reduce((acc, p) => acc + p.score, 0);
    const totalPool = totalMoney * 0.02;

    const distribution = [
      { rank: 1, percent: 20 },
      { rank: 2, percent: 15 },
      { rank: 3, percent: 10 }
    ];

    const updates: Promise<any>[] = [];
    for (let i = 0; i < playersList.length; i++) {
      const rank = i + 1;
      let amount = 0;
      if (rank <= 3) {
        amount = totalPool * (distribution[rank - 1].percent / 100);
      } else {
        // geriye kalan 97 => eşit pay
        const remain = totalPool - totalPool * ((20 + 15 + 10) / 100);
        amount = remain / 97;
      }
      updates.push(
        db.query('UPDATE public.players SET money = money + $1 WHERE id = $2', [
          Math.round(amount),
          playersList[i].id
        ])
      );
    }
    await Promise.all(updates);

    // Sıfırla
    await initializeLeaderboard();
    console.log('Weekly prize distribution completed.');
  } catch (err) {
    console.error('Error distributing weekly prize:', err);
  }
});

app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
  initializeLeaderboard().catch(err => console.error('init error:', err));
});
