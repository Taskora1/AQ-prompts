import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import {
  clearPromptsCache,
  getAllPrompts,
  getPromptListingPagePayload,
  getPublishedPromptCategorySlugs,
  getSlimPromptsPage,
  getSlimPromptsPayload,
} from '../src/lib/prompts-db.js';

// Regression tests for the top-3 database optimization fixes (2026-11-11):
// Fix 1 — COUNT(*) OVER() dropped from the listing path; the total comes
// from a parallel countSlimPrompts() call.
// Fix 2 — per-row LATERAL category join replaced by a GROUP BY aggregate
// on full-table fetches (the paginated path keeps the LATERAL, where it
// runs only for the returned rows).
// Fix 3 — the listing payload fetches ids first, then full text for the 24.
//
// Output identity vs the old queries was verified against the live database
// at implementation time: the GROUP BY form returned byte-identical JSON
// for all 576 published photo prompts (0 mismatches, including order), the
// ids-first listing returned the same 24 ids in the same order with the
// same totalCount, and the direct-join category slugs matched (15 slugs).
// These mocked-pool tests lock in the SQL shape and the output shape so a
// future edit cannot silently reintroduce the window, the per-row LATERAL
// on a full fetch, or the materialize-all-rows CTE.

let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;
const queries = [];
let mockCountTotal = 54;
let mockPageRows = [];

const slimFixtureRows = [
  {
    id: 818,
    title: 'Test Prompt One',
    prompt: 'A test prompt for couples and celebrations.',
    slug: 'test-prompt-one',
    image: '',
    images: [],
    imageAlt: 'Alt one',
    category: 'Couples',
    categories: ['Couples', 'Celebrations'],
    useCase: 'Use one',
    tags: ['test'],
    status: 'published',
    primaryCategoryId: 5,
    primaryCategorySlug: 'couples',
    categoryIds: [5, 9],
    categorySlugs: ['couples', 'celebrations'],
    createdAt: '2026-11-01T00:00:00.000Z',
    intro: 'Intro one',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    // A prompt with NO categories: the GROUP BY form must return [] here,
    // not [null]. JSONB_AGG includes NULL inputs as JSON nulls, and a
    // prompt with no categories contributes exactly one all-NULL joined
    // row — the FILTER (WHERE c.id IS NOT NULL) is what keeps this empty.
    id: 817,
    title: 'Test Prompt Two',
    prompt: 'Another test prompt with no categories.',
    slug: 'test-prompt-two',
    image: '',
    images: [],
    imageAlt: 'Alt two',
    category: null,
    categories: [],
    useCase: 'Use two',
    tags: ['test'],
    status: 'published',
    primaryCategoryId: null,
    primaryCategorySlug: null,
    categoryIds: [],
    categorySlugs: [],
    createdAt: '2026-10-31T00:00:00.000Z',
    intro: 'Intro two',
    updatedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 816,
    title: 'Test Prompt Three',
    prompt: 'Third test prompt for business.',
    slug: 'test-prompt-three',
    image: '',
    images: [],
    imageAlt: 'Alt three',
    category: 'Business',
    categories: ['Business'],
    useCase: 'Use three',
    tags: ['test'],
    status: 'published',
    primaryCategoryId: 3,
    primaryCategorySlug: 'business',
    categoryIds: [3],
    categorySlugs: ['business'],
    createdAt: '2026-10-30T00:00:00.000Z',
    intro: 'Intro three',
    updatedAt: '2026-10-30T00:00:00.000Z',
  },
];

const listingFixtureRows = slimFixtureRows.map((row) => ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  prompt: row.prompt,
  image: row.image,
  imageAlt: row.imageAlt,
  totalCount: 576,
}));

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
      const text = typeof query === 'string' ? query : query.text;
      queries.push(text);
      // The listing query carries its own totals CTE, so it must be
      // routed before the standalone-count branch.
      if (/eligible_ids/.test(text)) {
        return { rows: listingFixtureRows };
      }
      if (/COUNT\(\*\)/.test(text)) {
        return { rows: [{ totalCount: mockCountTotal }] };
      }
      if (/category_slug/.test(text)) {
        return { rows: [{ category_slug: 'business' }, { category_slug: 'couples' }] };
      }
      return { rows: mockPageRows };
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
  mockCountTotal = 54;
  mockPageRows = slimFixtureRows;
  clearPromptsCache();
});

test('Fix 1: paginated listing has no window total; total comes from a parallel count', async () => {
  const { prompts, totalCount } = await getSlimPromptsPage({ limit: 12, sort: 'latest' });

  assert.equal(queries.length, 2, 'page query + count query, run in parallel');
  const [pageSql, countSql] = queries;
  assert.doesNotMatch(pageSql, /COUNT\(\*\) OVER\(\)/);
  assert.match(countSql, /SELECT COUNT\(\*\)::int AS "totalCount"/);
  assert.doesNotMatch(countSql, /LEFT JOIN LATERAL/);
  assert.equal(totalCount, 54);
  // The row-level totalCount is gone: consumers read the top-level total.
  assert.equal(prompts.length, 3);
  assert.ok(prompts.every((prompt) => !('totalCount' in prompt)));
  assert.deepEqual(prompts[0].categories, ['Couples', 'Celebrations']);
});

test('Fix 1: a beyond-end page reports the count instead of 0', async () => {
  mockPageRows = [];
  mockCountTotal = 54;

  const { prompts, totalCount } = await getSlimPromptsPage({ limit: 12, offset: 1000 });

  assert.equal(prompts.length, 0);
  assert.equal(totalCount, 54);
});

test('Fix 1: the paginated path keeps the per-row LATERAL (it runs only for the returned rows)', async () => {
  await getSlimPromptsPage({ limit: 12, sort: 'latest' });

  const [pageSql] = queries;
  assert.match(pageSql, /LEFT JOIN LATERAL/);
  assert.doesNotMatch(pageSql, /GROUP BY/);
});

test('Fix 2: full slim fetch aggregates categories with GROUP BY, not a per-row LATERAL', async () => {
  const { prompts } = await getSlimPromptsPayload();

  assert.equal(queries.length, 1);
  const [sql] = queries;
  assert.match(sql, /GROUP BY p\.id, primary_category\.id/);
  assert.match(sql, /JSONB_AGG\(c\.name ORDER BY pc\.position, c\.id\) FILTER \(WHERE c\.id IS NOT NULL\)/);
  assert.doesNotMatch(sql, /LEFT JOIN LATERAL/);
  // Output shape identical to the old LATERAL form, including order and
  // the empty-category row.
  assert.deepEqual(prompts.map((prompt) => prompt.id), [818, 817, 816]);
  assert.deepEqual(prompts[0].categories, ['Couples', 'Celebrations']);
  assert.deepEqual(prompts[0].categoryIds, [5, 9]);
  assert.deepEqual(prompts[0].categorySlugs, ['couples', 'celebrations']);
  assert.deepEqual(prompts[1].categories, []);
  assert.deepEqual(prompts[1].categoryIds, []);
  assert.deepEqual(prompts[1].categorySlugs, []);
  assert.deepEqual(prompts[2].categories, ['Business']);
});

test('Fix 2: full fetch aggregates categories with GROUP BY, not a per-row LATERAL', async () => {
  const prompts = await getAllPrompts();

  assert.equal(queries.length, 1);
  const [sql] = queries;
  assert.match(sql, /GROUP BY p\.id, primary_category\.id/);
  assert.match(sql, /JSONB_AGG\(c\.name ORDER BY pc\.position, c\.id\) FILTER \(WHERE c\.id IS NOT NULL\)/);
  assert.doesNotMatch(sql, /LEFT JOIN LATERAL/);
  assert.deepEqual(prompts[1].categories, []);
});

test('Fix 2: category slugs come from a direct join, not a per-row LATERAL', async () => {
  const slugs = await getPublishedPromptCategorySlugs();

  assert.equal(queries.length, 1);
  const [sql] = queries;
  assert.doesNotMatch(sql, /LATERAL/);
  assert.match(sql, /JOIN prompt_categories pc ON pc\.prompt_id = p\.id/);
  assert.deepEqual(slugs, ['business', 'couples']);
});

test('Fix 3: listing payload fetches ids first, then text for those rows only', async () => {
  const payload = await getPromptListingPagePayload();

  assert.equal(queries.length, 1);
  const [sql] = queries;
  assert.match(sql, /WITH eligible_ids AS/);
  assert.match(sql, /octet_length\(p\.title\) > 0/);
  assert.match(sql, /JOIN prompts p ON p\.id = eligible_ids\.id/);
  assert.doesNotMatch(sql, /eligible_rows/);
  assert.equal(payload.totalCount, 576);
  assert.deepEqual(payload.prompts.map((prompt) => prompt.id), [818, 817, 816]);
});
