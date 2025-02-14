/**
 * This file manages connections to PostgreSQL and Redis.
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * PostgreSQL connection pool, reading from DATABASE_URL (or a default).
 */
export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:admin@db:5432/leaderboard'
});

/**
 * ioredis instance, reading from REDIS_URL (or a default).
 */
export const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
