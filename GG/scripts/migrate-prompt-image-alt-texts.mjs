/**
 * Migration: Add image_alt_texts JSONB column to the prompts table.
 *
 * This column stores a map of image-index → alt-text for each prompt image,
 * enabling mandatory alt text for accessibility and SEO.
 *
 * Run: node scripts/run-database-migration.mjs --script=migrate-prompt-image-alt-texts.mjs
 * Or:  node scripts/migrate-prompt-image-alt-texts.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local and .env from the project root BEFORE importing the store
function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // File doesn't exist — skip
  }
}

const root = resolve(import.meta.dirname, '..');
loadEnvFile(resolve(root, '.env.local'));
loadEnvFile(resolve(root, '.env'));

let getPgPool;

async function main() {
  const paddleStore = await import('../src/lib/db.js');
  getPgPool = paddleStore.getPgPool;
  const db = getPgPool();

  await db.query('BEGIN');
  try {
    // Add image_alt_texts column (JSONB, defaults to '{}')
    await db.query(
      "ALTER TABLE prompts ADD COLUMN IF NOT EXISTS image_alt_texts JSONB DEFAULT '{}'::jsonb",
    );

    // Backfill existing rows so the column is never NULL
    await db.query(
      "UPDATE prompts SET image_alt_texts = '{}'::jsonb WHERE image_alt_texts IS NULL",
    );

    await db.query('COMMIT');

    const verification = await db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE image_alt_texts IS NOT NULL)::int AS has_column,
        COUNT(*) FILTER (WHERE image_alt_texts != '{}'::jsonb)::int AS with_alt_text
      FROM prompts
    `);

    console.log('image_alt_texts migration complete:', verification.rows[0]);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(`Migration failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration fails before initialization.
    }
  });
