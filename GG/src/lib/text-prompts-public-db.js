import { getPgPool } from './db.js';

const DEFAULT_PAGE_SIZE = 12;
const MAX_SEARCH_LENGTH = 120;

function cleanSearch(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_SEARCH_LENGTH);
}

function cleanCategory(value) {
  const slug = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : '';
}

function cleanPage(value) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1_000_000) : 1;
}

function cleanPageSize(value) {
  const pageSize = Number(value);
  return Number.isSafeInteger(pageSize) && pageSize > 0
    ? Math.min(pageSize, 30)
    : DEFAULT_PAGE_SIZE;
}

function categoryFields(row) {
  const names = Array.isArray(row.categories) ? row.categories : [];
  const slugs = Array.isArray(row.categorySlugs) ? row.categorySlugs : [];
  return names.map((name, index) => ({
    name: String(name || ''),
    slug: String(slugs[index] || ''),
  })).filter((category) => category.name && category.slug);
}

function buildPromptCtes() {
  return `
    WITH eligible_prompts AS (
      SELECT
        p.id,
        p.title,
        p.prompt,
        p.slug,
        p.intro,
        p.use_case AS "useCase",
        p.tags,
        p.generation_tested_tool AS "generationTestedTool",
        p.created_at::text AS "createdAt",
        p.created_at AS "createdAtSort",
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
        AND COALESCE(p.should_noindex, false) = false
        AND p.is_public_eligible = true
    ),
    categorized_prompts AS (
      SELECT
        eligible_prompts.*,
        ARRAY(
          SELECT jsonb_array_elements_text(eligible_prompts.categories)
        ) AS category_names,
        ARRAY(
          SELECT jsonb_array_elements_text(eligible_prompts."categorySlugs")
        ) AS category_slugs,
        ARRAY(
          SELECT jsonb_array_elements_text(COALESCE(eligible_prompts.tags, '[]'::jsonb))
        ) AS tag_values
      FROM eligible_prompts
    )
  `;
}

function buildMatchingConditions(search, category) {
  const conditions = [];
  const values = [];

  if (category) {
    values.push(category);
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM UNNEST(category_names, category_slugs) AS category(name, slug)
        WHERE category.slug = $${values.length}
          AND category.name <> ''
      )
    `);
  }
  if (search) {
    values.push(search);
    conditions.push(`
      POSITION(
        LOWER($${values.length})
        IN LOWER(CONCAT_WS(
          ' ',
          NULLIF(title, ''),
          NULLIF(prompt, ''),
          NULLIF(intro, ''),
          NULLIF("useCase", ''),
          NULLIF("generationTestedTool", ''),
          NULLIF(ARRAY_TO_STRING(tag_values, ' '), ''),
          NULLIF(ARRAY_TO_STRING(category_names, ' '), '')
        ))
      ) > 0
    `);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

async function queryPublicTextLibrary({
  search = '',
  category = '',
  sort = 'recent',
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}) {
  const pool = getPgPool();
  const filters = buildMatchingConditions(search, category);
  const matchingWhere = filters.where;
  const [summaryResult, categoriesResult, totalResult] = await Promise.all([
    pool.query(`
      ${buildPromptCtes()}
      SELECT COUNT(*)::int AS "eligibleTotal",
             COALESCE(ARRAY_AGG(DISTINCT BTRIM("generationTestedTool"))
               FILTER (WHERE NULLIF(BTRIM("generationTestedTool"), '') IS NOT NULL), ARRAY[]::text[])
               AS "testedTools"
      FROM categorized_prompts
    `),
    pool.query(`
      ${buildPromptCtes()}
      SELECT category.slug, category.name, COUNT(DISTINCT prompt.id)::int AS count
      FROM categorized_prompts prompt
      CROSS JOIN LATERAL UNNEST(prompt.category_names, prompt.category_slugs)
        AS category(name, slug)
      WHERE category.name <> '' AND category.slug <> ''
      GROUP BY category.slug, category.name
    `),
    pool.query(`
      ${buildPromptCtes()}
      SELECT COUNT(*)::int AS total
      FROM categorized_prompts
      ${matchingWhere}
    `, filters.values),
  ]);
  const total = Number(totalResult.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageValues = [...filters.values, pageSize, (currentPage - 1) * pageSize];
  const limitParam = filters.values.length + 1;
  const offsetParam = filters.values.length + 2;
  const pageWhere = matchingWhere;
  const pageQuery = `
    ${buildPromptCtes()}
    SELECT id, title, prompt, slug, intro, "useCase", tags,
           "generationTestedTool", "createdAt", categories, "categorySlugs"
    FROM categorized_prompts
    ${pageWhere}
    ORDER BY ${sort === 'title-asc' ? 'LOWER(title), id' : '"createdAtSort" DESC NULLS LAST, id DESC'}
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;
  const pageResult = await pool.query(pageQuery, pageValues);
  const categories = categoriesResult.rows.map((item) => ({
    slug: String(item.slug || ''),
    name: String(item.name || ''),
    count: Number(item.count || 0),
  })).sort((left, right) => left.name.localeCompare(right.name));
  const summary = summaryResult.rows[0] || {};

  return {
    total,
    totalPages,
    prompts: pageResult.rows.map((row) => ({
      id: String(row.id),
      title: row.title,
      prompt: row.prompt,
      slug: row.slug,
      intro: row.intro || '',
      useCase: row.useCase || '',
      tags: Array.isArray(row.tags) ? row.tags : [],
      categories: categoryFields(row),
      generationTestedTool: String(row.generationTestedTool || '').trim(),
      createdAt: row.createdAt || '',
    })),
    categories,
    stats: {
      totalPrompts: Number(summary.eligibleTotal || 0),
      categoryCount: categories.length,
      testedToolCount: Array.isArray(summary.testedTools) ? summary.testedTools.length : 0,
    },
  };
}

export async function getPublicTextPromptLibrary({
  search = '',
  category = '',
  sort = 'recent',
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  const normalizedSearch = cleanSearch(search);
  const normalizedCategory = cleanCategory(category);
  const normalizedSort = sort === 'title-asc' ? 'title-asc' : 'recent';
  const requestedPage = cleanPage(page);
  const normalizedPageSize = cleanPageSize(pageSize);
  const result = await queryPublicTextLibrary({
    search: normalizedSearch,
    category: normalizedCategory,
    sort: normalizedSort,
    page: requestedPage,
    pageSize: normalizedPageSize,
  });
  const categoryIsAvailable = result.categories.some((item) => item.slug === normalizedCategory);

  return {
    prompts: result.prompts,
    categories: result.categories,
    stats: result.stats,
    total: result.total,
    page: Math.min(requestedPage, result.totalPages),
    pageSize: normalizedPageSize,
    totalPages: result.totalPages,
    search: normalizedSearch,
    category: categoryIsAvailable ? normalizedCategory : '',
    sort: normalizedSort,
  };
}

export async function hasIndexablePublicTextPrompts() {
  const result = await getPgPool().query(`
    SELECT EXISTS (
      SELECT 1
      FROM prompts
      WHERE library_type = 'text'
        AND status = 'published'
        AND COALESCE(should_noindex, false) = false
        AND is_public_eligible = true
    ) AS eligible
  `);
  return result.rows[0]?.eligible === true;
}
