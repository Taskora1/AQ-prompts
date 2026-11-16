// Adds the prompt engagement counters (view_count / like_count) to prompts.
//
// IMPORTANT — run this ONLY through scripts/run-database-migration.mjs,
// which only supports Postgres (Neon). It keeps the migration record
// reviewable and syncs the Neon backup schema. The live D1 columns are
// added directly (d1.py) and by ensurePromptEngagementSchema()
// (src/lib/prompt-engagement-db.js) on the first engagement request after
// deploy. The DDL below is imported from src/lib/prompt-engagement-db.js
// so both paths use one source of truth.
//
// Prompt feedback needs no migration: it reuses public.site_reviews with
// source = 'prompt' (see src/lib/prompt-engagement-db.js), so submitted
// reviews show on the /feedback listing through the existing query.
import { getPgPool } from '../src/lib/db.js';
import {
  ADD_PROMPT_VIEW_COUNT_COLUMN_SQL,
  ADD_PROMPT_LIKE_COUNT_COLUMN_SQL,
} from '../src/lib/prompt-engagement-db.js';

const VERIFY_COLUMNS_SQL = `
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'prompts'
  AND column_name IN ('view_count', 'like_count')
ORDER BY column_name
`;

try {
  const db = getPgPool();

  console.log('Adding view_count / like_count columns to prompts (if missing)...');
  await db.query(ADD_PROMPT_VIEW_COUNT_COLUMN_SQL);
  await db.query(ADD_PROMPT_LIKE_COUNT_COLUMN_SQL);

  const columns = await db.query(VERIFY_COLUMNS_SQL);
  console.log(
    'Columns:',
    columns.rows
      .map((row) => `${row.column_name} ${row.data_type} default ${row.column_default}`)
      .join(', '),
  );

  console.log('Done: prompt engagement columns are ready.');
} catch (error) {
  console.error('Failed to add prompt engagement columns:', error.message);
  process.exitCode = 1;
} finally {
  await getPgPool().end();
}
