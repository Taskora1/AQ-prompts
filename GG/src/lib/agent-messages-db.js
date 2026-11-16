// Agent chat messages — the async message board inside the admin panel.
//
// The board is coordination only: the two blog lanes (Muse AI, Copilot) and
// the supervisor talk here, plus any signed-in admin. It is NOT live chat —
// both agents run once a day, so messages are read on the next run.
//
// Storage: D1 table `agent_messages`. The sender is ALWAYS an admin user id
// resolved server-side from the authenticated identity (cookie session user
// id, or the MCP OAuth subject's linked admin account) — never a free-text
// name from the request body, so no agent can impersonate another agent or
// the user. The display name is the admin user's email (the users table has
// no display-name column).
//
// Retention: messages auto-delete 30 days after they were created. The
// prune is lazy — it runs inside listAgentMessages, the single read path
// shared by the admin API route, the Messages page, and the MCP
// list_agent_messages tool — so every list also clears out expired rows.
// No cron or scheduled job: the board is read at least once a day by the
// lanes, so expired rows never linger long. created_at already exists, so
// no schema change is needed.
//
// Table creation follows the established D1 pattern in this codebase
// (ensureBlogTable in blog-db.js, ensurePasswordResetTable in
// admin-password-reset-db.js): CREATE TABLE IF NOT EXISTS runs through the
// pool on first use, so the table is created in whichever backend the pool
// resolves to (D1 in production, Neon at build time). The standalone
// migration script scripts/create-agent-messages-table.mjs is the reviewable
// migration artifact for the same DDL. All SQL below is Postgres dialect;
// the D1 translator (pg-to-d1.js) rewrites it for SQLite.
import { getPgPool } from './db.js';

export const MAX_MESSAGE_BODY_LENGTH = 5000;
export const MAX_MESSAGE_PAGE_SIZE = 100;
export const DEFAULT_MESSAGE_PAGE_SIZE = 50;
export const MAX_MESSAGE_PAGE = 1000;

// Messages older than this many days are auto-deleted by the lazy prune in
// listAgentMessages (see pruneExpiredAgentMessages below).
export const MESSAGE_RETENTION_DAYS = 30;

export class AgentMessageValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AgentMessageValidationError';
  }
}

export function normalizeMessageBody(body) {
  const text = String(body ?? '').trim();
  if (!text) {
    throw new AgentMessageValidationError('Message must not be empty.');
  }
  if (text.length > MAX_MESSAGE_BODY_LENGTH) {
    throw new AgentMessageValidationError(
      `Message must be ${MAX_MESSAGE_BODY_LENGTH} characters or fewer.`,
    );
  }
  return text;
}

function normalizePage(value, fallback) {
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_MESSAGE_PAGE) return fallback;
  return page;
}

function normalizePageSize(value, fallback) {
  const pageSize = Number(value);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_MESSAGE_PAGE_SIZE) return fallback;
  return pageSize;
}

// --- Schema ----------------------------------------------------------------

// Postgres dialect on purpose (see the header note): SERIAL PRIMARY KEY
// becomes INTEGER PRIMARY KEY AUTOINCREMENT on D1, TIMESTAMPTZ becomes TEXT,
// DEFAULT NOW() becomes the ISO strftime default. The sender is nullable
// with ON DELETE SET NULL so deleting an admin account keeps the chat
// history (the message then shows as from a deleted admin) instead of
// deleting messages or blocking the account deletion.
const CREATE_AGENT_MESSAGES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS agent_messages (
  id SERIAL PRIMARY KEY,
  sender_admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  thread TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
)
`;

const CREATE_AGENT_MESSAGES_CREATED_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_agent_messages_created
ON agent_messages (created_at DESC, id DESC)
`;

const CREATE_AGENT_MESSAGES_SENDER_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_agent_messages_sender
ON agent_messages (sender_admin_id)
`;

// Exported so the migration script (scripts/create-agent-messages-table.mjs)
// and local verification use the exact same DDL — one source of truth.
export {
  CREATE_AGENT_MESSAGES_TABLE_SQL,
  CREATE_AGENT_MESSAGES_CREATED_INDEX_SQL,
  CREATE_AGENT_MESSAGES_SENDER_INDEX_SQL,
};

let agentMessagesTableEnsured = false;

export async function ensureAgentMessagesTable() {
  if (agentMessagesTableEnsured) return;
  const db = getPgPool();
  await db.query(CREATE_AGENT_MESSAGES_TABLE_SQL);
  await db.query(CREATE_AGENT_MESSAGES_CREATED_INDEX_SQL);
  await db.query(CREATE_AGENT_MESSAGES_SENDER_INDEX_SQL);
  agentMessagesTableEnsured = true;
}

// --- Projection -------------------------------------------------------------

function projectMessage(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    senderAdminId: row.senderAdminId == null ? null : Number(row.senderAdminId),
    // Email comes from the LEFT JOIN; null when the sender's admin account
    // was deleted after the message was sent.
    senderEmail: row.senderEmail || null,
    senderName: row.senderEmail || 'Deleted admin',
    body: row.body || '',
    thread: row.thread || '',
    createdAt: row.createdAt || '',
    readAt: row.readAt || null,
  };
}

const MESSAGE_COLUMNS = `
  m.id,
  m.sender_admin_id AS "senderAdminId",
  u.email AS "senderEmail",
  m.body,
  m.thread,
  m.created_at::text AS "createdAt",
  m.read_at::text AS "readAt"
`;

const MESSAGE_FROM = `
  agent_messages m
  LEFT JOIN users u ON u.id = m.sender_admin_id
`;

async function selectMessageById(id) {
  const result = await getPgPool().query(
    `SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM} WHERE m.id = $1 LIMIT 1`,
    [id],
  );
  return projectMessage(result.rows[0]);
}

// --- Retention --------------------------------------------------------------

// Deletes messages older than MESSAGE_RETENTION_DAYS. The cutoff is
// computed in JS and passed as a parameter, so the query is a plain
// comparison that works unchanged in both Postgres (TIMESTAMPTZ) and
// D1/SQLite (TEXT ISO, where lexicographic order is chronological order) —
// no dialect-specific NOW()/INTERVAL SQL and no schema change.
export async function pruneExpiredAgentMessages() {
  const cutoff = new Date(
    Date.now() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  try {
    await getPgPool().query(
      `DELETE FROM agent_messages WHERE created_at < $1`,
      [cutoff],
    );
  } catch (error) {
    // Pruning is best-effort: a failed DELETE must not fail the list —
    // the rows are simply retried on the next list call.
    console.error('[agent-messages] Failed to prune expired messages:', error?.message || error);
  }
}

// --- Reads ------------------------------------------------------------------

async function markMessagesRead(viewerAdminId) {
  if (viewerAdminId == null) return;
  try {
    await getPgPool().query(
      `
        UPDATE agent_messages
        SET read_at = NOW()
        WHERE sender_admin_id <> $1
          AND read_at IS NULL
      `,
      [viewerAdminId],
    );
  } catch (error) {
    // Read receipts are best-effort: a failed UPDATE must not fail the list.
    console.error('[agent-messages] Failed to mark messages as read:', error?.message || error);
  }
}

// Lists messages newest first (chat order is restored by reversing on the
// client). Viewing the list marks other senders' unread messages as read,
// so read_at means "seen by at least one other participant" — per-agent
// read receipts would need a separate table and are out of scope for v1.
export async function listAgentMessages({
  page = 1,
  pageSize = DEFAULT_MESSAGE_PAGE_SIZE,
  viewerAdminId = null,
  beforeId = null,
} = {}) {
  const currentPage = normalizePage(page, 1);
  const currentPageSize = normalizePageSize(pageSize, DEFAULT_MESSAGE_PAGE_SIZE);
  await ensureAgentMessagesTable();
  // Prune first, so the count and the page below reflect the post-prune
  // state and read receipts are not written for rows about to be deleted.
  await pruneExpiredAgentMessages();
  await markMessagesRead(viewerAdminId);

  const conditions = [];
  const values = [];
  if (beforeId != null) {
    const before = Number(beforeId);
    if (!Number.isSafeInteger(before) || before < 1) {
      throw new AgentMessageValidationError('beforeId must be a positive integer.');
    }
    values.push(before);
    conditions.push(`m.id < $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const count = await getPgPool().query(
    `SELECT COUNT(*)::int AS total FROM agent_messages m ${where}`,
    values,
  );
  const total = Number(count.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / currentPageSize));
  const safePage = Math.min(currentPage, totalPages);
  const listValues = [...values];
  listValues.push(currentPageSize, (safePage - 1) * currentPageSize);
  const rows = await getPgPool().query(
    `
      SELECT ${MESSAGE_COLUMNS}
      FROM ${MESSAGE_FROM}
      ${where}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}
    `,
    listValues,
  );

  return {
    messages: rows.rows.map(projectMessage),
    total,
    page: safePage,
    pageSize: currentPageSize,
    totalPages,
  };
}

// --- Writes -----------------------------------------------------------------

export async function createAgentMessage({ senderAdminId, body, thread = '' }) {
  const text = normalizeMessageBody(body);
  if (senderAdminId == null || !Number.isSafeInteger(Number(senderAdminId))) {
    throw new AgentMessageValidationError('A valid sender admin id is required.');
  }
  const topic = String(thread ?? '').trim().slice(0, 120);
  await ensureAgentMessagesTable();
  const inserted = await getPgPool().query(
    `
      INSERT INTO agent_messages (sender_admin_id, body, thread, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id
    `,
    [Number(senderAdminId), text, topic],
  );
  const id = inserted.rows[0]?.id;
  if (id == null) throw new Error('Failed to create agent message.');
  return selectMessageById(id);
}
