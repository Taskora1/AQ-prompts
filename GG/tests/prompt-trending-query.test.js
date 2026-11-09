import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import {
  clearPromptSlugsCache,
  getPromptSlugsForStats,
  getTrendingPromptsByIds,
} from '../src/lib/prompts-db.js';

let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;
let queryCount = 0;
let lastQuery;

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
      queryCount += 1;
      lastQuery = query;
      if (typeof query === 'string') return { rows: [] };
      return {
        rows: [{
          id: '7',
          title: 'Sample title',
          slug: 'sample-title',
          descriptionSource: 'A sample description.',
          image: '/images/sample.webp',
          images: ['/images/sample.webp'],
          category: 'Photo Editing',
          categories: ['Photo Editing'],
          useCase: 'Editing',
          createdAt: '2026-10-27T00:00:00.000Z',
        }],
      };
    },
  };
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

test('trending slug index reuses the same hourly cache and invalidation as stats', async () => {
  queryCount = 0;
  clearPromptSlugsCache();

  const statsSlugs = await getPromptSlugsForStats();
  const trendingSlugs = await getPromptSlugsForStats();

  assert.strictEqual(trendingSlugs, statsSlugs);
  assert.equal(queryCount, 1);
});

test('trending prompt query selects only output inputs and bounds description text in SQL', async () => {
  const [prompt] = await getTrendingPromptsByIds([7, '7', 0, -1, 1.5]);

  assert.deepEqual(lastQuery.values, [[7]]);
  assert.match(lastQuery.text, /LEFT\([\s\S]*REGEXP_REPLACE\([\s\S]*COALESCE\([\s\S]*NULLIF\(BTRIM\(REGEXP_REPLACE\(p\.intro[\s\S]*p\.prompt[\s\S]*2048[\s\S]*AS "descriptionSource"/);
  assert.match(lastQuery.text, /p\.id,\s*p\.title,\s*p\.slug/);
  assert.match(lastQuery.text, /p\.image,\s*p\.images/);
  assert.match(lastQuery.text, /AS category,[\s\S]*AS categories,[\s\S]*AS "useCase",\s*p\.created_at::text AS "createdAt"/);
  assert.doesNotMatch(lastQuery.text, /SELECT[\s\S]*p\.prompt\s*,/);
  assert.doesNotMatch(lastQuery.text, /p\.tags|p\.status,|p\.updated_at|primaryCategoryId|categoryIds|categorySlugs/);
  assert.equal(prompt.id, 7);
  assert.equal(prompt.title, 'Sample title');
  assert.equal(prompt.slug, 'sample-title');
  assert.equal(prompt.intro, 'A sample description.');
  assert.equal(prompt.prompt, '');
  assert.equal(prompt.category, 'Photo Editing');
  assert.equal(prompt.useCase, 'Editing');
  assert.deepEqual(prompt.images, ['/images/sample.webp']);
  assert.equal(prompt.createdAt, '2026-10-27T00:00:00.000Z');
});

test('trending route uses the bounded projection and hourly CDN refresh', async () => {
  const route = await readFile(new URL('../app/api/prompts/trending/route.js', import.meta.url), 'utf8');

  assert.match(route, /s-maxage=3600, stale-while-revalidate=3600/);
  assert.match(route, /getPromptSlugsForStats as getPromptSlugsForTrending/);
  assert.match(route, /getTrendingPromptsByIds/);
  assert.doesNotMatch(route, /getAllPromptSlugs|getSlimPromptsByIds/);
});
