/**
 * This file ensures the required database schema and extensions are present.
 */

import { db } from '../db';

/**
 * Creates the necessary tables and indexes if they do not exist.
 * Also ensures the pg_trgm extension for text search.
 */
export async function ensureSchemaExists(): Promise<void> {
  // Create countries table if not exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.countries (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    );
  `);

  // Create players table if not exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.players (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      country_id INT NOT NULL,
      money BIGINT DEFAULT 0,
      FOREIGN KEY (country_id) REFERENCES public.countries(id)
    );
  `);

  console.log('Schema ensured. Now checking for pg_trgm extension and indexes...');

  // Ensure pg_trgm extension
  await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

  // Create trigram index on the players.name column
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_players_name_trgm
    ON public.players USING gin (name gin_trgm_ops);
  `);

  // Create index on players.country_id and players.money
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_players_country_money_desc
    ON public.players (country_id, money DESC)
  `);
  console.log('pg_trgm extension and trigram index ensured.');
}
