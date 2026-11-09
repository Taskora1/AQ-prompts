/**
 * Database connection layer — one shared PostgreSQL pool per process.
 *
 * Exports: getPgPool(), getDatabaseUrl(), isDatabaseMigrationConnectionAllowed(),
 *          testDatabaseConnection()
 */

import pg from 'pg';
import { isMigrationRunnerAuthorized } from '../../scripts/lib/database-migration-safety.mjs';

const { Pool } = pg;

// ── globalThis singleton (survives Next.js dev HMR and warm invocations) ──

const globalForPg = globalThis;

// ── migration guard ─────────────────────────────────────────────────────

const GUARDED_DATABASE_SCRIPTS = new Set([
  'run-database-migration.mjs',
  'migrate-prompts-to-db.mjs',
  'migrate-prompt-status-categories.mjs',
  'add-prompt-library-type.mjs',
  'separate-prompt-library-categories.mjs',
  'delete-text-portrait-categories.mjs',
  'add-author-profiles.mjs',
  'add-site-reviews.mjs',
  'add-site-review-profiles.mjs',
  'add-prompts-faqs-column.mjs',
  'add-prompt-seo-columns.mjs',
  'add-related-prompt-ids-column.mjs',
  'add-public-prompt-eligibility.mjs',
  'remove-sitemap-prompt-eligibility.mjs',
  'backfill-public-prompt-eligibility.mjs',
  'create-activity-log-table.mjs',
  'create-admin-users.mjs',
  'migrate-prompt-images-to-blob.mjs',
  'migrate-admin-password-reset.mjs',
  'migrate-blog-mdx-to-neon.mjs',
  'add-mcp-oauth-authorization.mjs',
  'bootstrap-preview-synthetic-db.mjs',
  'setup-paddle-database.mjs',
]);

export function isDatabaseMigrationConnectionAllowed(entrypoint = process.argv[1]) {
  const script = String(entrypoint || '').replaceAll('\\', '/').split('/').pop();
  if (script === 'run-database-migration.mjs') return isMigrationRunnerAuthorized(entrypoint);
  return !GUARDED_DATABASE_SCRIPTS.has(script);
}

function assertMigrationGuard() {
  if (!isDatabaseMigrationConnectionAllowed()) {
    throw new Error(
      'Direct database migration execution is blocked. Use scripts/run-database-migration.mjs with an explicit target and environment file.',
    );
  }
}

// ── connection string resolution ─────────────────────────────────────────

export function getDatabaseUrl() {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    url.searchParams.delete('channel_binding');
    if (['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode'))) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

// ── pool factory ─────────────────────────────────────────────────────────

// `next build` prerenders pages across several worker processes, each with its
// own pool. Serverless poolers (e.g. Supavisor session mode) cap total clients,
// so the build phase uses a small per-process pool; the served app keeps the
// roomier default. PG_POOL_MAX overrides both when set.
const BUILD_PHASE_ENV_KEYS = [
  'NEXT_PHASE',
  'NEXT_PRIVATE_PHASE',
  'VERCEL_ENV',
  'NEXT_PUBLIC_VERCEL_ENV',
];

export function isBuildPhase() {
  if (String(process.env.NEXT_PHASE || '') === 'phase-production-build') return true;
  if (process.env.NEXT_PRIVATE_PHASE === 'phase-production-build') return true;
  if (process.env.NEXT_IS_BUILD_WORKER === '1') return true;
  return BUILD_PHASE_ENV_KEYS.some((key) => {
    const value = String(process.env[key] || '');
    return value === 'build' || value === 'development-build';
  });
}

function resolvePoolMax() {
  const override = Number.parseInt(process.env.PG_POOL_MAX || '', 10);
  if (Number.isFinite(override) && override > 0) return override;
  return isBuildPhase() ? 1 : 5;
}

export function getPgPool() {
  assertMigrationGuard();
  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    throw new Error('DATABASE_URL or POSTGRES_URL is required for database access.');
  }

  // Never construct a pool in a request handler. The first caller creates it;
  // every later caller in this process (including warm serverless calls)
  // receives the same instance.
  let pool = globalForPg.__dbPgPool;
  const poolMax = resolvePoolMax();
  if (pool && !pool.ended && pool.__dbConnectionString === connectionString && pool.__dbPoolMax === poolMax) {
    return pool;
  }

  if (pool) {
    if (!pool.ended) pool.end().catch(() => {});
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 30_000,
  });
  pool.__dbConnectionString = connectionString;
  pool.__dbPoolMax = poolMax;

  pool.on('error', (err) => {
    console.error('[DB] idle client error:', err.message, err.code || '');
  });

  globalForPg.__dbPgPool = pool;
  return pool;
}

/**
 * Run a lightweight query to verify the database is reachable.
 * Safe to call from scripts or health-check endpoints.
 * Never logs credentials.
 */
export async function testDatabaseConnection() {
  const hasUrl = Boolean(getDatabaseUrl());
  if (!hasUrl) {
    console.error('[DB] connection test FAILED — no DATABASE_URL');
    return { ok: false, reason: 'no DATABASE_URL' };
  }

  try {
    const start = Date.now();
    const result = await getPgPool().query('SELECT 1 AS ok');
    const ms = Date.now() - start;
    console.log(`[DB] connection test — SELECT 1 OK (${ms}ms)`);
    return { ok: true, ms };
  } catch (err) {
    console.error('[DB] connection test FAILED:', err.name, err.message, err.code || '');
    return { ok: false, reason: err.message, code: err.code };
  }
}
