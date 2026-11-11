import { NextResponse } from 'next/server';

import { verifyPasswordResetOTP, ensurePasswordResetTable } from '@/lib/admin-password-reset-db';

export async function POST(request) {
  const log = (msg, ...args) => console.log(`[otp-verify] ${msg}`, ...args);

  try {
    const body = await request.json();
    const otp = String(body?.otp || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();

    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      log('Invalid OTP format received');
      return NextResponse.json(
        { success: false, error: 'Please enter a valid 6-digit code.' },
        { status: 400 },
      );
    }

    // The email attributes the guess to the right token row so failed
    // attempts can be counted (and the token locked out) per token.
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      log('OTP verification attempted without an email — rejecting');
      return NextResponse.json(
        { success: false, error: 'Please request a new code.' },
        { status: 400 },
      );
    }

    log('Verifying OTP');

    // Auto-create table if missing (safe no-op if exists)
    await ensurePasswordResetTable();

    const result = await verifyPasswordResetOTP(otp, email);

    if (result?.locked) {
      log('OTP attempts exhausted for user_id=%d — token invalidated', result.userId);
      return NextResponse.json(
        { success: false, error: 'Too many incorrect attempts. This code is no longer valid. Please request a new code.' },
        { status: 429 },
      );
    }

    if (!result) {
      log('OTP verification failed — no matching token found');
      return NextResponse.json(
        { success: false, error: 'Invalid or expired verification code. Please request a new code.' },
        { status: 400 },
      );
    }

    log('OTP verified for user_id=%d, tokenId=%d', result.userId, result.tokenId);

    // Return a short-lived signed session token containing {tokenId, userId, exp}
    // Fail closed: AUTH_SECRET must be set to a random value of at least 32
    // characters (same rule as admin-session-core.js). There is deliberately
    // no fallback secret — a known fallback would let anyone forge a session
    // token and skip the OTP step.
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters.');
    }
    const crypto = await import('node:crypto');
    const exp = Date.now() + 10 * 60 * 1000; // 10 minutes
    const sessionPayload = JSON.stringify({
      tid: result.tokenId,
      uid: result.userId,
      exp,
    });
    const hmac = crypto.createHmac('sha256', secret)
      .update(sessionPayload)
      .digest('base64url');
    const encodedPayload = Buffer.from(sessionPayload).toString('base64url');
    const sessionToken = `${encodedPayload}.${hmac}`;

    log('Session token created successfully');

    return NextResponse.json({
      success: true,
      token: sessionToken,
    });
  } catch (err) {
    console.error('[otp-verify] Error:', err.message || err);

    // Handle missing column error specifically
    if (err.code === '42703') {
      console.error('[otp-verify] FATAL: otp_hash column missing — run: node scripts/migrate-admin-password-reset.mjs');
      return NextResponse.json(
        { success: false, error: 'Password reset system needs setup. Please contact the administrator.' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
