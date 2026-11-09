import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import {
  listAuthorProfileOptions,
  listAuthorSitemapRows,
} from '../src/lib/author-profiles-db.js';

const queries = [];
let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;

before(() => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalPostgresUrl = process.env.POSTGRES_URL;
  originalPrismaUrl = process.env.POSTGRES_PRISMA_URL;
  originalPool = globalThis.__dbPgPool;
  process.env.DATABASE_URL = 'postgres://localhost/unit_test';
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async query(query) {
      const sql = typeof query === 'string' ? query : query.text;
      queries.push(sql);
      if (/updated_at/i.test(sql)) {
        return { rows: [{ slug: 'sample-author', updatedAt: '2026-10-22T00:00:00Z' }] };
      }
      return { rows: [{ id: '7', slug: 'sample-author', name: 'Sample Author' }] };
    },
    async end() {},
  };
});

beforeEach(() => {
  queries.length = 0;
});

after(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
  if (originalPrismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
  else process.env.POSTGRES_PRISMA_URL = originalPrismaUrl;
  if (originalPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = originalPool;
});

test('author dropdown query returns only the fields the editor uses', async () => {
  const authors = await listAuthorProfileOptions();
  assert.deepEqual(authors, [{ id: 7, slug: 'sample-author', name: 'Sample Author' }]);
  assert.match(queries[0], /SELECT id, slug, name/i);
  assert.doesNotMatch(queries[0], /bio|social_links|avatar_url|created_at|updated_at/i);

  const route = await readFile(new URL('../app/admin/api/authors/route.js', import.meta.url), 'utf8');
  assert.match(route, /listAuthorProfileOptions/);
});

test('author sitemap query returns only route and modified-date data', async () => {
  const authors = await listAuthorSitemapRows();
  assert.deepEqual(authors, [{
    slug: 'sample-author',
    url: '/author/sample-author',
    updatedAt: '2026-10-22T00:00:00Z',
  }]);
  assert.match(queries[0], /SELECT slug, updated_at::text AS "updatedAt"/i);
  assert.doesNotMatch(queries[0], /bio|social_links|avatar_url/i);

  const sitemap = await readFile(new URL('../app/sitemap.js', import.meta.url), 'utf8');
  assert.match(sitemap, /listAuthorSitemapRows/);
});
