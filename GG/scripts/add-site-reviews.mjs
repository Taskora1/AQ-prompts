import { pathToFileURL } from 'node:url';

import { getPgPool } from '../src/lib/db.js';
import { isMigrationRunnerAuthorized } from './lib/database-migration-safety.mjs';

let pool;

export async function applySiteReviewsMigration(client) {
  await client.query('BEGIN');
  try {
    const readOnly = await client.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only !== 'off') {
      throw new Error('The migration requires a writable database connection.');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.site_reviews (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        rating SMALLINT NOT NULL
          CONSTRAINT site_reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
        review_text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CONSTRAINT site_reviews_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
        source TEXT NOT NULL DEFAULT 'website'
          CONSTRAINT site_reviews_source_check CHECK (source IN ('website', 'copy-gate')),
        prompt_id BIGINT REFERENCES public.prompts(id) ON DELETE SET NULL,
        ip_hash TEXT NOT NULL,
        user_agent TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      ALTER TABLE public.site_reviews
      ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS site_reviews_status_created_idx
        ON public.site_reviews (status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS site_reviews_ip_created_idx
        ON public.site_reviews (ip_hash, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS site_reviews_prompt_idx
        ON public.site_reviews (prompt_id)
        WHERE prompt_id IS NOT NULL
    `);

    const verification = await client.query(`
      SELECT
        to_regclass('public.site_reviews') IS NOT NULL AS table_exists,
        (
          SELECT COUNT(*) = 11
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'site_reviews'
            AND column_name IN (
              'id', 'name', 'email', 'rating', 'review_text', 'status',
              'source', 'prompt_id', 'ip_hash', 'user_agent', 'created_at'
            )
        ) AS required_columns_present,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
      FROM public.site_reviews
    `);
    if (
      verification.rows[0]?.table_exists !== true
      || verification.rows[0]?.required_columns_present !== true
    ) {
      throw new Error('Site reviews migration verification failed.');
    }

    await client.query('COMMIT');
    return verification.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function migrate() {
  pool = getPgPool();
  const client = await pool.connect();
  try {
    console.log('Site reviews migration complete:', await applySiteReviewsMigration(client));
  } finally {
    client.release();
  }
}

if (isMigrationRunnerAuthorized()) {
  migrate()
    .catch((error) => {
      console.error(`Site reviews migration failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool?.end();
    });
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error('Run this migration through scripts/run-database-migration.mjs with an explicit target and environment file.');
  process.exitCode = 1;
}
