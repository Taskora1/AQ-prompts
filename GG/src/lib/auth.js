import crypto from 'node:crypto';

import { cookies } from 'next/headers';

const SESSION_COOKIE = 'aqprompts_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters.');
  }

  return secret;
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function sign(value) {
  return crypto.createHmac('sha256', getAuthSecret()).update(value).digest('base64url');
}

function signaturesMatch(expected, received) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received || '');

  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function createSignedInSession(email) {
  const normalizedEmail = normalizeEmail(email);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = Buffer.from(JSON.stringify({ email: normalizedEmail, exp: expiresAt })).toString('base64url');
  const value = `${payload}.${sign(payload)}`;
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSignedInSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getSignedInUser() {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(SESSION_COOKIE)?.value;
    const [payload, signature] = String(value || '').split('.');

    if (!payload || !signature || !signaturesMatch(sign(payload), signature)) {
      return null;
    }

    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const email = normalizeEmail(session.email);

    if (!email || !Number.isFinite(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return { email };
  } catch {
    return null;
  }
}
