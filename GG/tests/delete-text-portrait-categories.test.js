import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translatePostgresToSqlite } from '../src/lib/pg-to-d1.js';
import { deleteTextPortraitCategories } from '../scripts/delete-text-portrait-categories.mjs';
import { DATABASE_MIGRATION_OPERATIONS } from '../scripts/lib/database-migration-safety.mjs';

test('deletes only requested Text categories and preserves prompts and other assignments', async () => {
  assert.ok(DATABASE_MIGRATION_OPERATIONS['delete-text-portrait-categories.mjs']);
  const statements = [];
  const client = {
    async query(sql, values = []) {
      statements.push({ sql, values });
      if (sql === 'SHOW transaction_read_only') {
        return { rows: [{ transaction_read_only: 'off' }], rowCount: 1 };
      }
      if (sql.includes('FROM public.categories') && sql.includes('FOR UPDATE')) {
        return {
          rows: [
            { id: 52, name: 'Business Portraits' },
            { id: 53, name: 'Female Portraits' },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes('WITH affected')) return { rows: [], rowCount: 11 };
      if (sql.includes('DELETE FROM public.prompt_categories')) return { rows: [], rowCount: 11 };
      if (sql.includes('DELETE FROM public.categories')) {
        return { rows: [{ id: 52 }, { id: 53 }], rowCount: 2 };
      }
      if (sql.includes('categories_remaining')) {
        return {
          rows: [{
            categories_remaining: 0,
            assignments_remaining: 0,
            primary_categories_remaining: 0,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const result = await deleteTextPortraitCategories(client);

  assert.deepEqual(result, {
    categoriesDeleted: 2,
    promptsUpdated: 11,
    assignmentsRemoved: 11,
    categoriesRemaining: 0,
    assignmentsRemaining: 0,
  });
  assert.deepEqual(statements[0], { sql: 'BEGIN', values: [] });
  assert.equal(statements.at(-1).sql, 'COMMIT');
  const update = statements.find(({ sql }) => sql.includes('WITH affected')).sql;
  assert.match(update, /c\.library_type = 'text'/);
  // The call site still emits `= ANY($1::bigint[])`; on the D1 path the
  // translator expands each array binding to IN (?, ?, ...) with one
  // placeholder per id (SQLite has no array parameters).
  const translated = statements
    .filter(({ values }) => values.length > 0)
    .map(({ sql, values }) => translatePostgresToSqlite(sql, values));
  assert.equal(translated.length, 3);
  for (const item of translated) {
    assert.doesNotMatch(item.sql, /=\s*ANY\s*\(/i);
    assert.doesNotMatch(item.sql, /::bigint/i);
  }
  const translatedUpdate = translated.find(({ sql }) => sql.includes('WITH affected'));
  assert.match(translatedUpdate.sql, /p\.primary_category_id IN \(\?, \?\)/);
  assert.match(translatedUpdate.sql, /pc\.category_id IN \(\?, \?\)/);
  assert.match(translatedUpdate.sql, /NOT \(c\.id IN \(\?, \?\)\)/);
  assert.deepEqual(translatedUpdate.values, [52, 53, 52, 53, 52, 53]);
  const translatedDeletes = translated.filter(({ sql }) => /^DELETE FROM/i.test(sql.trim()));
  assert.equal(translatedDeletes.length, 2);
  for (const item of translatedDeletes) {
    assert.match(item.sql, /IN \(\?, \?\)/);
    assert.deepEqual(item.values, [52, 53]);
  }
  assert.doesNotMatch(statements.map(({ sql }) => sql).join('\n'), /DELETE\s+FROM\s+public\.prompts/i);
  assert.ok(statements.every(({ values }) => (
    values.length === 0 || values[0].every((id) => [52, 53].includes(id))
  )));
});

test('rolls back if deleting Text Portrait categories cannot be verified', async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql === 'SHOW transaction_read_only') {
        return { rows: [{ transaction_read_only: 'off' }], rowCount: 1 };
      }
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 52, name: 'Business Portraits' }], rowCount: 1 };
      }
      if (sql.includes('categories_remaining')) {
        return {
          rows: [{
            categories_remaining: 1,
            assignments_remaining: 0,
            primary_categories_remaining: 0,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  await assert.rejects(
    deleteTextPortraitCategories(client),
    /deletion verification failed/,
  );
  assert.equal(statements.at(-1), 'ROLLBACK');
});
