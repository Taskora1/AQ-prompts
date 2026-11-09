import { pathToFileURL } from 'node:url';

import { getPgPool } from '../src/lib/db.js';
import { isMigrationRunnerAuthorized } from './lib/database-migration-safety.mjs';

let pool;

export async function applyRemoveSitemapPromptEligibilityMigration(client) {
  await client.query('BEGIN');
  try {
    const readOnly = await client.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only !== 'off') {
      throw new Error('The migration requires a writable database connection.');
    }

    await client.query(`
      ALTER TABLE public.prompts
      DROP COLUMN IF EXISTS is_sitemap_eligible
    `);
    const verification = await client.query(`
      SELECT COUNT(*)::int AS remaining
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'prompts'
        AND column_name = 'is_sitemap_eligible'
    `);
    if (Number(verification.rows[0]?.remaining) !== 0) {
      throw new Error('Sitemap eligibility column removal verification failed.');
    }

    await client.query('COMMIT');
    return { column_removed: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function migrate() {
  pool = getPgPool();
  const client = await pool.connect();
  try {
    await applyRemoveSitemapPromptEligibilityMigration(client);
    console.log('Prompt sitemap eligibility column removed.');
  } finally {
    client.release();
  }
}

if (isMigrationRunnerAuthorized()) {
  migrate()
    .catch((error) => {
      console.error(`Prompt sitemap eligibility column removal failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool?.end();
    });
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error('Run this migration through scripts/run-database-migration.mjs with an explicit target and environment file.');
  process.exitCode = 1;
}
