import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import {
  deleteTextPrompt,
  getTextPromptById,
  insertTextPrompt,
  listTextPromptRows,
  updateTextPrompt,
  validateTextPromptInput,
} from '../src/lib/text-prompts-admin-db.js';

const queries = [];
const categories = [
  { id: 1, name: 'Writing' },
  { id: 2, name: 'SEO' },
];
let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;
let duplicateSlug = false;

function input(overrides = {}) {
  return {
    title: 'Useful writing prompt',
    prompt: 'Write a clear and useful response for the requested audience.',
    slug: 'useful-writing-prompt',
    primaryCategoryId: 1,
    categoryIds: [1, 2],
    tags: ['writing', 'planning'],
    intro: 'A concise description.',
    useCase: 'Drafting',
    status: 'draft',
    ...overrides,
  };
}

function resultFor(sql, values = []) {
  if (/SELECT id, name FROM categories/i.test(sql)) {
    const ids = values[0] || [];
    return { rows: categories.filter((category) => ids.map(Number).includes(category.id)) };
  }
  if (/INSERT INTO prompts/i.test(sql)) {
    if (duplicateSlug) {
      const error = new Error('duplicate key');
      error.code = '23505';
      throw error;
    }
    return { rows: [{ id: 41, slug: values[2], status: values[8] }] };
  }
  if (/UPDATE prompts/i.test(sql)) {
    return { rows: [{ id: values[0], slug: values[3], status: values[9] }] };
  }
  if (/SELECT image, images, og_image AS "ogImage"/i.test(sql)) {
    return { rows: [{ image: null, images: [], ogImage: null }] };
  }
  if (/DELETE FROM prompts/i.test(sql)) {
    if (values[0] === 99) return { rows: [] };
    return { rows: [{ id: values[0], title: 'Deleted Text prompt', slug: 'deleted-text-prompt', status: 'draft' }] };
  }
  if (/SELECT\s+p\.id/i.test(sql) && /library_type = 'text'/i.test(sql)) {
    if (values[0] === 99) return { rows: [] };
    return {
      rows: [{
        id: values[0],
        title: 'Useful writing prompt',
        prompt: 'Write a clear and useful response for the requested audience.',
        slug: 'useful-writing-prompt',
        status: 'draft',
        category: 'Writing',
        categories: ['Writing', 'SEO'],
        primaryCategoryId: 1,
        categoryIds: [1, 2],
        tags: ['writing'],
        intro: 'A concise description.',
        useCase: 'Drafting',
      }],
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

  const client = {
    async query(query, values = []) {
      const sql = typeof query === 'string' ? query : query.text;
      queries.push({ sql, values });
      return resultFor(sql, values);
    },
    release() {},
  };
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async connect() {
      return client;
    },
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
  duplicateSlug = false;
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

test('Text validation permits image-free prompts and enforces a primary category', () => {
  const validation = validateTextPromptInput(input({ image: '', images: [] }));
  assert.equal(validation.valid, true);
  assert.equal('image' in validation.data, false);
  assert.deepEqual(validation.data.categoryIds, [1, 2]);
  assert.equal(validateTextPromptInput(input({ primaryCategoryId: null })).valid, false);
});

test('Text creation writes a Text record and category assignments without images', async () => {
  const validation = validateTextPromptInput(input());
  const created = await insertTextPrompt(validation.data);
  const insert = queries.find(({ sql }) => /INSERT INTO prompts/i.test(sql));

  assert.deepEqual(created, { id: 41, slug: 'useful-writing-prompt', status: 'draft' });
  assert.match(insert.sql, /library_type,[\s\S]*VALUES[\s\S]*'text',\s*\$11/i);
  assert.match(insert.sql, /image,\s*images/);
  assert.equal(insert.values.length, 11);
  assert(queries.some(({ sql }) => /DELETE FROM prompt_categories/i.test(sql)));
  const categoryWrites = queries.filter(({ sql }) => /INSERT INTO prompt_categories/i.test(sql));
  assert.deepEqual(categoryWrites.map(({ values }) => values), [[41, 1, 0], [41, 2, 1]]);
});

test('Text edit only updates Text rows and keeps category assignments', async () => {
  const existing = await getTextPromptById(41);
  const validation = validateTextPromptInput(input({
    title: 'Updated writing prompt',
    slug: 'updated-writing-prompt',
    status: 'published',
  }));
  const updated = await updateTextPrompt(existing.id, validation.data);
  const update = queries.find(({ sql }) => /UPDATE prompts/i.test(sql));

  assert.equal(updated.status, 'published');
  assert.match(update.sql, /WHERE id = \$1 AND library_type = 'text'/i);
  assert.match(update.sql, /updated_at = NOW\(\)/i);
  assert.match(update.sql, /RETURNING[^;]*updated_at::text AS "updatedAt"/i);
  assert.doesNotMatch(update.sql, /image\s*=/i);
  assert(queries.some(({ sql }) => /DELETE FROM prompt_categories/i.test(sql)));
});

test('Text edit lookup cannot return Photo rows', async () => {
  assert.equal(await getTextPromptById(99), null);
  assert.match(queries[0].sql, /library_type = 'text'/i);
});

test('Text deletion is restricted to Text prompts', async () => {
  assert.deepEqual(await deleteTextPrompt(41), {
    id: 41,
    title: 'Deleted Text prompt',
    slug: 'deleted-text-prompt',
    status: 'draft',
  });
  const deletion = queries.find(({ sql }) => /DELETE FROM prompts/i.test(sql));
  assert.match(deletion.sql, /WHERE id = \$1 AND library_type = 'text'/i);
  assert.deepEqual(deletion.values, [41]);
  assert.equal(await deleteTextPrompt(99), null);
});

test('Text admin list includes only Text records', async () => {
  await listTextPromptRows();
  assert.match(queries[0].sql, /p\.library_type = 'text'/i);
  assert.match(queries[1].sql, /p\.library_type = 'text'/i);
});

test('Text admin listing applies category filters and a validated sort order', async () => {
  await listTextPromptRows({
    search: 'writing',
    status: 'published',
    category: 'SEO',
    sort: 'title_desc',
  });
  const countQuery = queries.find(({ sql }) => /COUNT\(\*\)::int AS total[\s\S]*FROM prompts p/i.test(sql));
  const rowsQuery = queries.find(({ sql }) => /ORDER BY p\.title DESC/i.test(sql));

  assert.deepEqual(countQuery.values, ['%writing%', 'published', 'SEO']);
  assert.match(countQuery.sql, /COALESCE\(primary_category\.name, p\.category, p\.use_case\) = \$3/);
  assert.match(rowsQuery.sql, /ORDER BY p\.title DESC, p\.id DESC/);
});

test('Text slug conflicts use the shared database unique constraint', async () => {
  duplicateSlug = true;
  const validation = validateTextPromptInput(input());
  await assert.rejects(insertTextPrompt(validation.data), (error) => error.code === '23505');
  assert.match(queries.find(({ sql }) => /INSERT INTO prompts/i.test(sql)).sql, /slug/);
});

test('Text publishing invalidates only the Text library and has no individual-indexing API', async () => {
  const [createRoute, editRoute, revalidation] = await Promise.all([
    readFile(new URL('../app/admin/api/text-prompts/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/api/text-prompts/[id]/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/text-prompt-revalidation.js', import.meta.url), 'utf8'),
  ]);
  assert.match(revalidation, /TEXT_PROMPT_LIBRARY_PATH = '\/text-prompts'/);
  assert.match(revalidation, /revalidatePath\(TEXT_PROMPT_LIBRARY_PATH\)/);
  for (const source of [createRoute, editRoute]) {
    assert.match(source, /revalidateTextPromptLibrary/);
    assert.doesNotMatch(source, /submitToIndexNow|revalidatePromptContent/);
  }
});

test('Text prompt deletion is Super Admin-only and revalidates the Text library', async () => {
  const [route, page, button] = await Promise.all([
    readFile(new URL('../app/admin/api/text-prompts/[id]/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/text-prompts/page.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/DeleteTextPromptButton.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /isSuperAdmin\(adminUser\)/);
  assert.match(route, /Only a Super Admin can delete Text prompts/);
  assert.match(route, /revalidateTextPromptLibrary\(\)/);
  assert.match(page, /isSuperAdmin\(adminUser\)/);
  assert.match(page, /<DeleteTextPromptButton/);
  assert.match(button, /method: 'DELETE'/);
  assert.match(button, /window\.confirm/);
});

test('Photo scheduled publisher scopes both selection and update to Photo rows', async () => {
  const source = await readFile(
    new URL('../app/admin/api/prompts/scheduled/route.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /p\.status = 'draft'[\s\S]*p\.library_type = 'photo'/);
  assert.match(source, /p\.scheduled_at <= NOW\(\)[\s\S]*p\.library_type = 'photo'/);
});