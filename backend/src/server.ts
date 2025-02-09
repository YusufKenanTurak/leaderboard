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

// ===================================================================
// PostgreSQL & Redis Bağlantısı
// ===================================================================
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:admin@db:5432/leaderboard'
});
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// ===================================================================
// Tipler
// ===================================================================
interface PlayerRow {
  id: number;
  name?: string; // DB sorgularına göre opsiyonel
  country_id?: number;
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

// ===================================================================
// Hata Yakalama (Async Handler)
// ===================================================================
const asyncHandler = (
  fn: (req:Request,res:Response,next:NextFunction)=>Promise<any>
): RequestHandler => {
  return (req, res, next) => fn(req, res, next).catch(next);
};

// ===================================================================
// Concurrency Lock
// ===================================================================
let isProcessing = false;

// ===================================================================
// Tablolar ve pg_trgm index
// ===================================================================
async function ensureSchemaExists() {
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
  console.log('Schema ensured. Now check pg_trgm extension + index...');

  await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_players_name_trgm
    ON public.players USING gin (name gin_trgm_ops);
  `);
  console.log('pg_trgm extension + trigram index ensured.');
}

// ===================================================================
// 1) initializeLeaderboard (FULL LOAD)
// ===================================================================
/**
 * Tüm players tablosunu (money) Redis'e yükler.
 * "Dinamik paged + chunk + setImmediate" => 10+ milyon'da "RangeError" önleme
 */
async function initializeLeaderboard(): Promise<void> {
  if (isProcessing) {
    console.log('[INIT] skip => concurrency lock');
    return;
  }
  isProcessing = true;

  try {
    console.log('[INIT] Start full load...');
    await ensureSchemaExists();

    // Leaderboard sıfırla
    await redis.del('leaderboard');
    // "sync_offset" vb. de sıfırlayabilirsiniz
    await redis.set('leaderboard:sync_offset','0');

    let pageSizeDB = 100_000;
    let chunkSizeRedis = 10_000;

    let offset = 0;
    let totalProcessed = 0;
    let pageIndex = 0;

    while (true) {
      let rows: Array<{id:number; money:number}> = [];
      try {
        const { rows: dbRows } = await db.query<{ id:number; money:number }>(`
          SELECT id, money
          FROM public.players
          ORDER BY id ASC
          LIMIT $1 OFFSET $2
        `,[pageSizeDB, offset]);
        rows = dbRows;
      } catch (err) {
        console.error(`[INIT] DB error, pageSizeDB=${pageSizeDB}`, err);
        pageSizeDB = Math.floor(pageSizeDB/2);
        if (pageSizeDB<1000) {
          console.error('[INIT] pageSizeDB < 1000 => ABORT');
          throw err;
        }
        continue;
      }

      if (rows.length===0) {
        console.log('[INIT] no more players => done.');
        break;
      }

      pageIndex++;
      console.log(`[INIT] page #${pageIndex}: read=${rows.length}, offset=${offset}`);

      // CHUNK + setImmediate
      let i=0;
      while (i<rows.length) {
        const remain = rows.length - i;
        if (remain<chunkSizeRedis) chunkSizeRedis=remain;

        let success=false;
        while (!success) {
          try {
            const slice = rows.slice(i,i+chunkSizeRedis);
            const pipeline = redis.pipeline();
            for (const r of slice) {
              pipeline.zadd('leaderboard', r.money, r.id.toString());
            }
            await pipeline.exec();

            success=true;
            i+=slice.length;
            totalProcessed+=slice.length;

            await new Promise(res=>setImmediate(res));
          } catch(e:any) {
            if (e instanceof RangeError) {
              console.warn(`[INIT] RangeError => chunkSizeRedis=${chunkSizeRedis}/2`);
              chunkSizeRedis=Math.floor(chunkSizeRedis/2);
              if (chunkSizeRedis<1000) throw e;
            } else {
              console.error('[INIT] Non-rangeError => abort', e);
              throw e;
            }
          }
        }
      }

      offset += rows.length;
      // sayfa bitince
      await new Promise(res=>setImmediate(res));

      // pageSize & chunkSize adapt
      pageSizeDB=Math.min(pageSizeDB*2,1_000_000);
      chunkSizeRedis=Math.min(chunkSizeRedis*2,50_000);
      console.log(`[INIT] done page #${pageIndex}, totalProcessed=${totalProcessed}, pageSizeDB=${pageSizeDB}, chunkSizeRedis=${chunkSizeRedis}`);
    }

    // last_known_id = max
    const { rows: maxRow } = await db.query<{ maxid:number }>(`
      SELECT COALESCE(MAX(id),0) as maxid FROM public.players
    `);
    const maxId = maxRow[0].maxid;
    await redis.set('leaderboard:last_known_id', maxId.toString());

    console.log(`[INIT] complete => totalProcessed=${totalProcessed}, last_known_id=${maxId}`);

  } finally {
    isProcessing=false;
  }
}

// ===================================================================
// 2) Yarı-Parçalı Delta Sync (Daha Hızlı)
// ===================================================================
/**
 * Cron => her 10 saniyede (örnek) tetiklenir
 * Her tetiklemede, "BİRKAÇ" sayfa (ör. 5 sayfa) işliyoruz.
 * Her sayfa bitince setImmediate => stack reset
 */
cron.schedule('*/10 * * * * *', async () => {
  if (isProcessing) {
    console.log('[cron delta] skip => concurrency in progress');
    return;
  }
  isProcessing=true;
  try {
    // Mesela 5 sayfa arka arkaya senkron
    for (let j=0; j<5; j++) {
      const done = await syncOnePageOfNewPlayers();
      if (done) {
        // tablo bitti => dur
        break;
      }
    }
  } catch(e) {
    console.error('[cron delta] error', e);
  } finally {
    isProcessing=false;
  }
});

/**
 * Bir sayfalık "yeni" veriyi senkronize eder (delta).
 * Geriye "true" dönerse tablo bitti demek.
 */
async function syncOnePageOfNewPlayers(): Promise<boolean> {
  await ensureSchemaExists();

  const lastKnownIdStr = await redis.get('leaderboard:last_known_id');
  let lastKnownId = lastKnownIdStr ? parseInt(lastKnownIdStr,10) : 0;

  const syncOffsetStr = await redis.get('leaderboard:sync_offset');
  let syncOffset = syncOffsetStr ? parseInt(syncOffsetStr,10) : 0;

  // Tek sayfa boyutu
  const PAGE_SIZE_DB = 100_000;
  let chunkSizeRedis=10_000;

  console.log(`[deltaOnePage] lastKnownId=${lastKnownId}, offset=${syncOffset}, pageSize=${PAGE_SIZE_DB}`);

  const { rows } = await db.query<PlayerRow>(`
    SELECT id, money
    FROM public.players
    WHERE id > $1
    ORDER BY id ASC
    LIMIT $2 OFFSET $3
  `,[lastKnownId, PAGE_SIZE_DB, syncOffset]);

  if (rows.length===0) {
    console.log('[deltaOnePage] No more new players => reset offset=0');
    await redis.set('leaderboard:sync_offset','0');
    return true; // Bitti
  }

  let i=0;
  while (i<rows.length) {
    const remain=rows.length - i;
    if (remain<chunkSizeRedis) chunkSizeRedis=remain;

    let success=false;
    while (!success) {
      try {
        const slice = rows.slice(i,i+chunkSizeRedis);
        const pipeline = redis.pipeline();
        for (const r of slice) {
          pipeline.zadd('leaderboard', r.money, r.id.toString());
        }
        await pipeline.exec();

        success=true;
        i+=slice.length;

        // Her chunk => stack reset
        await new Promise(res=>setImmediate(res));
      } catch(e:any) {
        if (e instanceof RangeError) {
          chunkSizeRedis=Math.floor(chunkSizeRedis/2);
          if (chunkSizeRedis<1000) throw e;
        } else {
          throw e;
        }
      }
    }
  }

  const newOffset = syncOffset+rows.length;
  await redis.set('leaderboard:sync_offset', newOffset.toString());
  console.log(`[deltaOnePage] processed ${rows.length} => new sync_offset=${newOffset}`);
  return false;
}

// ===================================================================
// 3) Leaderboard Endpoint
// ===================================================================
app.get('/api/leaderboard', asyncHandler(async(req,res)=>{
  const group = req.query.group==='1';
  if (group) {
    // Her ülkenin top 10
    const sql=`
      SELECT sub.id, sub.name, sub.country, sub.money, sub.rownum AS rank
      FROM (
        SELECT p.id, p.name, c.name as country, p.money,
               ROW_NUMBER() OVER(PARTITION BY p.country_id ORDER BY p.money DESC) as rownum
        FROM public.players p
        JOIN public.countries c ON p.country_id=c.id
      ) sub
      WHERE sub.rownum <=10
      ORDER BY sub.country ASC, sub.rownum ASC
    `;
    const { rows } = await db.query(sql);
    return res.json(rows);
  }

  // normal => top100 + (3üst2alt)
  const playerId = req.query.playerId as string|undefined;
  const lbExist = await redis.exists('leaderboard');
  if (!lbExist) {
    await initializeLeaderboard();
  } else {
    const cnt = await redis.zcard('leaderboard');
    if (cnt===0) {
      await initializeLeaderboard();
    }
  }

  const top100 = await redis.zrevrange('leaderboard',0,99);
  let unionIds:string[]=[];

  if (playerId) {
    const rank = await redis.zrevrank('leaderboard', playerId);
    if (rank===null) {
      // "No data found" => henüz sync olmamış
      return res.status(404).json({error:'Player not found in leaderboard yet'});
    }
    if (rank<100) {
      unionIds=top100;
    } else {
      const extraStart = Math.max(rank-3,0);
      const extraEnd = rank+2;
      const extra = await redis.zrevrange('leaderboard', extraStart, extraEnd);
      const filtered = extra.filter((x)=>!top100.includes(x));
      unionIds=[...top100,...filtered];
    }
  } else {
    unionIds=top100;
  }

  if (unionIds.length===0) {
    return res.json([]);
  }

  const placeholders = unionIds.map((_,i)=>`$${i+1}`).join(',');
  const { rows: joined } = await db.query<PlayerJoined>(`
    SELECT p.id, p.name, c.name as country, p.money
    FROM public.players p
    JOIN public.countries c ON p.country_id=c.id
    WHERE p.id IN (${placeholders})
  `, unionIds);

  const map = new Map<string, PlayerJoined>();
  joined.forEach(pl=>map.set(String(pl.id),pl));

  const result: Array<PlayerJoined & { rank:number|null }>=[];

  for (const id of unionIds) {
    const item = map.get(id);
    if (item) {
      const r = await redis.zrevrank('leaderboard', id);
      result.push({
        ...item,
        rank: r!==null ? r+1 : null
      });
    }
  }
  return res.json(result);
}));

// ===================================================================
// 4) Autocomplete
// ===================================================================
app.get('/api/players/autocomplete', asyncHandler(async(req,res)=>{
  const q = (req.query.q as string)||'';
  if (!q) {
    return res.json([]);
  }
  const like = `%${q}%`;

  const { rows } = await db.query<{id:number;name:string}>(`
    SELECT id,name
    FROM public.players
    WHERE name ILIKE $1
    ORDER BY name ASC
    LIMIT 10
  `,[like]);
  
  return res.json(rows);
}));

// ===================================================================
// 5) Haftalık ödül => top100 => 2% pool => vs
// ===================================================================
cron.schedule('0 0 * * 0', async()=>{
  if (isProcessing) {
    console.log('[weeklyDist] skip => concurrency lock...');
    return;
  }
  isProcessing=true;
  try {
    console.log('[weeklyDist] start...');
    const data = await redis.zrevrange('leaderboard',0,99,'WITHSCORES');
    const playersList: LeaderboardEntry[]=[];
    for(let i=0;i<data.length;i+=2) {
      playersList.push({ id:data[i], score:Number(data[i+1]) });
    }
    const totalMoney = playersList.reduce((acc,p)=>acc+p.score,0);
    const totalPool = totalMoney*0.02; // %2

    const dist=[
      { rank:1, pct:20 },
      { rank:2, pct:15 },
      { rank:3, pct:10 }
    ];
    const updates:Promise<any>[]=[];
    for (let i=0;i<playersList.length;i++) {
      const rank = i+1;
      let amt=0;
      if (rank<=3) {
        amt= totalPool*(dist[rank-1].pct/100);
      } else {
        const remain = totalPool - totalPool*((20+15+10)/100);
        amt= remain/97;
      }
      updates.push(
        db.query('UPDATE public.players SET money=money+$1 WHERE id=$2',[Math.round(amt),playersList[i].id])
      );
    }
    await Promise.all(updates);

    // reset
    await initializeLeaderboard();
    console.log('[weeklyDist] done.');
  } catch(err) {
    console.error('[weeklyDist] error', err);
  } finally {
    isProcessing=false;
  }
});

// ===================================================================
// Uygulama ayaklanınca init
// ===================================================================
app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
  // Tam yük => tablo 10m+ vs.
  initializeLeaderboard().catch(e=>console.error('[init error]', e));
});
