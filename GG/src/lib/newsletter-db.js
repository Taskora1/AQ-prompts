import { getPgPool } from './db.js';

// ── Schema Setup ────────────────────────────────────────────────────────

// The Neon HTTP driver rejects multiple statements in one query
// ("cannot insert multiple commands into a prepared statement"), so the
// CREATE TABLE below runs as its own pool.query() call — same pattern as
// ensureBlogTable in blog-db.js and ensurePasswordResetTable in
// admin-password-reset-db.js.
const CREATE_NEWSLETTER_SUBSCRIBERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email TEXT PRIMARY KEY,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'website'
)
`;

// Guard so the DDL below runs at most once per process lifetime instead of
// on every call (same pattern as ensureBlogTable in blog-db.js). The flag
// is only set after the query succeeds, so a failed attempt is retried on
// the next call.
let newsletterTableEnsured = false;

export async function ensureNewsletterTable() {
  if (newsletterTableEnsured) return;
  const pool = getPgPool();
  await pool.query(CREATE_NEWSLETTER_SUBSCRIBERS_TABLE_SQL);
  newsletterTableEnsured = true;
}

// ── Subscriber Storage ──────────────────────────────────────────────────

/**
 * Returns true when the email is already stored as a subscriber.
 * Callers normalize the email (trim + lowercase) before calling.
 */
export async function isNewsletterSubscribed(email) {
  const result = await getPgPool().query(
    'SELECT 1 AS subscribed FROM newsletter_subscribers WHERE email = $1 LIMIT 1',
    [email],
  );
  return result.rows.length > 0;
}

/**
 * Stores a subscriber, ignoring duplicates. Returns true when a new row
 * was inserted, false when the email was already stored.
 */
export async function addNewsletterSubscriber(email, source = 'website') {
  const result = await getPgPool().query(
    `
      INSERT INTO newsletter_subscribers (email, source)
      VALUES ($1, $2)
      ON CONFLICT (email) DO NOTHING
      RETURNING email
    `,
    [email, source],
  );
  return result.rows.length > 0;
}
