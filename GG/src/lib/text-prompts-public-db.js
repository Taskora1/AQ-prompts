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

// The text library, computed in JS.
//
// The original form built the eligible set as a CTE with a LATERAL
// aggregate for the categories and a second CTE that expanded the JSON
// arrays with jsonb_array_elements_text / ARRAY(...) / UNNEST /
// ARRAY_TO_STRING / POSITION / CONCAT_WS — none of which has a SQLite
// equivalent. The replacement fetches the eligible prompts once (one
// narrow SELECT) and the junction rows once, then does the category
// aggregation, summary, matching, sorting and paging in JS. The
// semantics are the same as the SQL:
// - eligible: text library, published, not noindexed, public-eligible.
// - categories per prompt: the primary category first (position 0),
//   then the assigned categories (excluding the primary) ordered by
//   (position, name) — the UNION + ORDER BY of the old LATERAL.
// - category filter: the prompt has a (name, slug) pair with that slug
//   and a non-empty name. Search: the lowercased search string is a
//   substring of the lowercased space-joined title / prompt / intro /
//   use case / tested tool / tags / category names (empty parts skipped).
// - summary: eligible total and the distinct non-empty trimmed tested
//   tools. Category counts: distinct prompt ids per (slug, name) pair.
// - sort: recent = created_at DESC NULLS LAST, id DESC; title-asc =
//   LOWER(title), id.
async function queryPublicTextLibrary({
  search = '',
  category = '',
  sort = 'recent',
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}) {
  const pool = getPgPool();
  const [promptsResult, assignedResult] = await Promise.all([
    pool.query(`
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
        p.created_at::text AS "createdAtSort",
        p.primary_category_id AS "primaryCategoryId",
        primary_category.name AS "primaryCategoryName",
        primary_category.slug AS "primaryCategorySlug"
      FROM prompts p
      LEFT JOIN categories primary_category
        ON primary_category.id = p.primary_category_id
      WHERE p.library_type = 'text'
        AND p.status = 'published'
        AND COALESCE(p.should_noindex, false) = false
        AND p.is_public_eligible = true
    `),
    pool.query(`
      SELECT pc.prompt_id AS "promptId", pc.position,
             c.id AS "categoryId", c.name, c.slug
      FROM prompt_categories pc
      JOIN categories c ON c.id = pc.category_id
    `),
  ]);

  const assignedByPrompt = new Map();
  for (const row of assignedResult.rows) {
    const promptId = Number(row.promptId);
    if (!Number.isSafeInteger(promptId)) continue;
    if (!assignedByPrompt.has(promptId)) assignedByPrompt.set(promptId, []);
    assignedByPrompt.get(promptId).push(row);
  }

  const eligible = promptsResult.rows.map((row) => {
    const assigned = (assignedByPrompt.get(Number(row.id)) || [])
      .filter((item) => Number(item.categoryId) !== Number(row.primaryCategoryId))
      .sort((a, b) => {
        const aPosition = Number.isSafeInteger(Number(a.position)) ? Number(a.position) : Infinity;
        const bPosition = Number.isSafeInteger(Number(b.position)) ? Number(b.position) : Infinity;
        if (aPosition !== bPosition) return aPosition - bPosition;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
    const pairs = [];
    if (row.primaryCategoryName && row.primaryCategorySlug) {
      pairs.push({ name: String(row.primaryCategoryName), slug: String(row.primaryCategorySlug) });
    }
    for (const item of assigned) {
      pairs.push({ name: String(item.name || ''), slug: String(item.slug || '') });
    }
    const tags = Array.isArray(row.tags) ? row.tags : [];
    return {
      ...row,
      tags,
      categoryNames: pairs.map((pair) => pair.name),
      categorySlugs: pairs.map((pair) => pair.slug),
      pairs,
    };
  });

  const summaryTools = [...new Set(
    eligible
      .map((prompt) => String(prompt.generationTestedTool || '').trim())
      .filter(Boolean),
  )];

  const countsByPair = new Map();
  for (const prompt of eligible) {
    for (const pair of prompt.pairs) {
      if (!pair.name || !pair.slug) continue;
      const key = `${pair.slug}\0${pair.name}`;
      if (!countsByPair.has(key)) {
        countsByPair.set(key, { slug: pair.slug, name: pair.name, ids: new Set() });
      }
      countsByPair.get(key).ids.add(Number(prompt.id));
    }
  }
  const categories = [...countsByPair.values()]
    .map((item) => ({ slug: item.slug, name: item.name, count: item.ids.size }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const normalizedSearch = String(search || '').toLowerCase();
  const matching = eligible.filter((prompt) => {
    if (category) {
      const hasCategory = prompt.pairs.some(
        (pair) => pair.slug === category && pair.name !== '',
      );
      if (!hasCategory) return false;
    }
    if (search) {
      const haystack = [
        prompt.title,
        prompt.prompt,
        prompt.intro,
        prompt.useCase,
        prompt.generationTestedTool,
        prompt.tags.map((tag) => String(tag ?? '')).join(' '),
        prompt.categoryNames.join(' '),
      ]
        .filter((value) => typeof value === 'string' && value !== '')
        .join(' ');
      if (!haystack.toLowerCase().includes(normalizedSearch)) return false;
    }
    return true;
  });

  const total = matching.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const sorted = [...matching].sort((a, b) => {
    if (sort === 'title-asc') {
      const aTitle = String(a.title || '').toLowerCase();
      const bTitle = String(b.title || '').toLowerCase();
      if (aTitle !== bTitle) return aTitle < bTitle ? -1 : 1;
      return Number(a.id) - Number(b.id);
    }
    const aCreatedAt = a.createdAtSort || null;
    const bCreatedAt = b.createdAtSort || null;
    if (aCreatedAt === null && bCreatedAt === null) return Number(b.id) - Number(a.id);
    if (aCreatedAt === null) return 1;
    if (bCreatedAt === null) return -1;
    if (aCreatedAt !== bCreatedAt) return aCreatedAt < bCreatedAt ? 1 : -1;
    return Number(b.id) - Number(a.id);
  });
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return {
    total,
    totalPages,
    prompts: pageRows.map((row) => ({
      id: String(row.id),
      title: row.title,
      prompt: row.prompt,
      slug: row.slug,
      intro: row.intro || '',
      useCase: row.useCase || '',
      tags: Array.isArray(row.tags) ? row.tags : [],
      categories: categoryFields({ categories: row.categoryNames, categorySlugs: row.categorySlugs }),
      generationTestedTool: String(row.generationTestedTool || '').trim(),
      createdAt: row.createdAt || '',
    })),
    categories,
    stats: {
      totalPrompts: eligible.length,
      categoryCount: categories.length,
      testedToolCount: summaryTools.length,
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
  // EXISTS returns a boolean on Neon but 1/0 on D1.
  return Boolean(result.rows[0]?.eligible);
}
