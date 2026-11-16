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
// the user. The name shown is the sender's display name when they set one
// (users.display_name), otherwise their email; the email stays the
// identity underneath — a display name is display-only.
//
// Message types (agent_messages.type) drive the coloured badge on each
// message. Lanes send chat/report only; assignment/rule/feedback/blockage/
// announcement are supervisor/owner only, enforced in the admin API route
// and in sendAgentMessage — the client never decides this.
//
// Read receipts are per admin: agent_message_reads records each admin's
// last-read message id, updated whenever they list the board. The old
// read_at column (v1 "seen by at least one other participant") is kept
// for backwards compatibility.
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
import { displayNameFor } from './agent-chat-commands.js';
import { ensureUsersDisplayNameColumn } from './admin-users-db.js';

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

// --- Message types ----------------------------------------------------------

// The coloured badge on each message. 'chat' is the default when no type
// is given. Lanes send chat/report only; the rest are moderator-only (see
// isModeratorOnlyType / isChatModerator below). The badge labels and
// colours live in agent-chat-commands.js (MESSAGE_TYPE_META) so the panel
// and the tests share one definition.
export const MESSAGE_TYPES = [
  'assignment',
  'rule',
  'feedback',
  'blockage',
  'report',
  'announcement',
  'chat',
];

export const DEFAULT_MESSAGE_TYPE = 'chat';

const MODERATOR_ONLY_TYPES = new Set([
  'assignment',
  'rule',
  'feedback',
  'blockage',
  'announcement',
]);

// The supervisor seat is the 1347 admin account (the owner's standing
// arrangement: Supervisor = Muse, abdulqudoos1347@gmail.com); the owner is
// any super_admin. Only these two may post announcements, assignments,
// scores and other moderator-only types. Email is used (not the numeric
// id) because it is stable across the Neon backup and the live D1 copy.
export const SUPERVISOR_EMAILS = ['abdulqudoos1347@gmail.com'];

export function isChatModerator(adminUser) {
  if (!adminUser) return false;
  if (adminUser.role === 'super_admin') return true;
  return SUPERVISOR_EMAILS.includes(String(adminUser.email || '').toLowerCase());
}

export function isModeratorOnlyType(type) {
  return MODERATOR_ONLY_TYPES.has(String(type ?? '').trim().toLowerCase());
}

export function isMessageType(value) {
  return MESSAGE_TYPES.includes(String(value ?? '').trim().toLowerCase());
}

export function normalizeMessageType(value) {
  const type = String(value ?? '').trim().toLowerCase();
  if (!type) return DEFAULT_MESSAGE_TYPE;
  if (!MESSAGE_TYPES.includes(type)) {
    throw new AgentMessageValidationError(`Unknown message type: ${type}.`);
  }
  return type;
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
  type TEXT NOT NULL DEFAULT 'chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
)
`;

const ADD_AGENT_MESSAGES_TYPE_COLUMN_SQL = `
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'chat'
`;

// Per-admin read receipts: each admin's last-read message id. The panel
// shows "Seen by …" from this table; the v1 read_at column stays as the
// coarse "seen by someone" marker.
const CREATE_AGENT_MESSAGE_READS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS agent_message_reads (
  admin_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

const CREATE_AGENT_MESSAGES_TYPE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_agent_messages_type
ON agent_messages (type)
`;

// Exported so the migration script (scripts/add-agent-chat-improvements.mjs)
// and local verification use the exact same DDL — one source of truth.
export {
  CREATE_AGENT_MESSAGES_TABLE_SQL,
  ADD_AGENT_MESSAGES_TYPE_COLUMN_SQL,
  CREATE_AGENT_MESSAGE_READS_TABLE_SQL,
  CREATE_AGENT_MESSAGES_CREATED_INDEX_SQL,
  CREATE_AGENT_MESSAGES_SENDER_INDEX_SQL,
  CREATE_AGENT_MESSAGES_TYPE_INDEX_SQL,
};

let agentMessagesTableEnsured = false;

// D1/SQLite has no ADD COLUMN IF NOT EXISTS: the pg-to-d1 translator
// strips IF NOT EXISTS (pg-to-d1.js), and the column already exists on a
// migrated table, so SQLite throws "duplicate column name". That error
// means the column is already there — exactly the state IF NOT EXISTS
// wanted — so ignore it and only it. Any other error still throws (fail
// loudly). On Neon the native IF NOT EXISTS never throws for an existing
// column, so the guard is a no-op there. Same pattern as
// addColumnIfMissing in admin-password-reset-db.js.
async function addColumnIfMissing(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    if (/duplicate column name/i.test(String(error?.message || ''))) return;
    throw error;
  }
}

export async function ensureAgentMessagesTable() {
  if (agentMessagesTableEnsured) return;
  const db = getPgPool();
  await db.query(CREATE_AGENT_MESSAGES_TABLE_SQL);
  await addColumnIfMissing(db, ADD_AGENT_MESSAGES_TYPE_COLUMN_SQL);
  await db.query(CREATE_AGENT_MESSAGE_READS_TABLE_SQL);
  await db.query(CREATE_AGENT_MESSAGES_CREATED_INDEX_SQL);
  await db.query(CREATE_AGENT_MESSAGES_SENDER_INDEX_SQL);
  await db.query(CREATE_AGENT_MESSAGES_TYPE_INDEX_SQL);
  // The sender display name lives on users.display_name (see
  // admin-users-db.js); make sure the column exists before any SELECT
  // below references it.
  await ensureUsersDisplayNameColumn();
  agentMessagesTableEnsured = true;
}

// --- Projection -------------------------------------------------------------

function projectMessage(row, readsByAdminId = null) {
  if (!row) return null;
  const senderId = row.senderAdminId == null ? null : Number(row.senderAdminId);
  // readBy: display names of other admins whose last-read message id is
  // at least this message's id. The sender never counts as a reader of
  // their own message.
  const readBy = [];
  if (readsByAdminId) {
    for (const [adminId, reader] of readsByAdminId) {
      if (senderId != null && Number(adminId) === senderId) continue;
      if (Number(reader.lastReadMessageId || 0) >= Number(row.id)) {
        readBy.push(displayNameFor({ displayName: reader.displayName, email: reader.email }));
      }
    }
  }
  return {
    id: Number(row.id),
    senderAdminId: senderId,
    // Email comes from the LEFT JOIN; null when the sender's admin account
    // was deleted after the message was sent.
    senderEmail: row.senderEmail || null,
    // Display name when the sender set one, else the email. The email
    // stays the identity; the name is display-only.
    senderDisplayName: row.senderDisplayName || null,
    senderName: displayNameFor({ displayName: row.senderDisplayName, email: row.senderEmail }),
    body: row.body || '',
    thread: row.thread || '',
    type: row.type || DEFAULT_MESSAGE_TYPE,
    createdAt: row.createdAt || '',
    readAt: row.readAt || null,
    readBy,
  };
}

const MESSAGE_COLUMNS = `
  m.id,
  m.sender_admin_id AS "senderAdminId",
  u.email AS "senderEmail",
  u.display_name AS "senderDisplayName",
  m.body,
  m.thread,
  m.type AS "type",
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

// Records that an admin has read up to a given message id. The watermark
// only ever moves forward (the WHERE clause refuses a smaller id), so a
// paged-back list can never un-read newer messages. Best-effort: a failed
// upsert must not fail the list.
async function recordMessagesRead(viewerAdminId, maxMessageId) {
  if (viewerAdminId == null) return;
  if (!Number.isSafeInteger(Number(maxMessageId)) || Number(maxMessageId) < 1) return;
  try {
    await getPgPool().query(
      `
        INSERT INTO agent_message_reads (admin_id, last_read_message_id, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (admin_id) DO UPDATE SET
          last_read_message_id = EXCLUDED.last_read_message_id,
          updated_at = EXCLUDED.updated_at
        WHERE agent_message_reads.last_read_message_id < EXCLUDED.last_read_message_id
      `,
      [Number(viewerAdminId), Number(maxMessageId)],
    );
  } catch (error) {
    console.error('[agent-messages] Failed to record read receipt:', error?.message || error);
  }
}

// Every admin's read watermark, with the display name and email the
// panel needs to show "Seen by …" with the roster fallback (Lane 1 /
// Lane 2 / Supervisor) instead of a raw email. The display name is
// returned raw (null when unset) — the caller applies displayNameFor.
async function listMessageReads() {
  try {
    const result = await getPgPool().query(`
      SELECT
        r.admin_id AS "adminId",
        r.last_read_message_id AS "lastReadMessageId",
        u.display_name AS "displayName",
        u.email AS "email"
      FROM agent_message_reads r
      LEFT JOIN users u ON u.id = r.admin_id
      ORDER BY r.admin_id
    `);
    return result.rows.map((row) => ({
      adminId: Number(row.adminId),
      displayName: row.displayName || '',
      email: row.email || '',
      lastReadMessageId: Number(row.lastReadMessageId || 0),
    }));
  } catch (error) {
    console.error('[agent-messages] Failed to list read receipts:', error?.message || error);
    return [];
  }
}

// Lists messages newest first (chat order is restored by reversing on the
// client). Viewing the list marks other senders' unread messages as read
// (read_at) and records the viewer's own read watermark, so each message
// carries a per-admin readBy list. The returned `reads` array is the raw
// watermark table for the panel's "Not yet seen by" line.
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

  const listed = rows.rows;
  if (listed.length > 0) {
    const maxId = Math.max(...listed.map((row) => Number(row.id)));
    await recordMessagesRead(viewerAdminId, maxId);
  }
  const reads = await listMessageReads();
  const readsByAdminId = new Map(
    reads.map((read) => [Number(read.adminId), read]),
  );

  return {
    messages: listed.map((row) => projectMessage(row, readsByAdminId)),
    total,
    page: safePage,
    pageSize: currentPageSize,
    totalPages,
    reads,
  };
}

// --- Writes -----------------------------------------------------------------

export async function createAgentMessage({ senderAdminId, body, thread = '', type = DEFAULT_MESSAGE_TYPE }) {
  const text = normalizeMessageBody(body);
  if (senderAdminId == null || !Number.isSafeInteger(Number(senderAdminId))) {
    throw new AgentMessageValidationError('A valid sender admin id is required.');
  }
  const messageType = normalizeMessageType(type);
  const topic = String(thread ?? '').trim().slice(0, 120);
  await ensureAgentMessagesTable();
  const inserted = await getPgPool().query(
    `
      INSERT INTO agent_messages (sender_admin_id, body, thread, type, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `,
    [Number(senderAdminId), text, topic, messageType],
  );
  const id = inserted.rows[0]?.id;
  if (id == null) throw new Error('Failed to create agent message.');
  return selectMessageById(id);
}
