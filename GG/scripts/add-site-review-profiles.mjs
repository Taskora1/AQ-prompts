import { pathToFileURL } from 'node:url';

import { getPgPool } from '../src/lib/db.js';
import { isMigrationRunnerAuthorized } from './lib/database-migration-safety.mjs';

let pool;

export async function applySiteReviewProfilesMigration(client) {
  await client.query('BEGIN');
  try {
    const readOnly = await client.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only !== 'off') {
      throw new Error('The migration requires a writable database connection.');
    }

    await client.query(`
      ALTER TABLE public.site_reviews
        ADD COLUMN IF NOT EXISTS profile_image_url TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS social_url TEXT NOT NULL DEFAULT ''
    `);

    const verification = await client.query(`
      SELECT COUNT(*) = 2 AS profile_columns_present
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'site_reviews'
        AND column_name IN ('profile_image_url', 'social_url')
    `);
    if (verification.rows[0]?.profile_columns_present !== true) {
      throw new Error('Site review profile migration verification failed.');
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
    console.log('Site review profile migration complete:', await applySiteReviewProfilesMigration(client));
  } finally {
    client.release();
  }
}

if (isMigrationRunnerAuthorized()) {
  migrate()
    .catch((error) => {
      console.error(`Site review profile migration failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool?.end();
    });
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error('Run this migration through scripts/run-database-migration.mjs with an explicit target and environment file.');
  process.exitCode = 1;
}
