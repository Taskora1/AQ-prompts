import crypto from 'node:crypto';

import { Resend } from 'resend';

import { canIssueLoginToken, storeLoginToken } from '@/lib/auth-store';
import { INTEGRATION_UNAVAILABLE_MESSAGE, isIntegrationEnabled, isPreviewDeployment } from '@/lib/deployment-env';
import { rejectPublicWriteWhenAdminOnly } from '@/lib/database-mode';
import { getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const FROM_EMAIL = 'AQPrompts <hello@aqprompts.com>';
const TOKEN_TTL_MS = 15 * 60 * 1000;

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

function getSiteUrl(request) {
  if (isPreviewDeployment()) return request.nextUrl.origin;

  const configured = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;

  if (process.env.NODE_ENV === 'production' && !configured) {
    throw new Error('SITE_URL is required in production.');
  }

  const value = configured || request.nextUrl.origin;
  const url = new URL(value);

  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('SITE_URL must use HTTPS in production.');
  }

  return url.origin;
}

function buildLoginEmail(loginUrl) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:32px;color:#111827;">
      <p style="margin:0 0 8px;color:#ff6b35;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">AQPrompts</p>
      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;">Sign in to your account</h1>
      <p style="margin:0 0 24px;color:#4b5563;line-height:1.7;">Use the secure button below to sign in to your AQPrompts account. This link expires in 15 minutes and can only be used once.</p>
      <a href="${loginUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#ff6b35;color:#fff;text-decoration:none;font-weight:800;">Sign in securely</a>
      <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">If you did not request this email, you can safely ignore it. Never forward this sign-in link.</p>
    </div>
  `;
}

export async function POST(request) {
  const readOnlyResponse = rejectPublicWriteWhenAdminOnly();
  if (readOnlyResponse) return readOnlyResponse;

  if (!isIntegrationEnabled('email')) {
    return Response.json(
      { error: INTEGRATION_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { email } = await request.json().catch(() => ({}));
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32 || !process.env.RESEND_API_KEY) {
    return Response.json({ error: 'Secure account sign-in is not configured yet.' }, { status: 503 });
  }

  try {
    const requestFingerprint = getRequestFingerprint(request);
    const allowed = await canIssueLoginToken(normalizedEmail, requestFingerprint);

    if (!allowed) {
      return Response.json({ error: 'Too many sign-in requests. Please wait 10 minutes and try again.' }, { status: 429 });
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hash(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    const loginUrl = new URL('/api/auth/verify', getSiteUrl(request));
    loginUrl.searchParams.set('token', token);

    await storeLoginToken({ tokenHash, email: normalizedEmail, requestFingerprint, expiresAt });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [normalizedEmail],
      subject: 'Your secure AQPrompts sign-in link',
      html: buildLoginEmail(loginUrl.toString()),
    });

    if (error) {
      return Response.json({ error: 'The sign-in email could not be sent. Please try again.' }, { status: 502 });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 500 });
  }
}
