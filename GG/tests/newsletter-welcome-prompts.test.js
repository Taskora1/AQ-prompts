import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import {
  clearPromptsCache,
  getNewsletterWelcomePrompts,
} from '../src/lib/prompts-db.js';

let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalVercelEnv;
let originalPool;
let originalNow;
let now;
let queryCount = 0;
let lastQuery = '';

before(() => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalPostgresUrl = process.env.POSTGRES_URL;
  originalPrismaUrl = process.env.POSTGRES_PRISMA_URL;
  originalVercelEnv = process.env.VERCEL_ENV;
  originalPool = globalThis.__dbPgPool;
  originalNow = Date.now;
  now = originalNow();
  Date.now = () => now;
  process.env.DATABASE_URL = 'postgres://localhost/unit_test';
  process.env.VERCEL_ENV = 'production';
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;

  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async query(query) {
      queryCount += 1;
      lastQuery = typeof query === 'string' ? query : query.text;
      return {
        rows: Array.from({ length: 5 }, (_, index) => ({
          title: `  Prompt   ${index + 1} `,
          prompt: ` Complete prompt body ${index + 1} `,
          intro: ` Introduction ${index + 1} `,
        })),
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
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
  if (originalPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = originalPool;
});

test('newsletter welcome query returns the first five normalized prompts and caches for five minutes', async () => {
  queryCount = 0;
  clearPromptsCache();

  const prompts = await getNewsletterWelcomePrompts();

  assert.equal(prompts.length, 5);
  assert.deepEqual(prompts[0], {
    title: 'Prompt 1',
    prompt: 'Complete prompt body 1',
    intro: 'Introduction 1',
    bestUseCase: '',
  });
  assert.match(lastQuery, /SELECT\s+p\.title,\s*p\.prompt,\s*p\.intro\s+FROM prompts p/i);
  assert.match(lastQuery, /p\.status = 'published'[\s\S]*p\.library_type = 'photo'/i);
  assert.match(lastQuery, /BTRIM\(REGEXP_REPLACE\(COALESCE\(p\.title,[\s\S]*BTRIM\(REGEXP_REPLACE\(COALESCE\(p\.prompt,/i);
  assert.match(lastQuery, /ORDER BY p\.id\s+LIMIT 5/i);
  assert.doesNotMatch(lastQuery, /p\.(?:tags|images|categories|use_case|created_at|updated_at)\b/i);
  assert.equal(queryCount, 1);

  assert.strictEqual(await getNewsletterWelcomePrompts(), prompts);
  assert.equal(queryCount, 1);

  now += 5 * 60 * 1000;
  await getNewsletterWelcomePrompts();
  assert.equal(queryCount, 2);

  clearPromptsCache();
  await getNewsletterWelcomePrompts();
  assert.equal(queryCount, 3);
});

test('newsletter route uses the dedicated prompt query instead of the full slim payload', async () => {
  const route = await readFile(
    new URL('../app/api/newsletter/subscribe/route.js', import.meta.url),
    'utf8',
  );

  assert.match(route, /getNewsletterWelcomePrompts/);
  assert.doesNotMatch(route, /getSlimAllPrompts/);
});
