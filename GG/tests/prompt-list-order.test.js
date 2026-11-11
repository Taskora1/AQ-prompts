import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import { translatePostgresToSqlite } from '../src/lib/pg-to-d1.js';
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
      const sql = typeof query === 'string' ? query : query.text;
      const values = typeof query === 'string' ? [] : (query.values || []);
      queries.push({ sql, values });
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

beforeEach(() => {
  queries.length = 0;
});

test('random prompt listing uses stable seeded ordering for pagination', async () => {
  await getSlimPromptsPage({ limit: 12, offset: 12, sort: 'random', randomSeed: 48291 });

  // getSlimPromptsPage issues two queries in parallel (page + count), so
  // the page query is the one carrying the ORDER BY, not the last query.
  const pageQuery = queries.find(({ sql }) => /ORDER BY/.test(sql));
  // The call site still emits the Postgres md5 seed expression; on the
  // D1 path the translator rewrites it to a seed-mixed integer expression
  // (SQLite has no md5()).
  assert.match(pageQuery.sql, /ORDER BY md5\(p\.id::text \|\| ':' \|\| \$1::text\) LIMIT \$2 OFFSET \$3/);
  const translated = translatePostgresToSqlite(pageQuery.sql, pageQuery.values);
  assert.doesNotMatch(translated.sql, /md5\(/i);
  assert.match(
    translated.sql,
    /ORDER BY \(\(p\.id \* \(2654435761 \+ \(\(abs\(\? % 2147483647\) \* 2654435761\) % 2147483647\) \* 2\)\) % 2147483647\) LIMIT \? OFFSET \?/,
  );
  // The seed is bound, not baked into the SQL: the same seed translates
  // identically, and a different seed binds a different value (the SQL
  // template itself is seed-independent).
  assert.deepEqual(translated.values, [48291, 12, 12]);
  assert.deepEqual(translatePostgresToSqlite(pageQuery.sql, [48291, 12, 12]), translated);
  assert.notEqual(
    translatePostgresToSqlite(pageQuery.sql, [48292, 12, 12]).values[0],
    translated.values[0],
  );
});

test('latest prompt listing orders by publication date with an ID tie-breaker', async () => {
  await getSlimPromptsPage({ limit: 12, sort: 'latest' });

  const pageSql = queries.find(({ sql }) => /ORDER BY/.test(sql));
  assert.match(pageSql.sql, /ORDER BY p\.created_at DESC NULLS LAST, p\.id DESC LIMIT \$1 OFFSET \$2/);
  const translated = translatePostgresToSqlite(pageSql.sql, pageSql.values);
  assert.match(translated.sql, /ORDER BY p\.created_at DESC NULLS LAST, p\.id DESC LIMIT \? OFFSET \?/);
  assert.deepEqual(translated.values, [12, 0]);
});
