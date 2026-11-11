// Database access for AQPrompts.
//
// Two backends, one pool-like surface. The app's call sites keep writing
// Postgres-dialect SQL and keep receiving node-postgres shaped results
// ({ rows, rowCount, command }); the backend is chosen per query in
// resolveDatabaseBackend() and the SQL is translated only on the D1 path:
//
// - Cloudflare D1 (SQLite), the default at runtime after the Neon ->
//   D1 migration: the binding is `DB` (database `aqprompts`, see
//   wrangler.jsonc). Call-site SQL is rewritten by
//   src/lib/pg-to-d1.js ($n -> ?, casts stripped, ILIKE -> LIKE,
//   NOW() -> ISO strftime, JSONB_AGG -> json_group_array, ...). The
//   three data-modifying CTEs (SQLite has none) are implemented as
//   D1 batches in the handlers below. D1 values are normalised on bind
//   (undefined -> null, boolean -> 0/1, Date -> ISO string, array/object
//   -> JSON text) and JSON-looking text values are parsed back on read,
//   so jsonb columns behave like they did on the pg driver.
// - Neon Postgres (the pre-migration backend), kept for rollback: the
//   existing @neondatabase/serverless HTTP driver, reached by setting
//   DATABASE_BACKEND=neon (Cloudflare env or process.env). The Neon
//   path passes SQL through untouched. During the production build
//   (NEXT_PHASE=phase-production-build) Neon is always used, because
//   there is no D1 binding at build time and static generation must
//   still read from Neon.
//
// Cloudflare Workers cannot open a raw TCP connection, so the pg TCP
// driver (pg.Pool) does not work there; both backends are reached over
// HTTP-style APIs (Neon's fetch driver, D1's binding).
//
// IMPORTANT — transactions: neither backend holds a session here. Each
// query runs as its own autocommit statement, and the client returned
// by pool.connect() treats BEGIN / COMMIT / ROLLBACK (and LOCK TABLE,
// on D1) as no-ops. A failure part-way through a multi-statement
// operation leaves the earlier statements committed. This is a
// deliberate, documented trade-off; pool.runTransaction() is the one
// exception — it runs its statements as a single atomic unit on both
// backends (Neon sql.transaction(), D1 db.batch()). The MCP write
// paths rely on single atomic conditional statements, not transactions.
// The old pg_advisory_xact_lock / SELECT ... FOR UPDATE calls execute
// as single statements (the lock is released as soon as the statement
// finishes); on D1 they are rewritten away by the translator.
//
// Only SELECT queries may run against the production database from the
// app. Writes are guarded by the migration guard below (see
// scripts/lib/database-migration-safety.mjs): a guarded entrypoint that
// is not the authorised migration runner is rejected.
import { neon } from '@neondatabase/serverless';

import { isMigrationRunnerAuthorized } from '../../scripts/lib/database-migration-safety.mjs';
import {
  translatePostgresToSqlite,
  isBrokerStoreCte,
  isBrokerRotateCte,
  isPasswordResetCte,
} from './pg-to-d1.js';

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
let cloudflareEnv = null;
let d1Database = null;

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
  const trimmed = String(text || '').trim();
  const first = trimmed.match(/^([A-Za-z]+)/);
  if (!first) return '';
  const word = first[1].toUpperCase();
  if (word !== 'WITH') return word;
  // WITH ... SELECT / INSERT / UPDATE / DELETE: the command is the final
  // top-level statement's keyword (a read CTE reports SELECT).
  const keywords = [...trimmed.matchAll(/\b(INSERT|UPDATE|DELETE|SELECT)\b/gi)]
    .map((match) => match[1].toUpperCase());
  return keywords.length > 0 ? keywords[keywords.length - 1] : 'WITH';
}

// ---------------------------------------------------------------------------
// Backend resolution
// ---------------------------------------------------------------------------

// The Cloudflare request environment (wrangler bindings + vars), read
// through the OpenNext adapter's sync context. Loaded with a dynamic
// import so this module still loads in plain Node (build scripts, the
// test runner), where there is no Cloudflare context and the import's
// getCloudflareContext() throws. Only a found environment is cached:
// a null result is re-resolved on the next query, so a first call made
// outside a request handler cannot wedge the backend choice.
async function getCloudflareEnv() {
  if (cloudflareEnv) return cloudflareEnv;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const env = getCloudflareContext().env || null;
    if (env) cloudflareEnv = env;
    return env;
  } catch {
    return null;
  }
}

async function getD1Database() {
  if (d1Database) return d1Database;
  const env = await getCloudflareEnv();
  const db = env?.DB || null;
  if (db) d1Database = db;
  return db;
}

async function resolveDatabaseBackend() {
  // Build phase: no D1 binding exists yet; static generation reads Neon.
  if (isBuildPhase()) return 'neon';
  const env = (await getCloudflareEnv()) || {};
  const flag = String(
    env.DATABASE_BACKEND ?? process.env.DATABASE_BACKEND ?? '',
  ).trim().toLowerCase();
  if (flag === 'neon') return 'neon';
  const db = await getD1Database();
  if (flag === 'd1') {
    if (!db) {
      throw new Error(
        'DATABASE_BACKEND=d1 but no D1 binding (DB) is available in this environment.',
      );
    }
    return 'd1';
  }
  if (flag !== '') {
    throw new Error(
      `Unknown DATABASE_BACKEND value "${flag}" (expected "d1" or "neon").`,
    );
  }
  return db ? 'd1' : 'neon';
}

// ---------------------------------------------------------------------------
// Neon backend (pre-migration; kept for rollback via DATABASE_BACKEND=neon)
// ---------------------------------------------------------------------------

async function runNeonQuery(text, params = []) {
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

async function runNeonTransaction(queries) {
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
}

// ---------------------------------------------------------------------------
// D1 backend
// ---------------------------------------------------------------------------

// D1's bind() accepts only null, numbers, strings and ArrayBuffers.
// The pg driver accepted booleans, Dates, arrays and objects, so
// normalise those here; jsonb/array columns are stored as JSON text.
function normalizeD1Value(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
    return JSON.stringify(value);
  }
  return value;
}

// The pg driver parsed jsonb columns back into objects/arrays. D1
// returns the stored JSON text, so parse values that look like JSON
// (and parse to an object/array) back; anything else stays a string.
function parseD1Value(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') return parsed;
    } catch {
      // Not valid JSON (e.g. a prompt starting with '[') — keep the text.
    }
  }
  return value;
}

function parseD1Row(row) {
  if (row === null || typeof row !== 'object') return row;
  const parsed = {};
  for (const [key, value] of Object.entries(row)) parsed[key] = parseD1Value(value);
  return parsed;
}

// D1 errors carry no pg code. Routes check error?.code === '23505'
// (unique violation) in the collections, prompts, categories and
// authors routes, so map the SQLite constraint messages to the
// equivalent pg codes.
function mapD1Error(error) {
  const message = String(error?.message || error || '');
  if (/UNIQUE constraint failed/i.test(message)) error.code = '23505';
  else if (/FOREIGN KEY constraint failed/i.test(message)) error.code = '23503';
  else if (/NOT NULL constraint failed/i.test(message)) error.code = '23502';
  return error;
}

function isNoopStatement(text) {
  const upper = String(text || '').trim().toUpperCase();
  return /^(BEGIN|COMMIT|ROLLBACK)\b/.test(upper) || /^LOCK\s+TABLE\b/.test(upper);
}

const ISO_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
// NOW() with a modifier, e.g. d1NowOffset("'-1 day'") or
// d1NowOffset("'+' || ? || ' seconds'").
function d1NowOffset(modifierSql) {
  return `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ${modifierSql})`;
}

// Runs already-SQLite SQL (hand-written by the CTE handlers below, with
// `?` placeholders) against D1 and maps the result to the node-postgres
// shape. runD1Statement() translates Postgres-dialect SQL first and
// then calls this.
async function executeD1(db, sql, values = []) {
  const normalized = values.map(normalizeD1Value);
  let result;
  try {
    result = await db.prepare(sql).bind(...normalized).all();
  } catch (error) {
    throw mapD1Error(error);
  }
  if (result && result.success === false) {
    throw mapD1Error(new Error(result.error || 'D1 query failed.'));
  }
  const rows = (Array.isArray(result?.results) ? result.results : []).map(parseD1Row);
  return { rows, result };
}

async function runD1Statement(db, text, values = []) {
  const { sql, values: bound } = translatePostgresToSqlite(text, values);
  const { rows, result } = await executeD1(db, sql, bound);
  const command = commandFromText(text);
  const isRead = command === 'SELECT';
  return {
    rows,
    rowCount: isRead ? rows.length : (result?.meta?.changes ?? rows.length),
    command,
  };
}

// --- Data-modifying CTEs ---------------------------------------------------
// SQLite has no data-modifying CTEs, so the three statements that use
// them are implemented here as D1 batches (atomic) instead of going
// through the translator, which throws on them. The detectors live in
// pg-to-d1.js so both modules agree on what counts as a match.

// storeMcpOAuthBrokerToken: prune tokens expired over a day ago, then
// insert the new access token. The caller ignores the result.
async function storeBrokerTokenD1(db, values) {
  const [tokenHash, subject, clientId, resource, expiresIn] = values;
  const results = await db.batch([
    db.prepare(`DELETE FROM mcp_oauth_broker_tokens WHERE expires_at < ${d1NowOffset("'-1 day'")}`),
    db.prepare(
      `INSERT INTO mcp_oauth_broker_tokens (token_hash, subject, client_id, resource, expires_at)
       VALUES (?, ?, ?, ?, ${d1NowOffset("'+' || ? || ' seconds'")})`,
    ).bind(
      normalizeD1Value(tokenHash),
      normalizeD1Value(subject),
      normalizeD1Value(clientId),
      normalizeD1Value(resource),
      normalizeD1Value(expiresIn),
    ),
  ]);
  const insert = results[1];
  if (insert && insert.success === false) throw mapD1Error(new Error(insert.error || 'D1 query failed.'));
  return {
    rows: [],
    rowCount: insert?.meta?.changes ?? 0,
    command: 'INSERT',
  };
}

// rotateMcpOAuthBrokerRefreshToken: consume a refresh token exactly once
// and issue a replacement access + refresh pair. The Postgres form does
// this in one statement; the D1 form keeps the same guarantee by making
// both INSERTs conditional on the refresh token still being consumable
// (INSERT ... SELECT ... WHERE <the consume conditions>) and running
// them plus the DELETE in a single atomic batch. The pre-read only
// supplies the return value; the batch's own conditions are the
// authority on whether the rotation happened (its access INSERT reports
// 0 changes when another request consumed the token first).
async function rotateBrokerRefreshTokenD1(db, values) {
  const [
    refreshTokenHash,
    clientId,
    redirectUri,
    accessTokenHash,
    replacementRefreshTokenHash,
    resource,
    accessExpiresIn,
    refreshExpiresIn,
  ] = values;
  const consumeWhere = `
    token.token_hash = ?
      AND token.client_id = ?
      AND token.resource = ?
      AND token.expires_at > ${ISO_NOW}
      AND client.client_id = token.client_id
      AND client.redirect_uri = ?
      AND client.refresh_enabled = 1
      AND NOT EXISTS (
        SELECT 1
        FROM mcp_oauth_authorizations authz
        WHERE authz.subject = token.subject
          AND authz.client_id = token.client_id
          AND authz.revoked_at IS NOT NULL
      )`;
  const preRead = await executeD1(
    db,
    `SELECT token.subject, token.client_id AS "clientId", token.resource
     FROM mcp_oauth_broker_refresh_tokens token
     JOIN mcp_oauth_clients client ON client.client_id = token.client_id
     WHERE ${consumeWhere}
     LIMIT 1`,
    [refreshTokenHash, clientId, resource, redirectUri],
  );
  if (preRead.rows.length === 0) {
    return { rows: [], rowCount: 0, command: 'SELECT' };
  }
  const consumed = preRead.rows[0];
  const accessInsertSql = `
    INSERT INTO mcp_oauth_broker_tokens (token_hash, subject, client_id, resource, expires_at)
    SELECT ?, token.subject, token.client_id, token.resource,
           ${d1NowOffset("'+' || ? || ' seconds'")}
    FROM mcp_oauth_broker_refresh_tokens token
    JOIN mcp_oauth_clients client ON client.client_id = token.client_id
    WHERE ${consumeWhere}`;
  const refreshInsertSql = `
    INSERT INTO mcp_oauth_broker_refresh_tokens (token_hash, subject, client_id, resource, expires_at)
    SELECT ?, token.subject, token.client_id, token.resource,
           ${d1NowOffset("'+' || ? || ' seconds'")}
    FROM mcp_oauth_broker_refresh_tokens token
    JOIN mcp_oauth_clients client ON client.client_id = token.client_id
    WHERE ${consumeWhere}`;
  const deleteSql = `
    DELETE FROM mcp_oauth_broker_refresh_tokens
    WHERE token_hash = ?
      AND client_id = ?
      AND resource = ?
      AND expires_at > ${ISO_NOW}
      AND EXISTS (
        SELECT 1 FROM mcp_oauth_clients client
        WHERE client.client_id = mcp_oauth_broker_refresh_tokens.client_id
          AND client.redirect_uri = ?
          AND client.refresh_enabled = 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM mcp_oauth_authorizations authz
        WHERE authz.subject = mcp_oauth_broker_refresh_tokens.subject
          AND authz.client_id = mcp_oauth_broker_refresh_tokens.client_id
          AND authz.revoked_at IS NOT NULL
      )`;
  let results;
  try {
    results = await db.batch([
      db.prepare(accessInsertSql).bind(
        normalizeD1Value(accessTokenHash),
        normalizeD1Value(accessExpiresIn),
        normalizeD1Value(refreshTokenHash),
        normalizeD1Value(clientId),
        normalizeD1Value(resource),
        normalizeD1Value(redirectUri),
      ),
      db.prepare(refreshInsertSql).bind(
        normalizeD1Value(replacementRefreshTokenHash),
        normalizeD1Value(refreshExpiresIn),
        normalizeD1Value(refreshTokenHash),
        normalizeD1Value(clientId),
        normalizeD1Value(resource),
        normalizeD1Value(redirectUri),
      ),
      db.prepare(deleteSql).bind(
        normalizeD1Value(refreshTokenHash),
        normalizeD1Value(clientId),
        normalizeD1Value(resource),
        normalizeD1Value(redirectUri),
      ),
    ]);
  } catch (error) {
    throw mapD1Error(error);
  }
  const accessInsert = results[0];
  if (accessInsert && accessInsert.success === false) {
    throw mapD1Error(new Error(accessInsert.error || 'D1 query failed.'));
  }
  if ((accessInsert?.meta?.changes ?? 0) === 0) {
    // Another request consumed the token between the pre-read and the
    // batch; the batch inserted nothing, so the rotation did not happen.
    return { rows: [], rowCount: 0, command: 'SELECT' };
  }
  return {
    rows: [{
      subject: consumed.subject,
      clientId: consumed.clientId,
      resource: consumed.resource,
    }],
    rowCount: 1,
    command: 'SELECT',
  };
}

// Admin password reset: change the password (bumping session_version,
// which revokes every session) and invalidate the user's reset tokens.
// The Postgres form does both in one CTE statement; the D1 form runs
// both UPDATEs in one atomic batch. The token UPDATE is guarded by
// EXISTS (SELECT 1 FROM users WHERE id = ?) so tokens are only
// invalidated when the user row exists — the CTE's
// user_id IN (SELECT id FROM updated_user) condition.
async function resetPasswordD1(db, values) {
  const [passwordHash, userId] = values;
  let results;
  try {
    results = await db.batch([
      db.prepare(
        `UPDATE users
         SET password_hash = ?, session_version = session_version + 1
         WHERE id = ?
         RETURNING id`,
      ).bind(normalizeD1Value(passwordHash), normalizeD1Value(userId)),
      db.prepare(
        `UPDATE password_reset_tokens
         SET used_at = ${ISO_NOW}
         WHERE user_id = ?
           AND used_at IS NULL
           AND EXISTS (SELECT 1 FROM users WHERE id = ?)
         RETURNING id`,
      ).bind(normalizeD1Value(userId), normalizeD1Value(userId)),
    ]);
  } catch (error) {
    throw mapD1Error(error);
  }
  const [userUpdate, tokenUpdate] = results;
  if (userUpdate && userUpdate.success === false) {
    throw mapD1Error(new Error(userUpdate.error || 'D1 query failed.'));
  }
  const updatedUser = Array.isArray(userUpdate?.results) ? userUpdate.results[0] : null;
  const invalidated = Array.isArray(tokenUpdate?.results) ? tokenUpdate.results.length : 0;
  return {
    rows: [{
      user_id: updatedUser ? updatedUser.id : null,
      tokens_invalidated: invalidated,
    }],
    rowCount: 1,
    command: 'SELECT',
  };
}

async function runD1Query(text, values = []) {
  if (typeof text !== 'string') {
    throw new Error('Database query requires a SQL text string.');
  }
  if (isNoopStatement(text)) {
    return { rows: [], rowCount: 0, command: commandFromText(text) };
  }
  const db = await getD1Database();
  if (!db) {
    throw new Error('D1 binding (DB) is not available in this environment.');
  }
  if (isBrokerStoreCte(text)) return storeBrokerTokenD1(db, values);
  if (isBrokerRotateCte(text)) return rotateBrokerRefreshTokenD1(db, values);
  if (isPasswordResetCte(text)) return resetPasswordD1(db, values);
  return runD1Statement(db, text, values);
}

async function runD1Transaction(queries) {
  const db = await getD1Database();
  if (!db) {
    throw new Error('D1 binding (DB) is not available in this environment.');
  }
  const statements = [];
  const texts = [];
  for (const item of Array.isArray(queries) ? queries : []) {
    const { text, values } = normalizeQueryArgs([item]);
    if (typeof text !== 'string') {
      throw new Error('Database query requires a SQL text string.');
    }
    // BEGIN / COMMIT / ROLLBACK / LOCK TABLE are no-ops on this backend;
    // a batch is already one atomic unit.
    if (isNoopStatement(text)) continue;
    if (isBrokerStoreCte(text) || isBrokerRotateCte(text) || isPasswordResetCte(text)) {
      throw new Error(
        'A data-modifying CTE cannot run inside runTransaction() on D1; '
          + 'call it as a single pool.query() instead.',
      );
    }
    const { sql, values: bound } = translatePostgresToSqlite(text, values);
    statements.push(db.prepare(sql).bind(...bound.map(normalizeD1Value)));
    texts.push(text);
  }
  if (statements.length === 0) return [];
  let results;
  try {
    results = await db.batch(statements);
  } catch (error) {
    throw mapD1Error(error);
  }
  return results.map((result, index) => {
    if (result && result.success === false) {
      throw mapD1Error(new Error(result.error || 'D1 query failed.'));
    }
    const rows = (Array.isArray(result?.results) ? result.results : []).map(parseD1Row);
    const command = commandFromText(texts[index]);
    const isRead = command === 'SELECT';
    return {
      rows,
      rowCount: isRead ? rows.length : (result?.meta?.changes ?? rows.length),
      command,
    };
  });
}

// ---------------------------------------------------------------------------
// Dispatcher (shared by pool.query and client.query)
// ---------------------------------------------------------------------------

async function runQuery(text, params = []) {
  const backend = await resolveDatabaseBackend();
  if (backend === 'd1') return runD1Query(text, params);
  return runNeonQuery(text, params);
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
    // either backend, so a client checked out with connect() behaves
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
    // Runs a list of statements as one atomic unit on both backends
    // (Neon sql.transaction(), D1 db.batch()). Use this for new code
    // that needs several statements to succeed or fail together; it
    // cannot branch on an intermediate result.
    async runTransaction(queries) {
      const backend = await resolveDatabaseBackend();
      if (backend === 'd1') return runD1Transaction(queries);
      return runNeonTransaction(queries);
    },
    // No pool to close on either backend. Kept so call sites that
    // call pool.end() keep working.
    async end() {},
    // No pool error events on either backend. Kept for compatibility.
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
