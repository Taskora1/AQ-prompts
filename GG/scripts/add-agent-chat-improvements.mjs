// Adds the agent-chat improvements schema (display names, message types,
// per-admin read receipts) to the Neon backup database.
//
// IMPORTANT — run this ONLY through scripts/run-database-migration.mjs,
// which only supports Postgres (Neon). It keeps the migration record
// reviewable and syncs the Neon backup schema. The live D1 schema is
// created by ensureAgentMessagesTable() (src/lib/agent-messages-db.js) and
// ensureUsersDisplayNameColumn() (src/lib/admin-users-db.js) on the first
// admin request after deploy, following the same pattern as the
// agent_messages and password_reset_tokens tables. The DDL below is
// imported from those lib files so both paths use one source of truth.
//
// What it does (all idempotent — safe to run twice):
//   users.display_name            — the chat display name each admin sets
//                                   for themselves (email stays the identity)
//   agent_messages.type           — message type badge (default 'chat')
//   agent_message_reads           — per-admin last-read message id
import { getPgPool } from '../src/lib/db.js';
import { ADD_USERS_DISPLAY_NAME_COLUMN_SQL } from '../src/lib/admin-users-db.js';
import {
  ADD_AGENT_MESSAGES_TYPE_COLUMN_SQL,
  CREATE_AGENT_MESSAGE_READS_TABLE_SQL,
  CREATE_AGENT_MESSAGES_TYPE_INDEX_SQL,
} from '../src/lib/agent-messages-db.js';

const VERIFY_COLUMNS_SQL = `
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('users', 'agent_messages', 'agent_message_reads')
  AND column_name IN ('display_name', 'type', 'admin_id', 'last_read_message_id')
ORDER BY table_name, column_name
`;

const VERIFY_READS_TABLE_SQL = `
SELECT to_regclass('agent_message_reads') AS table_name,
       COUNT(*)::int AS rows
FROM agent_message_reads
`;

try {
  const db = getPgPool();

  console.log('Adding users.display_name (if missing)...');
  await db.query(ADD_USERS_DISPLAY_NAME_COLUMN_SQL);

  console.log('Adding agent_messages.type (if missing)...');
  await db.query(ADD_AGENT_MESSAGES_TYPE_COLUMN_SQL);

  console.log('Creating agent_message_reads table (if missing)...');
  await db.query(CREATE_AGENT_MESSAGE_READS_TABLE_SQL);
  await db.query(CREATE_AGENT_MESSAGES_TYPE_INDEX_SQL);

  const columns = await db.query(VERIFY_COLUMNS_SQL);
  console.log(
    'Columns:',
    columns.rows.map((row) => `${row.table_name}.${row.column_name} (${row.data_type})`).join(', '),
  );

  const reads = await db.query(VERIFY_READS_TABLE_SQL);
  console.log('Table:', reads.rows[0].table_name, '| Rows:', reads.rows[0].rows);

  console.log('Done: agent-chat improvements schema is ready.');
} catch (error) {
  console.error('Failed to add agent-chat improvements schema:', error.message);
  process.exitCode = 1;
} finally {
  await getPgPool().end();
}
