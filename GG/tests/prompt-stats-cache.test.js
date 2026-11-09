import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import {
  clearPromptsCache,
  clearPromptSlugsCache,
  getAllPromptSlugs,
  getPromptSlugsForStats,
} from '../src/lib/prompts-db.js';

let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;
let originalNow;
let now;
let queryCount = 0;

before(() => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalPostgresUrl = process.env.POSTGRES_URL;
  originalPrismaUrl = process.env.POSTGRES_PRISMA_URL;
  originalPool = globalThis.__dbPgPool;
  originalNow = Date.now;
  now = originalNow();
  Date.now = () => now;
  process.env.DATABASE_URL = 'postgres://localhost/unit_test';
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async query() {
      queryCount += 1;
      return {
        rows: [{
          id: '7',
          slug: `prompt-${queryCount}`,
          status: 'published',
          should_noindex: false,
          title: 'Sample prompt',
        }],
      };
    },
  };
});

after(() => {
  Date.now = originalNow;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
  if (originalPrismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
  else process.env.POSTGRES_PRISMA_URL = originalPrismaUrl;
  if (originalPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = originalPool;
});

test('stats slug index shares a query for one hour and is invalidated on prompt cache clears', async () => {
  queryCount = 0;
  clearPromptSlugsCache();

  const [first, concurrent] = await Promise.all([
    getPromptSlugsForStats(),
    getPromptSlugsForStats(),
  ]);
  assert.equal(first[0].slug, 'prompt-1');
  assert.equal(concurrent[0].slug, 'prompt-1');
  assert.equal(queryCount, 1);

  now += 59 * 60 * 1000;
  assert.equal((await getPromptSlugsForStats())[0].slug, 'prompt-1');
  assert.equal(queryCount, 1);

  now += 60 * 1000;
  assert.equal((await getPromptSlugsForStats())[0].slug, 'prompt-2');
  assert.equal(queryCount, 2);

  clearPromptsCache();
  assert.equal((await getPromptSlugsForStats())[0].slug, 'prompt-3');
  assert.equal(queryCount, 3);
});

test('stats slug cache does not lengthen the shared slug cache used by other endpoints', async () => {
  queryCount = 0;
  clearPromptSlugsCache();

  await getPromptSlugsForStats();
  await getAllPromptSlugs();
  assert.equal(queryCount, 2);
});

test('stats route uses an hourly CDN refresh and the dedicated slug cache', async () => {
  const route = await readFile(new URL('../app/api/prompts/stats/route.js', import.meta.url), 'utf8');
  const promptDb = await readFile(new URL('../src/lib/prompts-db.js', import.meta.url), 'utf8');
  assert.match(route, /s-maxage=3600, stale-while-revalidate=1800/);
  assert.match(route, /Cache-Control': 'public, max-age=60, stale-while-revalidate=240'/);
  assert.match(route, /getPromptSlugsForStats/);
  assert.doesNotMatch(route, /getAllPromptSlugs/);
  assert.match(promptDb, /const SLUGS_CACHE_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(promptDb, /const STATS_PROMPT_SLUGS_CACHE_TTL_MS = 60 \* 60 \* 1000/);
});
