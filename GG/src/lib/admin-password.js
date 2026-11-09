import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export async function hashAdminPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    Buffer.from(derivedKey).toString('base64url'),
  ].join('$');
}

export async function adminPasswordHashMatches(password, encodedHash) {
  try {
    const [algorithm, rawN, rawR, rawP, rawSalt, rawExpected] =
      String(encodedHash || '').split('$');
    if (algorithm !== 'scrypt') return false;

    const expected = Buffer.from(rawExpected, 'base64url');
    const actual = await scrypt(
      String(password || ''),
      Buffer.from(rawSalt, 'base64url'),
      expected.length,
      {
        N: Number(rawN),
        r: Number(rawR),
        p: Number(rawP),
        maxmem: SCRYPT_MAX_MEMORY,
      },
    );
    const actualBuffer = Buffer.from(actual);

    return expected.length === actualBuffer.length
      && crypto.timingSafeEqual(expected, actualBuffer);
  } catch {
    return false;
  }
}
