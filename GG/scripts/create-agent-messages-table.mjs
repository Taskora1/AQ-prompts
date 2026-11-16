// Creates the agent_messages table for the admin agent chat panel
// (the async message board the two blog lanes and the supervisor use).
//
// IMPORTANT — run this ONLY through scripts/run-database-migration.mjs,
// which only supports Postgres (Neon). It keeps the migration record
// reviewable and syncs the Neon backup schema. The live D1 table is created
// by ensureAgentMessagesTable() (src/lib/agent-messages-db.js) on the first
// admin-panel or MCP request after deploy, following the same pattern as
// the blog_posts and password_reset_tokens tables. The DDL below is imported
// from src/lib/agent-messages-db.js so both paths use one source of truth.
import { getPgPool } from '../src/lib/db.js';
import {
  CREATE_AGENT_MESSAGES_TABLE_SQL,
  CREATE_AGENT_MESSAGES_CREATED_INDEX_SQL,
  CREATE_AGENT_MESSAGES_SENDER_INDEX_SQL,
} from '../src/lib/agent-messages-db.js';

const VERIFY_TABLE_SQL = `
SELECT to_regclass('agent_messages') AS table_name,
       COUNT(*)::int AS rows
FROM agent_messages
`;

const VERIFY_INDEX_SQL = `
SELECT indexname
FROM pg_indexes
WHERE tablename = 'agent_messages'
ORDER BY indexname
`;

try {
  const db = getPgPool();

  console.log('Creating agent_messages table (if missing)...');
  await db.query(CREATE_AGENT_MESSAGES_TABLE_SQL);
  await db.query(CREATE_AGENT_MESSAGES_CREATED_INDEX_SQL);
  await db.query(CREATE_AGENT_MESSAGES_SENDER_INDEX_SQL);

  const table = await db.query(VERIFY_TABLE_SQL);
  console.log('Table:', table.rows[0].table_name, '| Rows:', table.rows[0].rows);

  const indexes = await db.query(VERIFY_INDEX_SQL);
  console.log('Indexes:', indexes.rows.map((row) => row.indexname).join(', '));

  console.log('Done: agent_messages table is ready.');
} catch (error) {
  console.error('Failed to create agent_messages table:', error.message);
  process.exitCode = 1;
} finally {
  await getPgPool().end();
}
