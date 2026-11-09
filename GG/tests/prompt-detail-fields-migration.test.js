import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPromptDetailFieldsMigration } from '../scripts/add-prompt-detail-fields.mjs';
import { DATABASE_MIGRATION_OPERATIONS } from '../scripts/lib/database-migration-safety.mjs';

test('prompt detail migration is additive, idempotent, and preserves prompt records', async () => {
  assert.ok(DATABASE_MIGRATION_OPERATIONS['add-prompt-detail-fields.mjs']);
  const statements = [];
  const db = {
    async query(sql) {
      statements.push(sql);
      return { rows: [], rowCount: 0 };
    },
  };

  await applyPromptDetailFieldsMigration(db);

  assert.equal(statements[0], 'BEGIN');
  assert.match(statements[1], /ALTER TABLE prompts/);
  for (const column of ['variations', 'recommended_tool', 'tool_note', 'how_to_use', 'tools']) {
    assert.match(statements[1], new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
  }
  assert.match(statements[1], /DEFAULT '\[\]'::jsonb/);
  assert.match(statements[2], /IF NOT EXISTS/);
  assert.doesNotMatch(statements.join('\n'), /\b(?:UPDATE|DELETE|INSERT)\s+prompts\b/i);
  assert.equal(statements.at(-1), 'COMMIT');
});
