import crypto from 'node:crypto';

import { getPgPool } from './db.js';

const TOKEN_TTL_MINUTES = 60;
const OTP_TTL_MINUTES = 10;
const CLEANUP_OLD_DAYS = 7;

// Max failed OTP guesses against one token before it is invalidated.
export const MAX_OTP_ATTEMPTS = 5;

// ── Schema Setup ────────────────────────────────────────────────────────

// The Neon HTTP driver rejects multiple statements in one query
// ("cannot insert multiple commands into a prepared statement"), so each
// DDL statement below runs as its own pool.query() call — same pattern as
// ensureAdminLoginRateLimitSchema in admin-users-db.js. Previously all five
// statements were sent in one query, which broke every password-reset
// endpoint before it could do anything.
const CREATE_PASSWORD_RESET_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  otp_hash      TEXT,
  otp_attempts  INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  otp_expires_at TIMESTAMPTZ,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`;

const ADD_OTP_HASH_COLUMN_SQL = `
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS otp_hash TEXT
`;

const ADD_OTP_ATTEMPTS_COLUMN_SQL = `
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0
`;

const ADD_OTP_EXPIRES_AT_COLUMN_SQL = `
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ
`;

const CREATE_TOKEN_HASH_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
  ON password_reset_tokens (token_hash)
`;

const CREATE_OTP_HASH_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_otp_hash
  ON password_reset_tokens (otp_hash)
  WHERE otp_hash IS NOT NULL
`;

const CREATE_USER_ID_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id, created_at DESC)
`;

// Guard so the DDL below runs at most once per process lifetime instead of
// on every call (same pattern as ensurePromptEditorialSchema in prompts-db.js).
let passwordResetTableDone = false;

export async function ensurePasswordResetTable() {
  if (passwordResetTableDone) return;

  const pool = getPgPool();
  await pool.query(CREATE_PASSWORD_RESET_TABLE_SQL);
  await pool.query(ADD_OTP_HASH_COLUMN_SQL);
  await pool.query(ADD_OTP_ATTEMPTS_COLUMN_SQL);
  await pool.query(ADD_OTP_EXPIRES_AT_COLUMN_SQL);
  await pool.query(CREATE_TOKEN_HASH_INDEX_SQL);
  await pool.query(CREATE_OTP_HASH_INDEX_SQL);
  await pool.query(CREATE_USER_ID_INDEX_SQL);
  passwordResetTableDone = true;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Derive a 6-digit OTP from a reset token.
 * The OTP is deterministic: same token always produces the same OTP.
 * This allows us to look up the token from the OTP.
 *
 * Fail closed: AUTH_SECRET must be set to a random value of at least 32
 * characters (same rule as admin-session-core.js). There is deliberately
 * no fallback secret — a known fallback would let anyone who obtains a
 * raw reset token compute its OTP without the real secret.
 */
function getOtpSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters.');
  }

  return secret;
}

function deriveOTP(rawToken) {
  const secret = getOtpSecret();
  const hmac = crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
  const numeric = parseInt(hmac.slice(0, 8), 16) % 1_000_000;
  return String(numeric).padStart(6, '0');
}

function hashOTP(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

/**
 * Generate a new password reset token and OTP.
 * Stores both hashes in the database.
 * Returns { rawToken, otp } — rawToken for the reset link, otp for the email.
 *
 * The row carries two expiries: expires_at (TOKEN_TTL_MINUTES) governs the
 * reset-link path, while otp_expires_at (OTP_TTL_MINUTES) governs the OTP
 * path, matching the "expires in 10 minutes" the email promises. The two
 * paths share one row, so they cannot have separate expires_at values.
 */
export async function createPasswordResetToken(userId) {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const otp = deriveOTP(rawToken);
  const otpHash = hashOTP(otp);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const pool = getPgPool();

  // Invalidate any existing unused tokens for this user
  await pool.query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
    [userId],
  );

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, otp_hash, expires_at, otp_expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, otpHash, expiresAt.toISOString(), otpExpiresAt.toISOString()],
  );

  // Cleanup old tokens
  await pool.query(
    `DELETE FROM password_reset_tokens
     WHERE created_at < NOW() - INTERVAL '${CLEANUP_OLD_DAYS} days'`,
  );

  return { rawToken, otp };
}

/**
 * Verify a 6-digit OTP against stored hashes.
 * Returns { tokenId, userId } if valid, { locked: true, userId } if the
 * token just exhausted its failed-guess allowance and was invalidated,
 * or null otherwise.
 *
 * Guesses are counted against the latest still-valid token of the user
 * identified by email, so a wrong guess can only burn the token it was
 * aimed at — never another user's token. The count is a single atomic
 * UPDATE ... RETURNING, so concurrent guesses cannot lose a count, and
 * the lockout decision uses that returned value, not the earlier SELECT.
 * After MAX_OTP_ATTEMPTS failed guesses the token is invalidated
 * (used_at set), so even the correct code stops working and the user
 * must request a new one.
 *
 * The OTP is checked against otp_expires_at (10 minutes, per the email),
 * falling back to expires_at for rows created before that column existed.
 * The reset-link path keeps using expires_at (60 minutes) and is
 * unaffected.
 */
export async function verifyPasswordResetOTP(otp, email) {
  const otpHash = hashOTP(otp);
  const pool = getPgPool();

  const tokenResult = await pool.query(
    `SELECT prt.id, prt.user_id, prt.otp_hash, prt.otp_attempts
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE LOWER(u.email) = LOWER($1)
       AND prt.used_at IS NULL
       AND COALESCE(prt.otp_expires_at, prt.expires_at) > NOW()
     ORDER BY prt.created_at DESC
     LIMIT 1`,
    [email],
  );

  const row = tokenResult.rows[0];
  if (!row) return null;

  // Constant-time compare against the stored hash (both are fixed-length
  // hex digests; the length guard covers a corrupt stored value).
  const expectedHash = Buffer.from(String(row.otp_hash || ''), 'utf8');
  const actualHash = Buffer.from(otpHash, 'utf8');
  const matches = expectedHash.length === actualHash.length
    && crypto.timingSafeEqual(expectedHash, actualHash);

  if (matches) {
    return { tokenId: row.id, userId: row.user_id };
  }

  const attemptResult = await pool.query(
    `UPDATE password_reset_tokens
     SET otp_attempts = otp_attempts + 1
     WHERE id = $1 AND used_at IS NULL
     RETURNING otp_attempts`,
    [row.id],
  );
  const attempts = Number(attemptResult.rows[0]?.otp_attempts || 0);

  if (attempts >= MAX_OTP_ATTEMPTS) {
    await pool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [row.id],
    );
    return { locked: true, userId: row.user_id };
  }

  return null;
}

/**
 * Verify a reset token is valid (exists, not expired, not used).
 * Returns the associated user_id if valid, null otherwise.
 */
export async function verifyPasswordResetToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const pool = getPgPool();

  const result = await pool.query(
    `SELECT id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at) <= new Date()) return null;

  return { tokenId: row.id, userId: row.user_id };
}

/**
 * Mark a reset token as used after successful password change.
 */
export async function consumePasswordResetToken(tokenId) {
  const pool = getPgPool();

  await pool.query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL',
    [tokenId],
  );
}

/**
 * Check rate limiting: max N token requests per email within a time window.
 * Returns true if the request is allowed.
 */
export async function canRequestPasswordReset(email, maxAttempts = 3, windowMinutes = 10) {
  const pool = getPgPool();

  const result = await pool.query(
    `SELECT COUNT(*)::int AS attempts
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE LOWER(u.email) = LOWER($1)
       AND prt.created_at > NOW() - INTERVAL '${windowMinutes} minutes'`,
    [email],
  );

  return Number(result.rows[0]?.attempts || 0) < maxAttempts;
}
