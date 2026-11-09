/**
 * Shared helper for standalone scripts that need database access.
 *
 * Loads .env.local (and .env as fallback) using the same `parseEnv`
 * from node:util that the migration safety system already uses,
 * then re-exports getPgPool so callers don't need to worry about
 * environment loading order.
 *
 * Usage:
 *   import { getPgPool } from './lib/load-local-env.mjs';
 *   const db = getPgPool();
 *
 * Credentials are never printed or logged.
 */

import { parseEnv } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv(filename) {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return {};
  const source = fs.readFileSync(filePath, 'utf8');
  return parseEnv(source);
}

/**
 * Load environment variables from .env.local / .env files into
 * process.env without overwriting existing values.
 *
 * This mirrors Next.js behavior: .env.local takes precedence over .env,
 * and existing env vars are never overwritten.
 */
function loadLocalEnv() {
  const fallback = loadDotEnv('.env');
  const local = loadDotEnv('.env.local');

  for (const [key, value] of Object.entries(fallback)) {
    if (!(key in process.env)) process.env[key] = value;
  }
  for (const [key, value] of Object.entries(local)) {
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Load env before re-exporting getPgPool so DATABASE_URL is available
loadLocalEnv();

// Re-export getPgPool from the canonical source.
// This ensures the pool uses the same connection helper as the rest of the app.
export { getPgPool } from '../../src/lib/db.js';
