import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import {
  getPublicTextPromptLibrary,
  hasIndexablePublicTextPrompts,
} from '../src/lib/text-prompts-public-db.js';

const queries = [];
const promptRows = [
  {
    id: 1,
    title: 'Prompt for clear writing',
    prompt: 'Write a clear introduction.\nKeep the line break.',
    slug: 'clear-writing-prompt',
    intro: 'A writing prompt.',
    useCase: 'Writing',
    tags: ['writing'],
    status: 'published',
    libraryType: 'text',
    shouldNoindex: false,
    isPublicEligible: true,
    image: null,
    images: [],
    ogImage: null,
    generationTestedTool: 'ChatGPT',
    createdAt: '2026-06-01T12:00:00Z',
    categories: ['Writing'],
    categorySlugs: ['writing'],
  },
  {
    id: 2,
    title: 'Prompt for SEO planning',
    prompt: 'Create an SEO plan for this page.',
    slug: 'seo-planning-prompt',
    intro: 'A practical SEO prompt.',
    useCase: 'SEO',
    tags: ['seo'],
    status: 'published',
    libraryType: 'text',
    shouldNoindex: false,
    isPublicEligible: true,
    image: null,
    images: [],
    ogImage: null,
    generationTestedTool: '',
    createdAt: '2026-06-02T12:00:00Z',
    categories: ['SEO'],
    categorySlugs: ['seo'],
  },
  {
    id: 3,
    title: 'Draft should not be public',
    prompt: 'This unpublished draft should never appear.',
    slug: 'draft-prompt',
    intro: '',
    useCase: 'Writing',
    tags: [],
    status: 'draft',
    libraryType: 'text',
    shouldNoindex: false,
    isPublicEligible: true,
    image: null,
    images: [],
    ogImage: null,
    generationTestedTool: '',
    createdAt: '2026-06-03T12:00:00Z',
    categories: ['Writing'],
    categorySlugs: ['writing'],
  },
  {
    id: 4,
    title: 'Disallowed sample',
    prompt: 'This prompt mentions a celebrity subject.',
    slug: 'celebrity-sample',
    intro: '',
    useCase: 'Writing',
    tags: [],
    status: 'published',
    libraryType: 'text',
    shouldNoindex: false,
    isPublicEligible: false,
    image: null,
    images: [],
    ogImage: null,
    generationTestedTool: '',
    createdAt: '2026-06-04T12:00:00Z',
    categories: ['Writing'],
    categorySlugs: ['writing'],
  },
  {
    id: 5,
    title: 'Noindex prompt',
    prompt: 'This explicitly noindexed prompt must not be shown.',
    slug: 'noindex-prompt',
    intro: '',
    useCase: 'Writing',
    tags: [],
    status: 'published',
    libraryType: 'text',
    shouldNoindex: true,
    isPublicEligible: true,
    image: null,
    images: [],
    ogImage: null,
    generationTestedTool: '',
    createdAt: '2026-06-05T12:00:00Z',
    categories: ['Writing'],
    categorySlugs: ['writing'],
  },
];

let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;

// The text library is computed in JS now (see queryPublicTextLibrary in
// src/lib/text-prompts-public-db.js): the database supplies only the
// eligible prompts (one narrow SELECT) and the prompt/category junction
// rows (one SELECT), and the category aggregation, summary, search /
// category matching, sorting and paging happen in JS. The mock answers
// those two SELECTs (plus the SELECT EXISTS indexability probe) from the
// promptRows fixture. The fixture prompts have a single category each,
// which is their primary category; assigned (non-primary) junction rows
// are the fixture categories after the first.
const categoryIdsBySlug = new Map();
function categoryIdForSlug(slug) {
  if (!categoryIdsBySlug.has(slug)) {
    categoryIdsBySlug.set(slug, 100 + categoryIdsBySlug.size);
  }
  return categoryIdsBySlug.get(slug);
}

function resultFor(sql, values = []) {
  if (/SELECT EXISTS/i.test(sql)) {
    return {
      rows: [{
        eligible: promptRows.some((row) =>
          row.libraryType === 'text'
          && row.status === 'published'
          && !row.shouldNoindex
          && row.isPublicEligible
        ),
      }],
    };
  }
  const eligibleRows = promptRows.filter((row) =>
    row.libraryType === 'text'
    && row.status === 'published'
    && !row.shouldNoindex
    && row.isPublicEligible
  );
  // The eligible-prompts SELECT: one narrow row per eligible prompt, with
  // the primary category joined in.
  if (/FROM prompts p/i.test(sql) && /LEFT JOIN categories primary_category/i.test(sql)) {
    return {
      rows: eligibleRows.map((row) => ({
        id: row.id,
        title: row.title,
        prompt: row.prompt,
        slug: row.slug,
        intro: row.intro,
        useCase: row.useCase,
        tags: row.tags,
        generationTestedTool: row.generationTestedTool,
        createdAt: row.createdAt,
        createdAtSort: row.createdAt,
        primaryCategoryId: row.categorySlugs.length > 0
          ? categoryIdForSlug(row.categorySlugs[0])
          : null,
        primaryCategoryName: row.categories[0] || null,
        primaryCategorySlug: row.categorySlugs[0] || null,
      })),
    };
  }
  // The junction SELECT: assigned categories per prompt (the primary
  // arrives on the prompts row, so it is excluded here by the caller).
  if (/FROM prompt_categories pc/i.test(sql)) {
    const rows = [];
    for (const row of eligibleRows) {
      row.categories.slice(1).forEach((name, index) => {
        rows.push({
          promptId: row.id,
          position: index + 1,
          categoryId: categoryIdForSlug(row.categorySlugs[index + 1]),
          name,
          slug: row.categorySlugs[index + 1],
        });
      });
    }
    return { rows };
  }
  return { rows: [] };
}

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
    async query(query, values = []) {
      const sql = typeof query === 'string' ? query : query.text;
      queries.push({ sql, values });
      return resultFor(sql, values);
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

test('public Text queries fetch eligible rows once and compute the library in JS', async () => {
  const result = await getPublicTextPromptLibrary();
  // Two SELECTs, no CTEs: the eligible prompts and the junction rows.
  assert.equal(queries.length, 2);
  const promptsQuery = queries.find(({ sql }) => /FROM prompts p/i.test(sql));
  const junctionQuery = queries.find(({ sql }) => /FROM prompt_categories pc/i.test(sql));
  assert.ok(promptsQuery);
  assert.ok(junctionQuery);
  // The eligibility filter still lives in SQL, on one narrow SELECT.
  assert.match(promptsQuery.sql, /p\.library_type = 'text'/i);
  assert.match(promptsQuery.sql, /p\.status = 'published'/i);
  assert.match(promptsQuery.sql, /p\.is_public_eligible = true/i);
  assert.match(promptsQuery.sql, /COALESCE\(p\.should_noindex, false\) = false/i);
  assert.match(promptsQuery.sql, /SELECT\s+p\.id,\s+p\.title,\s+p\.prompt,\s+p\.slug,\s+p\.intro/i);
  assert.doesNotMatch(promptsQuery.sql, /SELECT\s+\*/i);
  assert.doesNotMatch(promptsQuery.sql, /SELECT[\s\S]*p\.images|p\.og_image/i);
  assert.match(junctionQuery.sql, /JOIN categories c ON c\.id = pc\.category_id/i);
  // The old CTE machinery (eligible_prompts / categorized_prompts with
  // UNNEST / jsonb_array_elements_text / POSITION, and SQL-side LIMIT /
  // OFFSET paging) is gone: aggregation, summary, matching, sorting and
  // paging happen in JS now.
  for (const query of queries) {
    assert.doesNotMatch(query.sql, /WITH eligible_prompts/i);
    assert.doesNotMatch(query.sql, /FROM categorized_prompts/i);
    assert.doesNotMatch(query.sql, /UNNEST\(/i);
    assert.doesNotMatch(query.sql, /jsonb_array_elements_text/i);
    assert.doesNotMatch(query.sql, /LIMIT \$\d+ OFFSET \$\d+/i);
  }
  assert.equal(result.total, 2);
  assert.equal(result.prompts.length, 2);
  assert(!result.prompts.some((prompt) => prompt.title.includes('Draft')));
  assert(!result.prompts.some((prompt) => prompt.title.includes('Disallowed')));
  assert(!result.prompts.some((prompt) => prompt.title.includes('Noindex')));
  assert.equal(result.stats.totalPrompts, 2);
  assert.equal(result.stats.categoryCount, 2);
  assert.equal(result.stats.testedToolCount, 1);
  assert.deepEqual(result.categories, [
    { slug: 'seo', name: 'SEO', count: 1 },
    { slug: 'writing', name: 'Writing', count: 1 },
  ]);
});

test('public Text query combines search and relationship category filters', async () => {
  const searched = await getPublicTextPromptLibrary({ search: 'SEO', category: 'seo' });
  assert.equal(searched.total, 1);
  assert.equal(searched.prompts[0].title, 'Prompt for SEO planning');
  assert.equal(searched.category, 'seo');

  queries.length = 0;
  const categorized = await getPublicTextPromptLibrary({ category: 'writing' });
  assert.equal(categorized.total, 1);
  assert.equal(categorized.prompts[0].title, 'Prompt for clear writing');
});

test('public Text query sorts, paginates, and preserves full prompt line breaks', async () => {
  const result = await getPublicTextPromptLibrary({ page: 2, pageSize: 1 });
  assert.equal(result.total, 2);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
  assert.equal(result.prompts[0].title, 'Prompt for clear writing');
  assert.equal(result.prompts[0].prompt, 'Write a clear introduction.\nKeep the line break.');

  const sorted = await getPublicTextPromptLibrary({ sort: 'title-asc', pageSize: 2 });
  assert.deepEqual(sorted.prompts.map((prompt) => prompt.title), [
    'Prompt for clear writing',
    'Prompt for SEO planning',
  ]);
});

test('indexability lookup reports no eligible Text prompts', async () => {
  const originalStatuses = promptRows.map((row) => row.status);
  const originalNoindex = promptRows.map((row) => row.shouldNoindex);
  try {
    promptRows.forEach((row) => {
      row.status = 'draft';
    });
    assert.equal(await hasIndexablePublicTextPrompts(), false);
  } finally {
    promptRows.forEach((row, index) => {
      row.status = originalStatuses[index];
      row.shouldNoindex = originalNoindex[index];
    });
  }
});

test('Text public library is disabled without deleting its stored prompt data or admin tools', async () => {
  const [page, card, copy, sitemap] = await Promise.all([
    readFile(new URL('../app/text-prompts/page.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/prompts/TextPromptCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/prompts/TextPromptCopyButton.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/sitemap.js', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /import \{ notFound \} from 'next\/navigation'/);
  assert.match(page, /notFound\(\)/);
  assert.match(card, /<details/);
  assert.match(card, /whitespace-pre-wrap/);
  assert.match(card, /Load into workspace/);
  assert.match(copy, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(copy, /aria-live="polite"/);
  assert.match(copy, /Copy failed/);
  const workspace = await readFile(new URL('../src/components/prompts/TextPromptLibraryExperience.jsx', import.meta.url), 'utf8');
  assert.match(workspace, /navigator\.clipboard\.readText/);
  assert.match(workspace, /Clear/);
  assert.match(workspace, /Copy from workspace/);
  assert.doesNotMatch(card, /getPromptUrl|href=.*prompt/i);
  assert.doesNotMatch(sitemap, /text-prompts|hasIndexablePublicTextPrompts/);
  const adminList = await readFile(new URL('../app/admin/text-prompts/page.jsx', import.meta.url), 'utf8');
  assert.match(adminList, /listTextPromptRows/);
  await assert.rejects(
    readFile(new URL('../app/text-prompts/[promptSlug]/page.jsx', import.meta.url)),
    { code: 'ENOENT' },
  );
});
