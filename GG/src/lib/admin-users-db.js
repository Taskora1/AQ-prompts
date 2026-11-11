import {
  adminPasswordHashMatches,
  hashAdminPassword,
} from './admin-password.js';
import { verifyAdminSessionToken } from './admin-session-core.js';
import { getPgPool } from './db.js';

export const ADMIN_ROLES = ['admin', 'super_admin'];

const ADMIN_LOGIN_FAILURE_LIMIT = 3;
let adminLoginRateLimitSchemaPromise;

const MAX_EMAIL_LENGTH = 320;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;

export function normalizeAdminEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function mapUser(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    email: row.email,
    role: row.role,
    sessionVersion: Number(row.sessionVersion ?? 0),
    createdAt: row.createdAt || '',
    lastLoginAt: row.lastLoginAt || '',
  };
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateNewAdminUser(input) {
  const email = normalizeAdminEmail(input?.email);
  const password = String(input?.password || '');
  const role = ADMIN_ROLES.includes(input?.role) ? input.role : '';
  const errors = {};

  if (!validEmail(email) || email.length > MAX_EMAIL_LENGTH) {
    errors.email = 'Enter a valid email address.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  if (!role) errors.role = 'Choose Admin or Super Admin.';

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { email, password, role },
  };
}

export function validateAdminRole(input) {
  const role = ADMIN_ROLES.includes(input?.role) ? input.role : '';
  return {
    valid: Boolean(role),
    errors: role ? {} : { role: 'Choose Admin or Super Admin.' },
    data: { role },
  };
}

export async function findAdminUserByEmail(email, { includePasswordHash = false } = {}) {
  const result = await getPgPool().query(
    `
      SELECT
        id,
        email,
        role,
        ${includePasswordHash ? 'password_hash AS "passwordHash",' : ''}
        created_at::text AS "createdAt",
        last_login_at::text AS "lastLoginAt"
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [normalizeAdminEmail(email)],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    ...mapUser(row),
    ...(includePasswordHash ? { passwordHash: row.passwordHash } : {}),
  };
}

export async function getAdminUserById(id) {
  const result = await getPgPool().query(
    `
      SELECT
        id,
        email,
        role,
        session_version AS "sessionVersion",
        created_at::text AS "createdAt",
        last_login_at::text AS "lastLoginAt"
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  return mapUser(result.rows[0]);
}

/**
 * Atomically bump a user's session version, invalidating every session
 * token issued before the bump. A single statement, so it stays atomic
 * on the Neon HTTP driver (no BEGIN/COMMIT). Returns the new version,
 * or null when the user does not exist.
 */
export async function bumpAdminSessionVersion(id) {
  const result = await getPgPool().query(
    `
      UPDATE users
      SET session_version = session_version + 1
      WHERE id = $1
      RETURNING session_version AS "sessionVersion"
    `,
    [id],
  );
  const row = result.rows[0];
  return row ? Number(row.sessionVersion) : null;
}

/**
 * Verify an admin session token and check it against the user's current
 * session version in the database. A token whose sv does not match the
 * stored version — or a token issued before session versions existed,
 * which has no sv — is rejected. Role and email always come from the
 * database, so a demoted admin loses elevated rights immediately
 * instead of keeping them until token expiry.
 *
 * Fail closed: any database error rejects the session rather than
 * letting a possibly-revoked token through.
 */
export async function verifyAdminSessionWithRevocation(value) {
  const session = verifyAdminSessionToken(value);
  if (!session) return null;

  let user;
  try {
    user = await getAdminUserById(session.userId);
  } catch {
    return null;
  }
  if (!user) return null;
  if (Number(user.sessionVersion ?? 0) !== Number(session.sv)) return null;

  return {
    session: { ...session, role: user.role, email: user.email },
    user,
  };
}

async function ensureAdminLoginRateLimitSchema(pool) {
  if (!adminLoginRateLimitSchemaPromise) {
    // The Neon HTTP driver rejects multiple statements in one query
    // ("cannot insert multiple commands into a prepared statement"), so
    // the CREATE TABLE and CREATE INDEX run as two separate queries.
    adminLoginRateLimitSchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_login_rate_limits (
          ip_fingerprint TEXT PRIMARY KEY,
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS admin_login_rate_limits_window_idx
          ON admin_login_rate_limits (window_started_at)
      `);
    })().catch((error) => {
      adminLoginRateLimitSchemaPromise = undefined;
      throw error;
    });
  }
  await adminLoginRateLimitSchemaPromise;
}

export async function authenticateAdminUserWithDailyIpLimit(email, password, ipFingerprint) {
  const pool = getPgPool();
  await ensureAdminLoginRateLimitSchema(pool);
  const client = await pool.connect();

  // NOTE (audit #6): the BEGIN / pg_advisory_xact_lock / COMMIT below are
  // no-ops on the Neon HTTP driver (see src/lib/db.js) — every statement
  // runs as its own autocommit request, so there is no real mutual
  // exclusion here. The failure counter itself stays exact because the
  // increment is a single atomic INSERT ... ON CONFLICT DO UPDATE
  // statement. The residual race is the limit pre-check (the SELECT just
  // below): two requests arriving together while the count is just below
  // the limit can both pass it and each record one more failure before
  // the limit engages. That only ever grants extra guesses at the
  // boundary — the count itself is never lost — and it cannot be closed
  // with a single statement without changing the semantics: the check
  // must run before the password is verified, and the increment must
  // only happen after a failed check. Accepted as a platform limitation.
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`admin-login:${ipFingerprint}`],
    );
    await client.query(`
      DELETE FROM admin_login_rate_limits
      WHERE window_started_at <= NOW() - INTERVAL '24 hours'
    `);

    const attemptsResult = await client.query(
      `
        SELECT failed_attempts AS "failedAttempts",
          window_started_at > NOW() - INTERVAL '24 hours' AS "windowActive"
        FROM admin_login_rate_limits
        WHERE ip_fingerprint = $1
      `,
      [ipFingerprint],
    );
    const attempts = attemptsResult.rows[0];

    if (attempts?.windowActive && Number(attempts.failedAttempts) >= ADMIN_LOGIN_FAILURE_LIMIT) {
      await client.query('COMMIT');
      return { user: null, limited: true };
    }

    const userResult = await client.query(
      `
        SELECT
          id,
          email,
          role,
          password_hash AS "passwordHash",
          created_at::text AS "createdAt",
          last_login_at::text AS "lastLoginAt"
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [normalizeAdminEmail(email)],
    );
    const row = userResult.rows[0];

    if (!row || !(await adminPasswordHashMatches(password, row.passwordHash))) {
      await client.query(
        `
          INSERT INTO admin_login_rate_limits (
            ip_fingerprint, failed_attempts, window_started_at
          ) VALUES ($1, 1, NOW())
          ON CONFLICT (ip_fingerprint) DO UPDATE
          SET failed_attempts = CASE
                WHEN admin_login_rate_limits.window_started_at <= NOW() - INTERVAL '24 hours'
                  THEN 1
                ELSE admin_login_rate_limits.failed_attempts + 1
              END,
              window_started_at = CASE
                WHEN admin_login_rate_limits.window_started_at <= NOW() - INTERVAL '24 hours'
                  THEN NOW()
                ELSE admin_login_rate_limits.window_started_at
              END
        `,
        [ipFingerprint],
      );
      await client.query('COMMIT');
      return { user: null, limited: false };
    }

    const updatedUserResult = await client.query(
      `
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          email,
          role,
          session_version AS "sessionVersion",
          created_at::text AS "createdAt",
          last_login_at::text AS "lastLoginAt"
      `,
      [row.id],
    );
    await client.query('COMMIT');
    return { user: mapUser(updatedUserResult.rows[0]), limited: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listAdminUsers() {
  const result = await getPgPool().query(`
    SELECT
      id,
      email,
      role,
      created_at::text AS "createdAt",
      last_login_at::text AS "lastLoginAt"
    FROM users
    ORDER BY role DESC, email
  `);

  return result.rows.map(mapUser);
}

export async function createAdminUser(data) {
  const passwordHash = await hashAdminPassword(data.password);
  const result = await getPgPool().query(
    `
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING
        id,
        email,
        role,
        created_at::text AS "createdAt",
        last_login_at::text AS "lastLoginAt"
    `,
    [data.email, passwordHash, data.role],
  );

  return mapUser(result.rows[0]);
}

export async function updateAdminUserRole(id, role) {
  const db = getPgPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const existing = await client.query(
      'SELECT id, email, role FROM users WHERE id = $1 LIMIT 1',
      [id],
    );
    const user = existing.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return { updated: false, reason: 'not_found' };
    }

    if (user.role === 'super_admin' && role !== 'super_admin') {
      const superAdmins = await client.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE role = 'super_admin'",
      );
      if (superAdmins.rows[0].count <= 1) {
        await client.query('ROLLBACK');
        return { updated: false, reason: 'last_super_admin', user: mapUser(user) };
      }
    }

    const updated = await client.query(
      `
        UPDATE users
        SET role = $2
        WHERE id = $1
        RETURNING
          id,
          email,
          role,
          created_at::text AS "createdAt",
          last_login_at::text AS "lastLoginAt"
      `,
      [id, role],
    );
    await client.query('COMMIT');

    return { updated: true, user: mapUser(updated.rows[0]), previousRole: user.role };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAdminUser(id) {
  const db = getPgPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const existing = await client.query(
      'SELECT id, email, role FROM users WHERE id = $1 LIMIT 1',
      [id],
    );
    const user = existing.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return { deleted: false, reason: 'not_found' };
    }

    if (user.role === 'super_admin') {
      const superAdmins = await client.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE role = 'super_admin'",
      );
      if (superAdmins.rows[0].count <= 1) {
        await client.query('ROLLBACK');
        return { deleted: false, reason: 'last_super_admin', user: mapUser(user) };
      }
    }

    await client.query('DELETE FROM users WHERE id = $1', [id]);
    await client.query('COMMIT');
    return { deleted: true, user: mapUser(user) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
