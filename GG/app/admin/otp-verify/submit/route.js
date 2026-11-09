import { NextResponse } from 'next/server';

import { verifyPasswordResetOTP, ensurePasswordResetTable } from '@/lib/admin-password-reset-db';

export async function POST(request) {
  const log = (msg, ...args) => console.log(`[otp-verify] ${msg}`, ...args);

  try {
    const body = await request.json();
    const otp = String(body?.otp || '').trim();

    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      log('Invalid OTP format: %s', otp ? otp.slice(0, 2) + '***' : '<empty>');
      return NextResponse.json(
        { success: false, error: 'Please enter a valid 6-digit code.' },
        { status: 400 },
      );
    }

    log('Verifying OTP: %s***', otp.slice(0, 2));

    // Auto-create table if missing (safe no-op if exists)
    await ensurePasswordResetTable();

    const result = await verifyPasswordResetOTP(otp);

    if (!result) {
      log('OTP verification failed — no matching token found');
      return NextResponse.json(
        { success: false, error: 'Invalid or expired verification code. Please request a new code.' },
        { status: 400 },
      );
    }

    log('OTP verified for user_id=%d, tokenId=%d', result.userId, result.tokenId);

    // Return a short-lived signed session token containing {tokenId, userId, exp}
    const crypto = await import('node:crypto');
    const exp = Date.now() + 10 * 60 * 1000; // 10 minutes
    const sessionPayload = JSON.stringify({
      tid: result.tokenId,
      uid: result.userId,
      exp,
    });
    const hmac = crypto.createHmac('sha256', process.env.AUTH_SECRET || 'fallback')
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
