import crypto from 'node:crypto';

import { getPgPool } from './db.js';

const TOKEN_TTL_MINUTES = 60;
const OTP_TTL_MINUTES = 10;
const CLEANUP_OLD_DAYS = 7;

// ── Schema Setup ────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  otp_hash      TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS otp_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
  ON password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_otp_hash
  ON password_reset_tokens (otp_hash)
  WHERE otp_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id, created_at DESC);
`;

// Guard so the DDL below runs at most once per process lifetime instead of
// on every call (same pattern as ensurePromptEditorialSchema in prompts-db.js).
let passwordResetTableDone = false;

export async function ensurePasswordResetTable() {
  if (passwordResetTableDone) return;

  const pool = getPgPool();
  await pool.query(CREATE_TABLE_SQL);
  passwordResetTableDone = true;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Derive a 6-digit OTP from a reset token.
 * The OTP is deterministic: same token always produces the same OTP.
 * This allows us to look up the token from the OTP.
 */
function deriveOTP(rawToken) {
  const secret = process.env.AUTH_SECRET || 'password-reset-fallback';
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
 */
export async function createPasswordResetToken(userId) {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const otp = deriveOTP(rawToken);
  const otpHash = hashOTP(otp);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  const pool = getPgPool();

  // Invalidate any existing unused tokens for this user
  await pool.query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
    [userId],
  );

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, otp_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, otpHash, expiresAt.toISOString()],
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
 * Returns { tokenId, userId, rawToken } if valid, null otherwise.
 *
 * We look up all unused, unexpired tokens and check if any match the OTP.
 */
export async function verifyPasswordResetOTP(otp) {
  const otpHash = hashOTP(otp);
  const pool = getPgPool();

  const result = await pool.query(
    `SELECT id, user_id, token_hash, expires_at, used_at
     FROM password_reset_tokens
     WHERE otp_hash = $1
       AND used_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [otpHash],
  );

  const row = result.rows[0];
  if (!row) return null;

  return { tokenId: row.id, userId: row.user_id };
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
