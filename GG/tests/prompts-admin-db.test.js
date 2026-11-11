import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  deleteAdminPrompt,
  getAdminPromptById,
  insertAdminPrompt,
  listAdminPromptOptions,
  listAdminPromptRows,
  updateAdminPrompt,
  validateAdminPromptInput,
} from '../src/lib/prompts-admin-db.js';
import {
  clearAdminPromptsCache,
  clearPromptsCache,
  getAllPrompts,
  getAllPromptsForAdmin,
  getPublishedPromptSitemapRows,
  getPublicPromptDirectoryPayload,
  getPromptListingPagePayload,
  clearSlimPromptsCache,
  getPromptBySlug,
} from '../src/lib/prompts-db.js';
import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';

const promptImage = 'https://media.public.blob.vercel-storage.com/prompt.webp';
const category = { id: 1, name: 'Writing' };
const queries = [];
let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;

function photoInput(overrides = {}) {
  return {
    title: 'A useful prompt',
    prompt: 'Write a thoughtful response for this example.',
    slug: 'a-useful-prompt',
    image: promptImage,
    images: [promptImage],
    imageAltTexts: { 0: 'Prompt preview image' },
    primaryCategoryId: 1,
    categoryIds: [1],
    status: 'draft',
    ...overrides,
  };
}

function mockResultFor(sql, values = []) {
  if (/WITH eligible_ids AS/i.test(sql)) {
    assert.equal(values[0], 24);
    return {
      rows: [
        {
          id: 29,
          title: 'Last eligible prompt',
          slug: 'last-eligible-prompt',
          image: promptImage,
          totalCount: 30,
        },
        {
          id: 30,
          title: 'Latest eligible prompt',
          slug: 'latest-eligible-prompt',
          image: promptImage,
          totalCount: 30,
        },
      ],
    };
  }
  if (/SELECT\s+p\.id,\s*p\.title,\s*p\.slug,\s*COALESCE\(NULLIF\(p\.images/i.test(sql)) {
    return {
      rows: [{
        id: 1,
        title: 'A useful prompt',
        slug: 'a-useful-prompt',
        image: promptImage,
      }],
    };
  }
  if (/SELECT MAX\(p\.updated_at\)::text AS "updatedAt"/i.test(sql)) {
    return { rows: [{ updatedAt: '2026-10-20 17:15:44.967863+00' }] };
  }
  if (/p\.updated_at::text AS "updatedAt"/i.test(sql) && /hasAdultContext/i.test(sql)) {
    return {
      rows: [
        {
          slug: 'fresh-editorial-portrait',
          image: promptImage,
          images: [promptImage],
          createdAt: '2026-06-07',
          updatedAt: '2026-10-20 17:15:44.967863+00',
          hasAdultContext: true,
        },
      ],
    };
  }
  if (/SELECT id, name FROM categories/i.test(sql)) {
    return { rows: [category], rowCount: 1 };
  }
  if (/INSERT INTO prompts/i.test(sql)) {
    return {
      rows: [{ id: 10, slug: values[2], status: values[12] }],
      rowCount: 1,
    };
  }
  if (/UPDATE prompts/i.test(sql)) {
    if (values[0] === 99) return { rows: [], rowCount: 0 };
    return {
      rows: [{ id: values[0], slug: values[3], status: values[14] }],
      rowCount: 1,
    };
  }
  if (/SELECT\s+p\.id/i.test(sql) && /FROM prompts p/i.test(sql)) {
    if (values[0] === 99) return { rows: [], rowCount: 0 };
    return {
      rows: [{
        id: values[0] || 11,
        title: 'Existing Photo prompt',
        prompt: 'Write a thoughtful response for this example.',
        slug: 'existing-photo-prompt',
        status: 'published',
        category: 'Writing',
        categories: ['Writing'],
        categoryIds: [1],
        tags: [],
        images: [promptImage],
        image: promptImage,
      }],
      rowCount: 1,
    };
  }
  if (/DELETE FROM prompts/i.test(sql)) return { rows: [], rowCount: 0 };
  if (/SELECT COUNT\(\*\)::int AS total FROM prompts/i.test(sql)) {
    return { rows: [{ total: 1 }], rowCount: 1 };
  }
  if (/SELECT id, title, slug, status/i.test(sql) && /FROM prompts/i.test(sql)) {
    return {
      rows: [{ id: 12, title: 'Photo prompt', slug: 'photo-prompt', status: 'published' }],
      rowCount: 1,
    };
  }
  if (/SELECT id, title, slug, library_type AS "libraryType"/i.test(sql)) {
    return {
      rows: [{
        id: 12,
        title: 'Photo prompt',
        prompt: 'Write a thoughtful response for this example.',
        slug: 'photo-prompt',
        libraryType: 'photo',
        status: 'published',
        image: promptImage,
      }],
      rowCount: 1,
    };
  }
  return { rows: [], rowCount: 0 };
}

before(() => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalPostgresUrl = process.env.POSTGRES_URL;
  originalPrismaUrl = process.env.POSTGRES_PRISMA_URL;
  originalPool = globalThis.__dbPgPool;
  process.env.DATABASE_URL = 'postgres://localhost/unit_test';
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;

  const fakeClient = {
    async query(query, values = []) {
      const sql = typeof query === 'string' ? query : query.text;
      queries.push({ sql, values });
      return mockResultFor(sql, values);
    },
    release() {},
  };
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async connect() {
      return fakeClient;
    },
    async query(query, values = []) {
      const sql = typeof query === 'string' ? query : query.text;
      queries.push({ sql, values });
      return mockResultFor(sql, values);
    },
    async end() {},
  };
});

beforeEach(() => {
  queries.length = 0;
  clearPromptsCache();
  clearAdminPromptsCache();
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

test('Photo drafts may omit an image while publishing still requires one', () => {
  const published = validateAdminPromptInput(photoInput({ status: 'published' }));
  assert.equal(published.valid, true);
  assert.equal(published.data.status, 'published');
  const draft = validateAdminPromptInput(photoInput({
    image: '',
    images: [],
    imageAltTexts: {},
  }));
  assert.equal(draft.valid, true);
  assert.equal(draft.data.status, 'draft');
  assert.equal(draft.data.image, '');
  assert.deepEqual(draft.data.images, []);
  const publishedWithoutImage = validateAdminPromptInput(photoInput({
    status: 'published',
    image: '',
    images: [],
    imageAltTexts: {},
  }));
  assert.equal(publishedWithoutImage.valid, false);
  assert.equal(publishedWithoutImage.errors.image, 'Upload a primary image.');
  assert.equal(validateAdminPromptInput(photoInput({ libraryType: 'text' })).valid, false);
  assert.equal(
    validateAdminPromptInput(photoInput({ libraryType: 'text' })).errors.libraryType,
    'Photo prompts must use the Photo workflow.',
  );
  assert.deepEqual(published.data.categoryIds, [1]);
});

test('Photo detail content validates and maps existing and new metadata fields', () => {
  const intro = Array.from({ length: 160 }, (_, index) => `word${index}`).join(' ');
  const validation = validateAdminPromptInput(photoInput({
    intro,
    customizationTips: ['Choose a clear subject', 'Adjust lighting', 'Keep the background simple'],
    variations: [{ label: 'Studio', text: 'Use a soft studio background.' }],
    recommendedTool: 'ChatGPT',
    toolNote: 'It follows the detailed scene and lighting instructions well.',
    howToUse: ['Upload a reference image', 'Paste the prompt', 'Adjust the ratio'],
    faqs: [{ question: 'Can I customize it?', answer: 'Yes, change the scene and styling.' }],
    tools: ['ChatGPT', 'Gemini', 'Midjourney'],
    relatedPromptIds: [2, 3, 4, 5, 6, 7, 8, 9],
    metaDescription: 'A concise search description for this prompt.',
  }));

  assert.equal(validation.valid, true);
  assert.equal(validation.data.intro, intro);
  assert.deepEqual(validation.data.customizationTips, [
    'Choose a clear subject',
    'Adjust lighting',
    'Keep the background simple',
  ]);
  assert.deepEqual(validation.data.variations, [
    { label: 'Studio', text: 'Use a soft studio background.' },
  ]);
  assert.equal(validation.data.recommendedTool, 'ChatGPT');
  assert.equal(validation.data.toolNote, 'It follows the detailed scene and lighting instructions well.');
  assert.deepEqual(validation.data.howToUse, [
    'Upload a reference image',
    'Paste the prompt',
    'Adjust the ratio',
  ]);
  assert.deepEqual(validation.data.faqs, [
    { question: 'Can I customize it?', answer: 'Yes, change the scene and styling.' },
  ]);
  assert.deepEqual(validation.data.tools, ['ChatGPT', 'Gemini', 'Midjourney']);
  assert.deepEqual(validation.data.relatedPromptIds, [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(validation.data.metaDescription, 'A concise search description for this prompt.');

  const formattedIntro = validateAdminPromptInput(photoInput({
    intro: `<p>${Array.from({ length: 300 }, (_, index) => `word${index}`).join(' ')}</p>`,
  }));
  assert.equal(formattedIntro.valid, true);

  const overlongIntro = validateAdminPromptInput(photoInput({
    intro: Array.from({ length: 301 }, (_, index) => `word${index}`).join(' '),
  }));
  assert.equal(overlongIntro.valid, false);
  assert.match(overlongIntro.errors.intro, /300 words or fewer/);
});

test('Photo draft creation persists an empty primary image', async () => {
  const validation = validateAdminPromptInput(photoInput({
    image: '',
    images: [],
    imageAltTexts: {},
  }));
  assert.equal(validation.valid, true);
  const created = await insertAdminPrompt(validation.data);
  const insert = queries.find(({ sql }) => /INSERT INTO prompts/i.test(sql));

  assert.equal(created.status, 'draft');
  assert.equal(insert.values[3], '');
  assert.deepEqual(JSON.parse(insert.values[4]), []);
});

test('Photo creation persists Photo type and preserves media and categories', async () => {
  const validation = validateAdminPromptInput(photoInput({
    status: 'published',
    variations: [{ label: 'Studio', text: 'Use a soft studio background.' }],
    recommendedTool: 'ChatGPT',
    toolNote: 'It follows detailed instructions.',
    howToUse: ['Paste the prompt', 'Set a ratio'],
    tools: ['ChatGPT', 'Gemini'],
    metaDescription: 'A search result description.',
  }));
  const saved = await insertAdminPrompt(validation.data);
  const insert = queries.find(({ sql }) => /INSERT INTO prompts/i.test(sql));

  assert.equal(saved.status, 'published');
  assert.match(insert.sql, /library_type/i);
  assert.match(insert.sql, /'photo',\s*\$30\s*\)\s*RETURNING/i);
  assert.equal(insert.values[3], promptImage);
  assert.deepEqual(JSON.parse(insert.values[4]), [promptImage]);
  assert.match(insert.sql, /variations[\s\S]*recommended_tool[\s\S]*tool_note[\s\S]*how_to_use[\s\S]*tools[\s\S]*meta_description/i);
  assert.deepEqual(JSON.parse(insert.values[23]), validation.data.variations);
  assert.equal(insert.values[24], 'ChatGPT');
  assert.equal(insert.values[25], 'It follows detailed instructions.');
  assert.deepEqual(JSON.parse(insert.values[26]), ['Paste the prompt', 'Set a ratio']);
  assert.deepEqual(JSON.parse(insert.values[27]), ['ChatGPT', 'Gemini']);
  assert.equal(insert.values[28], 'A search result description.');
  assert(queries.some(({ sql }) => /DELETE FROM prompt_categories/i.test(sql)));
  assert(queries.some(({ sql }) => /INSERT INTO prompt_categories/i.test(sql)));
});

test('Photo edit is type-scoped and does not modify the library type', async () => {
  const validation = validateAdminPromptInput(photoInput({ status: 'published' }));
  const saved = await updateAdminPrompt(15, validation.data, {
    existing: { id: 15, ...validation.data },
  });
  const update = queries.find(({ sql }) => /UPDATE prompts/i.test(sql));

  assert.equal(saved.status, 'published');
  assert.match(update.sql, /WHERE id = \$1\s+AND library_type = 'photo'/i);
  assert.match(update.sql, /updated_at = NOW\(\)/i);
  assert.match(update.sql, /RETURNING[^;]*updated_at::text AS "updatedAt"/i);
  assert.doesNotMatch(update.sql.split('WHERE')[0], /library_type\s*=/i);
  assert.equal(update.values[4], promptImage);
  assert.deepEqual(JSON.parse(update.values[5]), [promptImage]);
  assert(queries.some(({ sql }) => /INSERT INTO prompt_categories/i.test(sql)));
});

test('Photo admin API data functions cannot read, update, or delete Text records', async () => {
  assert.equal(await getAdminPromptById(99), null);
  const getQuery = queries.find(({ sql }) => /FROM prompts p/i.test(sql));
  assert.match(getQuery.sql, /p\.library_type = 'photo'/i);

  const validation = validateAdminPromptInput(photoInput());
  const result = await updateAdminPrompt(99, validation.data);
  assert.equal(result, null);
  const update = queries.find(({ sql }) => /UPDATE prompts/i.test(sql));
  assert.match(update.sql, /library_type = 'photo'/i);

  assert.equal(await deleteAdminPrompt(99), null);
  const deletion = queries.find(({ sql }) => /DELETE FROM prompts/i.test(sql));
  assert.match(deletion.sql, /library_type = 'photo'/i);
});

test('Photo admin API routes use the Photo-only validator and type-scoped data functions', async () => {
  const [createRoute, itemRoute] = await Promise.all([
    readFile(new URL('../app/admin/api/prompts/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/api/prompts/[id]/route.js', import.meta.url), 'utf8'),
  ]);
  assert.match(createRoute, /validateAdminPromptInput\(input\)/);
  assert.match(createRoute, /insertAdminPrompt\(validation\.data\)/);
  assert.match(itemRoute, /getAdminPromptById\(id\)/);
  assert.match(itemRoute, /updateAdminPrompt\(id, validation\.data/);
  assert.match(itemRoute, /deleteAdminPrompt\(id\)/);
});

test('Photo admin and public listings constrain reads to Photo prompts', async () => {
  await listAdminPromptRows();
  assert.match(queries[0].sql, /p\.library_type = 'photo'/i);
  assert.match(queries[1].sql, /p\.library_type = 'photo'/i);

  await listAdminPromptOptions();
  assert.match(queries[2].sql, /library_type = 'photo'/i);

  await getAllPromptsForAdmin();
  assert.match(queries[3].sql, /library_type = 'photo'/i);

  await getAllPrompts();
  const publicListing = queries.find(({ sql }) => /ORDER BY p\.id\s*$/i.test(sql));
  assert.match(publicListing.sql, /p\.library_type = 'photo'/i);

  await getPromptBySlug('text-prompt');
  assert(queries.some(({ sql }) => /library_type = 'photo'/i.test(sql)));
});

test('Photo admin listing applies category filters and a validated sort order', async () => {
  const result = await listAdminPromptRows({
    search: 'portrait',
    status: 'draft',
    category: 'Writing',
    sort: 'title_asc',
  });
  const countQuery = queries.find(({ sql }) => /COUNT\(\*\)::int AS total[\s\S]*FROM prompts p/i.test(sql));
  const rowsQuery = queries.find(({ sql }) => /ORDER BY p\.title ASC/i.test(sql));

  assert.deepEqual(countQuery.values, ['%portrait%', 'draft', 'Writing']);
  assert.match(countQuery.sql, /COALESCE\(primary_category\.name, p\.category, p\.use_case\) = \$3/);
  assert.match(rowsQuery.sql, /ORDER BY p\.title ASC, p\.id ASC/);
  assert.equal(result.sort, 'title_asc');
  assert.ok(Array.isArray(result.categories));
});

test('Sitemap prompt rows include complete published prompts while retaining safety filtering', async () => {
  clearPromptsCache();
  const rows = await getPublishedPromptSitemapRows();
  const query = queries.find(({ sql }) => /p\.updated_at::text AS "updatedAt"/i.test(sql) && /hasAdultContext/i.test(sql));

  assert.match(query.sql, /p\.status = 'published'/);
  assert.match(query.sql, /p\.library_type = 'photo'/);
  assert.doesNotMatch(query.sql, /is_sitemap_eligible/);
  assert.match(query.sql, /p\.created_at::text AS "createdAt"/);
  assert.match(query.sql, /NULLIF\(BTRIM\(p\.title\), ''\) IS NOT NULL/);
  assert.match(query.sql, /NULLIF\(BTRIM\(p\.prompt\), ''\) IS NOT NULL/);
  // Slim SELECT: only the columns the sitemap routes render, no full prompt text.
  assert.match(query.sql, /SELECT\s+p\.slug,\s*p\.image,\s*p\.images,\s*p\.created_at::text AS "createdAt",\s*p\.updated_at::text AS "updatedAt",/i);
  assert.doesNotMatch(query.sql, /p\.title AS |p\.prompt AS |p\.tags AS |p\.intro AS |p\.use_case AS |p\.og_image AS /i);
  assert.doesNotMatch(query.sql, /LEFT JOIN LATERAL/);
  // Eligibility is enforced in SQL via the maintained should_noindex column.
  assert.match(query.sql, /COALESCE\(p\.should_noindex, false\) = false/);
  assert.deepEqual(rows, [{
    slug: 'fresh-editorial-portrait',
    createdAt: '2026-06-07',
    updatedAt: '2026-10-20 17:15:44.967863+00',
    images: [promptImage],
  }]);

  // Second call is served from the shared sitemap cache: no second query.
  const cachedRows = await getPublishedPromptSitemapRows();
  assert.deepEqual(cachedRows, rows);
  assert.equal(
    queries.filter(({ sql }) => /p\.updated_at::text AS "updatedAt"/i.test(sql) && /hasAdultContext/i.test(sql)).length,
    1,
  );
});

test('public prompt directory selects and returns only its serialized fields', async () => {
  clearPromptsCache();
  const payload = await getPublicPromptDirectoryPayload();
  const query = queries.find(({ sql }) => /SELECT\s+p\.id,\s*p\.title,\s*p\.slug,\s*COALESCE\(NULLIF\(p\.images/i.test(sql));

  assert.match(query.sql, /SELECT\s+p\.id,\s*p\.title,\s*p\.slug,\s*COALESCE/i);
  assert.doesNotMatch(query.sql, /SELECT\s+p\.prompt|,\s*p\.(?:prompt|tags|intro)\s*(?:,|FROM)/i);
  assert.doesNotMatch(query.sql, /is_public_eligible/);
  assert.deepEqual(payload, {
    success: true,
    updatedAt: '2026-10-20 17:15:44.967863+00',
    prompts: [{
      id: 1,
      title: 'A useful prompt',
      slug: 'a-useful-prompt',
      image: promptImage,
    }],
  });

  test('main Photo listing reads only the 24 displayed/schema rows and counts separately in SQL', async () => {
    clearSlimPromptsCache();
    const payload = await getPromptListingPagePayload();
    const query = queries.find(({ sql }) => /WITH eligible_ids AS/i.test(sql));

    assert.match(query.sql, /NULLIF\(BTRIM\(p\.title\), ''\) IS NOT NULL/i);
    assert.match(query.sql, /NULLIF\(BTRIM\(p\.prompt\), ''\) IS NOT NULL/i);
    assert.match(query.sql, /ORDER BY p\.id DESC\s+LIMIT \$1/i);
    assert.match(query.sql, /COUNT\(\*\)::int AS total_count/i);
    // The payload returns prompt text (the Copy button needs it), so
    // p.prompt IS selected; the heavy unneeded columns are not.
    assert.match(query.sql, /SELECT[\s\S]*p\.prompt,/i);
    assert.doesNotMatch(query.sql, /p\.tags|p\.images\s*,|p\.intro/i);
    assert.equal(payload.totalCount, 30);
    assert.deepEqual(payload.prompts.map(({ id }) => id), [29, 30]);
    clearSlimPromptsCache();
  });
  clearPromptsCache();
});
