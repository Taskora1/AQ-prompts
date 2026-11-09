import { getPgPool } from './db.js';

let authSchemaReadyPromise;

export async function ensureAuthSchema() {
  if (authSchemaReadyPromise) return authSchemaReadyPromise;

  authSchemaReadyPromise = (async () => {
    const db = getPgPool();

    await db.query(`
      CREATE TABLE IF NOT EXISTS auth_login_tokens (
        token_hash TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        request_fingerprint TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS auth_login_tokens_email_created_idx ON auth_login_tokens (email, created_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS auth_login_tokens_expiry_idx ON auth_login_tokens (expires_at)');
  })().catch((error) => {
    authSchemaReadyPromise = undefined;
    throw error;
  });

  return authSchemaReadyPromise;
}

export async function canIssueLoginToken(email, requestFingerprint) {
  await ensureAuthSchema();

  const result = await getPgPool().query(
    `
      SELECT COUNT(*)::int AS attempts
      FROM auth_login_tokens
      WHERE created_at > NOW() - INTERVAL '10 minutes'
        AND (email = $1 OR request_fingerprint = $2)
    `,
    [email, requestFingerprint],
  );

  return Number(result.rows[0]?.attempts || 0) < 3;
}

export async function storeLoginToken({ tokenHash, email, requestFingerprint, expiresAt }) {
  await ensureAuthSchema();

  await getPgPool().query(
    `
      INSERT INTO auth_login_tokens (token_hash, email, request_fingerprint, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [tokenHash, email, requestFingerprint, expiresAt],
  );

  await getPgPool().query(
    `DELETE FROM auth_login_tokens WHERE expires_at < NOW() - INTERVAL '7 days'`,
  );
}

export async function consumeLoginToken(tokenHash) {
  await ensureAuthSchema();

  const result = await getPgPool().query(
    `
      UPDATE auth_login_tokens
      SET used_at = NOW()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING email
    `,
    [tokenHash],
  );

  return result.rows[0]?.email || null;
}
