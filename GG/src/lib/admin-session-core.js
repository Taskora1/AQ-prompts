import crypto from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'aqprompts_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const ADMIN_SESSION_ROLES = ['admin', 'super_admin'];

function getSigningSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters.');
  }

  return secret;
}

function sign(payload) {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('base64url');
}

function valuesMatch(expected, received) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(received || ''));

  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function createAdminSessionToken(user) {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({
      scope: 'admin',
      userId: Number(user.id),
      email: String(user.email || '').trim().toLowerCase(),
      role: user.role,
      // Session version at issue time. Verification compares this against
      // the user's current session_version in the database, so a logout
      // or password change (which bumps the stored version) invalidates
      // every token issued before the bump.
      sv: Number(user.sessionVersion ?? 0),
      exp: expiresAt,
    }),
  ).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionToken(value) {
  try {
    const [payload, signature] = String(value || '').split('.');
    if (!payload || !signature || !valuesMatch(sign(payload), signature)) return false;

    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const valid = session.scope === 'admin'
      && Number.isSafeInteger(session.userId)
      && session.userId > 0
      && typeof session.email === 'string'
      && session.email.includes('@')
      && ADMIN_SESSION_ROLES.includes(session.role)
      // A token without a session version was issued before revocation
      // existed and is rejected; every current token must carry sv.
      && Number.isSafeInteger(session.sv)
      && session.sv >= 0
      && Number.isFinite(session.exp)
      && session.exp > Math.floor(Date.now() / 1000);

    return valid ? session : null;
  } catch {
    return null;
  }
}
