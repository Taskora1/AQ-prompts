import assert from 'node:assert/strict';

import { loadExplicitMigrationEnvironment } from './lib/database-migration-safety.mjs';
import { getPgPool } from '../src/lib/db.js';
import { isIndexablePrompt } from '../src/lib/prompt-constants.js';
import {
  containsMinorSubjectReference,
  getPublishedPromptSitemapRows,
  getPublicPromptDirectoryPayload,
  normalizePrompt,
  normalizePromptSlim,
} from '../src/lib/prompts-db.js';
import { getPublicTextPromptLibrary } from '../src/lib/text-prompts-public-db.js';
import {
  isPreviewEnvironment,
  PREVIEW_SYNTHETIC_PROMPT,
} from '../src/lib/preview-prompt-fixture.js';

let pool;

function option(name) {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || '';
}

function categoryFields(row) {
  const names = Array.isArray(row.categories) ? row.categories : [];
  const slugs = Array.isArray(row.categorySlugs) ? row.categorySlugs : [];
  return names.map((name, index) => ({
    name: String(name || ''),
    slug: String(slugs[index] || ''),
  })).filter((category) => category.name && category.slug);
}

function legacySitemapEligiblePrompt(row) {
  const prompt = normalizePrompt(row, {
    suppressUnverifiedMedia: false,
    resolveLegacyMedia: true,
  });
  return prompt.slug
    && prompt.title
    && prompt.prompt
    && !containsMinorSubjectReference(prompt)
    ? prompt
    : null;
}

async function legacySitemapRows() {
  const result = await pool.query(`
    SELECT
      p.title, p.prompt, p.slug, p.image, p.images, p.tags,
      p.og_image AS "ogImage", p.intro, p.use_case AS "useCase",
      COALESCE(assigned_categories.names, p.categories, '[]'::jsonb) AS categories,
      p.created_at::text AS "createdAt",
      p.updated_at::text AS "updatedAt"
    FROM prompts p
    LEFT JOIN LATERAL (
      SELECT JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names
      FROM prompt_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.prompt_id = p.id
    ) assigned_categories ON true
    WHERE p.status = 'published'
      AND p.library_type = 'photo'
      AND NULLIF(BTRIM(p.title), '') IS NOT NULL
      AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
    ORDER BY p.id
  `);
  return result.rows
    .map(legacySitemapEligiblePrompt)
    .filter(Boolean)
    .map((row) => ({
      slug: row.slug,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      images: normalizePrompt(row, {
        suppressUnverifiedMedia: true,
        resolveLegacyMedia: true,
      }).images,
    }));
}

async function legacyDirectoryPayload() {
  const result = await pool.query(`
    SELECT
      p.id, p.title, p.prompt, p.slug, p.image, p.images,
      COALESCE(primary_category.name, p.category) AS category,
      COALESCE(assigned_categories.names, p.categories, '[]'::jsonb) AS categories,
      p.use_case AS "useCase", p.tags, p.status,
      p.primary_category_id AS "primaryCategoryId",
      primary_category.slug AS "primaryCategorySlug",
      COALESCE(assigned_categories.ids, '[]'::jsonb) AS "categoryIds",
      COALESCE(assigned_categories.slugs, '[]'::jsonb) AS "categorySlugs",
      p.created_at::text AS "createdAt", p.intro,
      p.updated_at::text AS "updatedAt"
    FROM prompts p
    LEFT JOIN categories primary_category ON primary_category.id = p.primary_category_id
    LEFT JOIN LATERAL (
      SELECT
        JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names,
        JSONB_AGG(c.id ORDER BY pc.position, c.id) AS ids,
        JSONB_AGG(c.slug ORDER BY pc.position, c.id) AS slugs
      FROM prompt_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.prompt_id = p.id
    ) assigned_categories ON true
    WHERE p.status = 'published'
      AND p.library_type = 'photo'
    ORDER BY p.id
  `);
  let sourcePrompts = result.rows
    .map((row) => normalizePromptSlim(row, {
      suppressUnverifiedMedia: false,
      resolveLegacyMedia: true,
    }))
    .filter((prompt) => prompt.title && prompt.prompt);
  if (sourcePrompts.length === 0 && isPreviewEnvironment()) {
    sourcePrompts = [normalizePromptSlim(PREVIEW_SYNTHETIC_PROMPT, {
      resolveLegacyMedia: true,
    })];
  }
  const updatedAt = sourcePrompts.reduce((latest, prompt) => {
    if (!prompt.updatedAt) return latest;
    return !latest || Date.parse(prompt.updatedAt) > Date.parse(latest)
      ? prompt.updatedAt
      : latest;
  }, '');
  return {
    success: true,
    updatedAt,
    prompts: sourcePrompts.map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      slug: prompt.slug,
      image: prompt.image,
    })),
  };
}

async function legacyTextRows(sort) {
  const orderBy = sort === 'title-asc'
    ? 'LOWER(p.title), p.id'
    : 'p.created_at DESC NULLS LAST, p.id DESC';
  const result = await pool.query(`
    SELECT
      p.id, p.title, p.prompt, p.slug, p.intro,
      p.use_case AS "useCase", p.tags, p.image, p.images,
      p.og_image AS "ogImage", p.status,
      p.should_noindex AS "shouldNoindex",
      p.generation_tested_tool AS "generationTestedTool",
      p.created_at::text AS "createdAt",
      COALESCE(assigned.names, '[]'::jsonb) AS categories,
      COALESCE(assigned.slugs, '[]'::jsonb) AS "categorySlugs"
    FROM prompts p
    LEFT JOIN LATERAL (
      SELECT
        JSONB_AGG(category.name ORDER BY category.position, category.name) AS names,
        JSONB_AGG(category.slug ORDER BY category.position, category.name) AS slugs
      FROM (
        SELECT c.name, c.slug, 0 AS position
        FROM categories c
        WHERE c.id = p.primary_category_id
        UNION
        SELECT c.name, c.slug, pc.position + 1 AS position
        FROM prompt_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.prompt_id = p.id
          AND pc.category_id <> p.primary_category_id
      ) category
    ) assigned ON true
    WHERE p.library_type = 'text'
      AND p.status = 'published'
    ORDER BY ${orderBy}
  `);
  return result.rows.filter((row) => row.status === 'published'
    && !row.shouldNoindex
    && isIndexablePrompt({
      slug: row.slug,
      title: row.title,
      prompt: row.prompt,
      intro: row.intro,
      tags: row.tags,
      useCase: row.useCase,
      image: row.image,
      images: row.images,
      ogImage: row.ogImage,
    })).map((row) => ({ ...row, categories: categoryFields(row) }));
}

function legacyTextMatches(row, search, category) {
  if (category && !row.categories.some((item) => item.slug === category)) return false;
  if (!search) return true;
  const searchable = [
    row.title,
    row.prompt,
    row.intro,
    row.useCase,
    row.generationTestedTool,
    ...(Array.isArray(row.tags) ? row.tags : []),
    ...row.categories.map((item) => item.name),
  ].filter(Boolean).join(' ').toLocaleLowerCase();
  return searchable.includes(search.toLocaleLowerCase());
}

async function legacyTextLibrary({
  search = '',
  category = '',
  sort = 'recent',
  page = 1,
  pageSize = 12,
} = {}) {
  const allRows = await legacyTextRows(sort);
  const categories = new Map();
  const testedTools = new Set();
  for (const row of allRows) {
    for (const item of row.categories) {
      const previous = categories.get(item.slug);
      categories.set(item.slug, {
        slug: item.slug,
        name: item.name,
        count: (previous?.count || 0) + 1,
      });
    }
    const testedTool = String(row.generationTestedTool || '').trim();
    if (testedTool) testedTools.add(testedTool);
  }
  const sortedCategories = [...categories.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  const matching = allRows.filter((row) => legacyTextMatches(row, search, category));
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;
  const prompts = matching.slice(offset, offset + pageSize).map((row) => ({
    id: String(row.id),
    title: row.title,
    prompt: row.prompt,
    slug: row.slug,
    intro: row.intro || '',
    useCase: row.useCase || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    categories: row.categories,
    generationTestedTool: String(row.generationTestedTool || '').trim(),
    createdAt: row.createdAt || '',
  }));
  return {
    prompts,
    categories: sortedCategories,
    stats: {
      totalPrompts: allRows.length,
      categoryCount: sortedCategories.length,
      testedToolCount: testedTools.size,
    },
    total: matching.length,
    page: currentPage,
    pageSize,
    totalPages,
    search,
    category: sortedCategories.some((item) => item.slug === category) ? category : '',
    sort,
  };
}

function assertEquivalent(name, oldValue, newValue) {
  assert.deepEqual(newValue, oldValue, `${name} output differs from the legacy behavior`);
  console.log(`PASS: ${name}`);
}

async function verify() {
  const target = option('--target').toLowerCase();
  const explicit = await loadExplicitMigrationEnvironment(option('--env-file'), target);
  const databaseUrl = explicit.values.DATABASE_URL
    || explicit.values.POSTGRES_URL
    || explicit.values.POSTGRES_PRISMA_URL;
  if (!databaseUrl) throw new Error('The explicit environment file has no database URL.');
  process.env.DATABASE_URL = databaseUrl;
  if (explicit.values.PGSSLMODE) process.env.PGSSLMODE = explicit.values.PGSSLMODE;
  pool = getPgPool();

  try {
  const [oldSitemap, newSitemap] = await Promise.all([
    legacySitemapRows(),
    getPublishedPromptSitemapRows(),
  ]);
  assertEquivalent('sitemap URL rows', oldSitemap, newSitemap);

  const [oldDirectory, newDirectory] = await Promise.all([
    legacyDirectoryPayload(),
    getPublicPromptDirectoryPayload(),
  ]);
  assertEquivalent('public prompts API JSON response', oldDirectory, {
    success: true,
    updatedAt: newDirectory.updatedAt,
    prompts: newDirectory.prompts.map(({ id, title, slug, image }) => ({
      id,
      title,
      slug,
      image,
    })),
  });

  const baseline = await legacyTextLibrary();
  const newBaseline = await getPublicTextPromptLibrary();
  assertEquivalent('text library no filter', baseline, newBaseline);
  const firstCategory = baseline.categories[0]?.slug || '';
  assertEquivalent(
    'text library category filter',
    await legacyTextLibrary({ category: firstCategory }),
    await getPublicTextPromptLibrary({ category: firstCategory }),
  );
  for (const search of ['AI', 'portrait', 'prompt']) {
    assertEquivalent(
      `text library search ${JSON.stringify(search)}`,
      await legacyTextLibrary({ search }),
      await getPublicTextPromptLibrary({ search }),
    );
  }
  for (const page of [1, 2]) {
    assertEquivalent(
      `text library page ${page}`,
      await legacyTextLibrary({ page }),
      await getPublicTextPromptLibrary({ page }),
    );
  }
  console.log('Eligibility equivalence verification complete: all comparisons matched.');
  } finally {
    await pool.end();
  }
}

verify().catch((error) => {
  console.error(`Eligibility equivalence verification failed: ${error.message}`);
  process.exitCode = 1;
});
