// Admin password hashing with PBKDF2 via the Web Crypto API.
//
// The previous implementation used Node.js `crypto.scrypt`, which does not
// run inside the Cloudflare Workers free-tier CPU limit (10 ms per request)
// and made /admin/login/submit return HTTP 500. PBKDF2 through
// `globalThis.crypto.subtle` is available in both Cloudflare Workers and
// modern Node.js, so the same code works locally, on Vercel and on Workers.
//
// Hash format: pbkdf2$<iterations>$<salt base64url>$<derived key base64url>
// Legacy `scrypt$...` hashes are NOT verifiable here on purpose: attempting
// scrypt on Workers would crash the login again. An account still on a
// scrypt hash simply fails verification (clean "invalid password" redirect)
// until its password is reset to a PBKDF2 hash.

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;
const PBKDF2_HASH_ALGORITHM = 'SHA-256';

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64Url(value) {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64url'));
}

// Constant-time comparison without node:crypto (portable to Workers).
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function deriveKey(password, salt, iterations) {
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: PBKDF2_HASH_ALGORITHM,
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashAdminPassword(password) {
  const salt = new Uint8Array(SALT_LENGTH_BYTES);
  globalThis.crypto.getRandomValues(salt);
  const derivedKey = await deriveKey(password, salt, PBKDF2_ITERATIONS);

  return [
    'pbkdf2',
    PBKDF2_ITERATIONS,
    toBase64Url(salt),
    toBase64Url(derivedKey),
  ].join('$');
}

export async function adminPasswordHashMatches(password, encodedHash) {
  try {
    const [algorithm, rawIterations, rawSalt, rawExpected] =
      String(encodedHash || '').split('$');
    // Only PBKDF2 hashes are verifiable on Workers. A scrypt hash returns
    // false (invalid password) instead of crashing the login endpoint.
    if (algorithm !== 'pbkdf2') return false;

    const expected = fromBase64Url(rawExpected);
    const actual = await deriveKey(
      password,
      fromBase64Url(rawSalt),
      Number(rawIterations),
    );

    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
