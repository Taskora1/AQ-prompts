import crypto from 'node:crypto';

import { NextResponse } from 'next/server';

import { hashAdminPassword } from '@/lib/admin-password';
import { getPgPool } from '@/lib/db.js';
import {
  ensurePasswordResetTable,
  verifyPasswordResetToken,
} from '@/lib/admin-password-reset-db';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;

/**
 * Verify a session token from the OTP verification step.
 * Format: base64url(payload).base64url(hmac)
 * Payload contains { tid, uid, exp }
 *
 * Fail closed: AUTH_SECRET must be set to a random value of at least 32
 * characters (same rule as admin-session-core.js). There is deliberately
 * no fallback secret — a known fallback would let anyone forge a session
 * token and skip the OTP step. The check runs before the try/catch below
 * so a missing secret throws instead of being swallowed as "invalid token".
 */
function getSigningSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters.');
  }

  return secret;
}

function verifySessionToken(token) {
  const secret = getSigningSecret();

  try {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
    if (!payload.tid || !payload.uid || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;

    const expected = crypto.createHmac('sha256', secret)
      .update(JSON.stringify({ tid: payload.tid, uid: payload.uid, exp: payload.exp }))
      .digest('base64url');

    // timingSafeEqual requires same length — guard against mismatch
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    return { tokenId: payload.tid, userId: payload.uid };
  } catch {
    return null;
  }
}

export async function POST(request) {
  const log = (msg, ...args) => console.log(`[password-reset] ${msg}`, ...args);

  const formData = await request.formData();
  const token = String(formData.get('token') || '');
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');
  log('Reset password request received — token present: %s, password length: %d', token ? 'yes' : 'NO', password.length);

  // Validate inputs
  if (!token || token.length > 512) {
    log('Invalid or missing token');
    return NextResponse.redirect(
      new URL('/admin/reset-password?error=invalid', request.url),
      303,
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.redirect(
      new URL('/admin/reset-password?error=short&token=' + encodeURIComponent(token), request.url),
      303,
    );
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.redirect(
      new URL('/admin/reset-password?error=invalid', request.url),
      303,
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.redirect(
      new URL('/admin/reset-password?error=mismatch&token=' + encodeURIComponent(token), request.url),
      303,
    );
  }

  // Auto-create table if missing (safe no-op if exists)
  await ensurePasswordResetTable();

  // Try to verify as session token (from OTP flow) first, then as raw reset token
  let tokenResult = verifySessionToken(token);
  let tokenId, userId;

  if (tokenResult) {
    log('Session token verified — tokenId=%d, userId=%d', tokenResult.tokenId, tokenResult.userId);
    tokenId = tokenResult.tokenId;
    userId = tokenResult.userId;
  } else {
    // Try as raw reset token (from link-based flow)
    log('Session token invalid — trying as raw reset token');
    tokenResult = await verifyPasswordResetToken(token);
    if (!tokenResult) {
      log('Raw reset token also invalid — rejecting');
      return NextResponse.redirect(
        new URL('/admin/reset-password?error=invalid', request.url),
        303,
      );
    }
    log('Raw reset token verified — tokenId=%d, userId=%d', tokenResult.tokenId, tokenResult.userId);
    tokenId = tokenResult.tokenId;
    userId = tokenResult.userId;
  }

  try {
    const pool = getPgPool();

    // Hash new password
    log('Hashing password...');
    const passwordHash = await hashAdminPassword(password);
    log('Password hashed successfully');

    // Update the password, bump the session version, and invalidate the
    // user's reset tokens in one atomic statement. The Neon HTTP driver
    // treats BEGIN/COMMIT as no-ops, so the previous two-statement
    // "transaction" could leave the password changed while the tokens
    // stayed valid if the second write failed; a data-modifying CTE
    // keeps all writes in a single statement instead. Bumping
    // session_version revokes every session token issued before this
    // reset, so a password change logs the user out everywhere.
    log('Updating password in database for user_id=%d and invalidating reset tokens...', userId);
    const updateResult = await pool.query(
      `
        WITH updated_user AS (
          UPDATE users
          SET password_hash = $1,
              session_version = session_version + 1
          WHERE id = $2
          RETURNING id
        ),
        invalidated_tokens AS (
          UPDATE password_reset_tokens
          SET used_at = NOW()
          WHERE user_id IN (SELECT id FROM updated_user)
            AND used_at IS NULL
          RETURNING id
        )
        SELECT
          (SELECT id FROM updated_user) AS user_id,
          (SELECT COUNT(*)::int FROM invalidated_tokens) AS tokens_invalidated
      `,
      [passwordHash, userId],
    );

    if (updateResult.rows[0]?.user_id == null) {
      log('WARNING: No user row updated for user_id=%d — user may not exist', userId);
    } else {
      log('Password updated — reset tokens invalidated: %d', updateResult.rows[0].tokens_invalidated);
    }

    log('Password updated successfully for user_id=%d', userId);

    // Redirect to login with success message
    log('Redirecting to login...');
    return NextResponse.redirect(
      new URL('/admin/login?reset=success', request.url),
      303,
    );
  } catch (err) {
    console.error('[password-reset] Reset password error:', err.message || err);
    console.error('[password-reset] Error stack:', err.stack || 'no stack');
    return NextResponse.redirect(
      new URL('/admin/reset-password?error=invalid', request.url),
      303,
    );
  }
}
