#!/usr/bin/env node

/**
 * Migration: Create password_reset_tokens table for admin password reset flow.
 *
 * Usage:
 *   node scripts/migrate-admin-password-reset.mjs
 *
 * Requires DATABASE_URL or POSTGRES_URL environment variable.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* ── Load environment variables ─────────────────────────────────────────── */

function loadEnvFile(filename) {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const envPath = join(__dirname, '..', filename);
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // File doesn't exist — continue
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

/* ── Database connection ────────────────────────────────────────────────── */

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('Migration failed: DATABASE_URL or POSTGRES_URL is required.');
  process.exit(1);
}

const { default: pg } = await import('pg');
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});

/* ── Migration ──────────────────────────────────────────────────────────── */

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash    TEXT NOT NULL,
        otp_hash      TEXT,
        expires_at    TIMESTAMPTZ NOT NULL,
        used_at       TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Add otp_hash column if table already existed without it
    await client.query(`
      ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS otp_hash TEXT
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
        ON password_reset_tokens (token_hash)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_otp_hash
        ON password_reset_tokens (otp_hash)
        WHERE otp_hash IS NOT NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
        ON password_reset_tokens (user_id, created_at DESC)
    `);

    await client.query('COMMIT');

    // Verify
    const { rows } = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_name = 'password_reset_tokens'
    `);

    const exists = rows[0]?.count > 0;

    console.log(`[password-reset] Table exists: ${exists}`);
    console.log('[password-reset] Migration complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[password-reset] Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

try {
  await migrate();
} finally {
  await pool.end();
}
