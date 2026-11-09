import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPromptLibraryCategoriesMigration } from '../scripts/separate-prompt-library-categories.mjs';
import { DATABASE_MIGRATION_OPERATIONS } from '../scripts/lib/database-migration-safety.mjs';
import { validateCategoryInput } from '../src/lib/categories-db.js';

test('category input keeps the existing Photo default and accepts explicit Text scope', () => {
  assert.equal(validateCategoryInput({ name: 'Portraits' }).data.libraryType, 'photo');
  assert.equal(
    validateCategoryInput({ name: 'Writing', libraryType: 'text' }).data.libraryType,
    'text',
  );
  assert.equal(
    validateCategoryInput({ name: 'Writing', libraryType: 'other' }).valid,
    false,
  );
});

test('category scope migration remaps Text assignments while preserving Photo assignments', async () => {
  assert.ok(DATABASE_MIGRATION_OPERATIONS['separate-prompt-library-categories.mjs']);
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql === 'SHOW transaction_read_only') {
        return { rows: [{ transaction_read_only: 'off' }], rowCount: 1 };
      }
      if (sql.includes('FROM pg_constraint')) return { rows: [], rowCount: 0 };
      if (sql.includes('mismatched_assignments')) {
        return {
          rows: [{
            invalid_categories: 0,
            mismatched_assignments: 0,
            mismatched_primary_categories: 0,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  await applyPromptLibraryCategoriesMigration(client);

  assert.equal(statements[0], 'BEGIN');
  assert.ok(statements.some((sql) => /ADD COLUMN IF NOT EXISTS library_type/.test(sql)));
  assert.ok(statements.some((sql) => sql.includes('categories_library_type_slug_unique')));
  assert.ok(statements.some((sql) => sql.includes("SELECT source.name, source.slug, 'text'")));
  assert.ok(statements.some((sql) => /UPDATE public\.prompts p[\s\S]*p\.library_type = 'text'/.test(sql)));
  assert.ok(statements.some((sql) => /DELETE FROM public\.prompt_categories[\s\S]*p\.library_type = 'text'/.test(sql)));
  assert.equal(statements.at(-1), 'COMMIT');
  assert.doesNotMatch(statements.join('\n'), /\bDELETE\s+FROM\s+public\.prompts\b/i);
});
