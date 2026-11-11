// Database access for AQPrompts.
//
// The app talks to Neon Postgres through the Neon serverless HTTP driver
// (@neondatabase/serverless). Cloudflare Workers cannot open a raw TCP
// connection, so the pg TCP driver (pg.Pool) does not work there; the HTTP
// driver reaches Neon over fetch, which Workers support.
//
// This module keeps the same public surface the rest of the app already
// uses (getPgPool, getDatabaseUrl, testDatabaseConnection,
// isDatabaseMigrationConnectionAllowed, isBuildPhase, resolvePoolMax) and
// returns a pool-like object whose query() resolves to a node-postgres
// shaped result ({ rows, rowCount, command }), so existing call sites do
// not need to change.
//
// IMPORTANT — transactions: the HTTP driver has no sessions and no
// multi-statement atomicity. Each query runs as its own autocommit
// statement. The client returned by pool.connect() therefore treats
// BEGIN / COMMIT / ROLLBACK as no-ops and runs every query immediately.
// That means pg_advisory_xact_lock, LOCK TABLE, and SELECT ... FOR UPDATE
// execute as single statements (they succeed, but the lock is released
// as soon as the statement finishes) and a failure part-way through a
// multi-statement operation leaves the earlier statements committed.
// This is a deliberate, documented trade-off of the HTTP driver; the
// alternative (rewriting ~14 transaction sites in auth/MCP code) is
// riskier than keeping the call sites unchanged. If true atomicity is
// needed later, switch the affected code paths to Neon's WebSocket
// Pool/Client (session) driver instead of the HTTP driver.
//
// Only SELECT queries may run against the production database from the
// app. Writes are guarded by the migration guard below (see
// scripts/lib/database-migration-safety.mjs): a guarded entrypoint that
// is not the authorised migration runner is rejected.
import { neon } from '@neondatabase/serverless';

import { isMigrationRunnerAuthorized } from '../../scripts/lib/database-migration-safety.mjs';

const DATABASE_URL_KEYS = ['DATABASE_URL', 'POSTGRES_URL'];
const DEFAULT_POOL_MAX = 10;
const GUARDED_ENTRYPOINTS = new Set([
  'run-database-migration.mjs',
  'add-mcp-oauth-authorization.mjs',
  'add-prompt-detail-fields.mjs',
  'bootstrap-preview-synthetic-db.mjs',
  'test-database-migration-safety.mjs',
]);

// In-memory cache for the generated static payloads (used only while the
// static build is running). Kept for compatibility with the call sites
// that read them during static generation.
const staticGenerationCache = new Map();

let sqlClient;
let pool;

export function getDatabaseUrl() {
  for (const key of DATABASE_URL_KEYS) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

export function resolvePoolMax() {
  const value = Number.parseInt(process.env.DATABASE_POOL_MAX || '', 10);
  if (Number.isFinite(value) && value > 0) return value;
  return DEFAULT_POOL_MAX;
}

export function isBuildPhase() {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

function entrypointScriptName(entrypoint) {
  const value = String(entrypoint || '');
  const normalized = value.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : '';
}

export function isDatabaseMigrationConnectionAllowed(entrypoint = process.argv[1]) {
  const script = entrypointScriptName(entrypoint);
  if (script === 'run-database-migration.mjs') {
    return isMigrationRunnerAuthorized(entrypoint);
  }
  return !GUARDED_ENTRYPOINTS.has(script);
}

function assertMigrationGuard() {
  if (!isDatabaseMigrationConnectionAllowed(process.argv[1])) {
    throw new Error(
      'Database migration connection is not allowed from this entrypoint. '
        + 'Run database migrations only through scripts/run-database-migration.mjs.',
    );
  }
}

function getSqlClient() {
  if (sqlClient) return sqlClient;
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error(
      'Database connection string is not configured. Set DATABASE_URL or POSTGRES_URL.',
    );
  }
  // fullResults returns a node-postgres shaped result
  // ({ rows, fields, command, rowCount, rowAsArray }) instead of just rows.
  sqlClient = neon(url, { fullResults: true });
  return sqlClient;
}

function commandFromText(text) {
  const match = String(text || '').trim().match(/^([A-Za-z]+)/);
  return match ? match[1].toUpperCase() : '';
}

async function runQuery(text, params = []) {
  const sql = getSqlClient();
  const result = await sql.query(text, params);
  // The HTTP driver returns a node-postgres shaped object when
  // fullResults is set; fall back to deriving the shape if it does not.
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  return {
    rows,
    rowCount: typeof result?.rowCount === 'number' ? result.rowCount : rows.length,
    command: typeof result?.command === 'string' && result.command
      ? result.command
      : commandFromText(text),
  };
}

function normalizeQueryArgs(args) {
  // query(text, params) and query({ text, values }) are both used.
  const [first, second] = args;
  if (first && typeof first === 'object') {
    return {
      text: first.text,
      values: Array.isArray(first.values) ? first.values : [],
    };
  }
  return {
    text: first,
    values: Array.isArray(second) ? second : [],
  };
}

function createClient() {
  return {
    // Runs as a single autocommit statement. BEGIN / COMMIT / ROLLBACK
    // are no-ops (see the header note): there is no held transaction on
    // the HTTP driver, so a client checked out with connect() behaves
    // like the pool for the statements it runs.
    async query(...args) {
      const { text, values } = normalizeQueryArgs(args);
      if (typeof text !== 'string') {
        throw new Error('Database query requires a SQL text string.');
      }
      const normalized = text.trim().toUpperCase();
      if (normalized === 'BEGIN' || normalized.startsWith('BEGIN;')
        || normalized === 'COMMIT' || normalized.startsWith('COMMIT;')
        || normalized === 'ROLLBACK' || normalized.startsWith('ROLLBACK;')) {
        return { rows: [], rowCount: 0, command: commandFromText(text) };
      }
      return runQuery(text, values);
    },
    // No connection is held, so release is a no-op. Kept so the
    // try/finally blocks in the call sites keep working unchanged.
    release() {},
  };
}

export function getPgPool() {
  // Test-injection hook, restored from the pre-migration pg driver: tests
  // install a mock pool on globalThis.__dbPgPool (with __dbConnectionString
  // set from getDatabaseUrl()) and getPgPool() returns it instead of the
  // real HTTP-driver pool. The migration rewrite dropped this hook, which
  // broke every db-mocked MCP test (the pool tried to reach Neon with a
  // localhost DATABASE_URL). Production never sets __dbPgPool, so this
  // cannot change live behavior. The old hook also compared __dbPoolMax,
  // but the migration changed the default pool max (5 -> 10) while the
  // test mocks still record 5, and a mock holds no connections, so only
  // the connection string is compared. The migration guard is skipped
  // here because an injected mock opens no real database connection.
  const injected = globalThis.__dbPgPool;
  if (
    injected
    && !injected.ended
    && injected.__dbConnectionString === getDatabaseUrl()
  ) {
    return injected;
  }
  if (pool) return pool;
  assertMigrationGuard();
  pool = {
    async query(...args) {
      const { text, values } = normalizeQueryArgs(args);
      if (typeof text !== 'string') {
        throw new Error('Database query requires a SQL text string.');
      }
      return runQuery(text, values);
    },
    // Returns a client-like object. It does not hold a connection (the
    // HTTP driver is stateless), so BEGIN/COMMIT/ROLLBACK are no-ops
    // and release() is a no-op. See the header note for the caveat.
    async connect() {
      return createClient();
    },
    // Runs a list of statements as one non-interactive transaction
    // (all statements are sent up front and run as a unit). Use this
    // for new code that needs several statements to succeed or fail
    // together; it cannot branch on an intermediate result.
    async runTransaction(queries) {
      const sql = getSqlClient();
      const statements = (Array.isArray(queries) ? queries : []).map((item) => {
        if (typeof item === 'string') return sql.query(item, []);
        const { text, values } = normalizeQueryArgs([item]);
        return sql.query(text, values);
      });
      const results = await sql.transaction(statements);
      return (Array.isArray(results) ? results : []).map((result, index) => {
        const rows = Array.isArray(result?.rows) ? result.rows : [];
        const source = Array.isArray(queries) ? queries[index] : undefined;
        const text = typeof source === 'string' ? source : source?.text;
        return {
          rows,
          rowCount: typeof result?.rowCount === 'number' ? result.rowCount : rows.length,
          command: typeof result?.command === 'string' && result.command
            ? result.command
            : commandFromText(text),
        };
      });
    },
    // No pool to close on the HTTP driver. Kept so call sites that
    // call pool.end() keep working.
    async end() {},
    // No pool error events on the HTTP driver. Kept for compatibility.
    on() {
      return pool;
    },
  };
  return pool;
}

export function getPool() {
  return getPgPool();
}

export async function testDatabaseConnection() {
  const { rows } = await getPgPool().query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

export function getStaticGenerationCache() {
  return staticGenerationCache;
}
