import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import { getSlimPromptsPage } from '../src/lib/prompts-db.js';

let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;
const queries = [];

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
      queries.push(typeof query === 'string' ? query : query.text);
      return { rows: [] };
    },
    async end() {},
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

test('random prompt listing uses stable seeded ordering for pagination', async () => {
  await getSlimPromptsPage({ limit: 12, offset: 12, sort: 'random', randomSeed: 48291 });

  assert.match(queries.at(-1), /ORDER BY md5\(p\.id::text \|\| ':' \|\| \$1::text\) LIMIT \$2 OFFSET \$3/);
});

test('latest prompt listing orders by publication date with an ID tie-breaker', async () => {
  await getSlimPromptsPage({ limit: 12, sort: 'latest' });

  assert.match(queries.at(-1), /ORDER BY p\.created_at DESC NULLS LAST, p\.id DESC LIMIT \$1 OFFSET \$2/);
});
