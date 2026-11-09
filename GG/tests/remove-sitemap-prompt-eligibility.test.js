import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { applyRemoveSitemapPromptEligibilityMigration } from '../scripts/remove-sitemap-prompt-eligibility.mjs';
import { DATABASE_MIGRATION_OPERATIONS } from '../scripts/lib/database-migration-safety.mjs';

test('sitemap flag removal is guarded, transactional, and drops no other column', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      const query = String(sql);
      calls.push(query);
      if (query.includes('SHOW transaction_read_only')) {
        return { rows: [{ transaction_read_only: 'off' }] };
      }
      if (query.includes('information_schema.columns')) {
        return { rows: [{ remaining: 0 }] };
      }
      return { rows: [] };
    },
  };

  assert.ok(DATABASE_MIGRATION_OPERATIONS['remove-sitemap-prompt-eligibility.mjs']);
  assert.deepEqual(await applyRemoveSitemapPromptEligibilityMigration(client), {
    column_removed: true,
  });
  assert.equal(calls[0], 'BEGIN');
  assert.match(calls[2], /DROP COLUMN IF EXISTS is_sitemap_eligible/);
  assert.doesNotMatch(calls[2], /is_public_eligible/);
  assert.equal(calls.at(-1), 'COMMIT');
});

test('sitemap flag removal rolls back when verification fails', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      const query = String(sql);
      calls.push(query);
      if (query.includes('SHOW transaction_read_only')) {
        return { rows: [{ transaction_read_only: 'off' }] };
      }
      if (query.includes('information_schema.columns')) {
        return { rows: [{ remaining: 1 }] };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    applyRemoveSitemapPromptEligibilityMigration(client),
    /column removal verification failed/,
  );
  assert.equal(calls.at(-1), 'ROLLBACK');
});

test('prompt sitemap eligibility is calculated in code rather than stored in the database', async () => {
  const [promptsDb, promptAdminDb, textAdminDb, scheduledRoute, addMigration, backfill] = await Promise.all([
    readFile(new URL('../src/lib/prompts-db.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/prompts-admin-db.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/text-prompts-admin-db.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/api/prompts/scheduled/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/add-public-prompt-eligibility.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/backfill-public-prompt-eligibility.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(promptsDb, /function isSitemapEligiblePrompt/);
  assert.doesNotMatch(promptsDb, /is_sitemap_eligible/);
  assert.doesNotMatch(promptAdminDb, /is_sitemap_eligible|isSitemapEligible/);
  assert.doesNotMatch(textAdminDb, /is_sitemap_eligible/);
  assert.doesNotMatch(scheduledRoute, /is_sitemap_eligible|isSitemapEligible/);
  assert.doesNotMatch(addMigration, /is_sitemap_eligible/);
  assert.doesNotMatch(backfill, /is_sitemap_eligible|isSitemapEligible/);
});
