import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import { Resend } from 'resend';

import { findAdminUserByEmail } from '@/lib/admin-users-db';
import {
  canRequestPasswordReset,
  createPasswordResetToken,
  ensurePasswordResetTable,
} from '@/lib/admin-password-reset-db';
import { getClientIp } from '@/lib/rate-limit';

const FROM_EMAIL = 'AQPrompts <hello@aqprompts.com>';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const recentAttempts = new Map();

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getRequestFingerprint(request) {
  const ip = getClientIp(request);
  return hash(`${ip}:${process.env.AUTH_SECRET || ''}`);
}

function buildOTPEmail(otp) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:32px;color:#111827;">
      <p style="margin:0 0 8px;color:#ff6b35;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">AQPrompts</p>
      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;">Reset your admin password</h1>
      <p style="margin:0 0 24px;color:#4b5563;line-height:1.7;">Someone requested a password reset for your AQPrompts admin account. Use the verification code below to reset your password. This code expires in 10 minutes.</p>
      <div style="margin:0 0 24px;padding:20px;background:#f3f4f6;border-radius:12px;text-align:center;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:.1em;">Your verification code</p>
        <p style="margin:0;font-size:36px;font-weight:800;letter-spacing:0.15em;color:#2271b1;">${otp}</p>
      </div>
      <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">If you did not request this, you can safely ignore this email. Your password will not change unless you enter this code.</p>
    </div>
  `;
}

export async function POST(request) {
  const log = (msg, ...args) => console.log(`[password-reset] ${msg}`, ...args);

  if (!process.env.RESEND_API_KEY) {
    log('BLOCKED: RESEND_API_KEY is not set');
    return NextResponse.redirect(
      new URL('/admin/forgot-password?error=1', request.url),
      303,
    );
  }

  const formData = await request.formData();
  const email = normalizeEmail(String(formData.get('email') || ''));
  log('Received request for: %s', email || '<empty>');

  // Always redirect with the same message to prevent email enumeration
  const successUrl = new URL('/admin/forgot-password?sent=1', request.url);
  const errorUrl = new URL('/admin/forgot-password?error=1', request.url);

  if (!isValidEmail(email)) {
    log('Invalid email format — returning success to prevent enumeration');
    return NextResponse.redirect(successUrl, 303);
  }

  // Basic rate limiting via in-memory map (per IP)
  const fingerprint = getRequestFingerprint(request);
  const now = Date.now();
  const lastAttempt = recentAttempts.get(fingerprint) || 0;

  if (now - lastAttempt < RATE_LIMIT_WINDOW_MS) {
    log('Rate limited (in-memory) for: %s', email);
    return NextResponse.redirect(successUrl, 303);
  }
  recentAttempts.set(fingerprint, now);

  // Prune old entries
  for (const [key, ts] of recentAttempts) {
    if (now - ts > 10 * 60 * 1000) recentAttempts.delete(key);
  }

  try {
    // Auto-create password_reset_tokens table if missing (safe no-op if exists)
    await ensurePasswordResetTable();

    // Find the user (silently skip if not found — prevents enumeration)
    const user = await findAdminUserByEmail(email);
    if (!user) {
      log('User not found for: %s — returning success to prevent enumeration', email);
      return NextResponse.redirect(successUrl, 303);
    }
    log('User found: id=%d, email=%s, role=%s', user.id, user.email, user.role);

    // Rate limit check against database
    const allowed = await canRequestPasswordReset(email, 3, 10);
    if (!allowed) {
      log('Rate limited (DB) for: %s', email);
      return NextResponse.redirect(successUrl, 303);
    }

    // Generate reset token and OTP
    const { rawToken, otp } = await createPasswordResetToken(user.id);
    log('Token and OTP created for user_id=%d', user.id);

    // Send OTP via email
    log('Sending OTP email to: %s ...', email);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: 'Your AQPrompts password reset code',
      html: buildOTPEmail(otp),
    });

    if (error) {
      log('EMAIL SEND FAILED: %s', JSON.stringify(error));
      return NextResponse.redirect(errorUrl, 303);
    }

    log('EMAIL SENT SUCCESSFULLY — id=%s', data?.id || 'unknown');
    // Pass the email to the next page so it can display "code sent to ..."
    const otpUrl = new URL('/admin/otp-verify', request.url);
    otpUrl.searchParams.set('email', email);
    return NextResponse.redirect(otpUrl, 303);
  } catch (err) {
    log('FATAL ERROR: %s', err.message || err);
    log(err.stack || '');
    return NextResponse.redirect(errorUrl, 303);
  }
}
