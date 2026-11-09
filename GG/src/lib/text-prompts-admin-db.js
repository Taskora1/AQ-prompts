import { getPgPool } from './db.js';
import { supportsCategoryLibraryType } from './categories-db.js';
import {
  getMcpDraftAuthorizationSql,
  insertMcpPromptOwner,
  lockMcpOAuthAuthorization,
  lockMcpOAuthDraftAuthorization,
} from './mcp-oauth-db.js';
import { isIndexablePrompt, slugifyPrompt } from './prompt-constants.js';

const MAX_TITLE_LENGTH = 200;
const MAX_PROMPT_LENGTH = 20_000;
const MAX_SLUG_LENGTH = 220;
const MAX_TAGS = 30;

function cleanText(value) {
  return String(value ?? '').trim();
}

function cleanId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cleanIds(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(cleanId).filter(Boolean))]
    : [];
}

export function validateTextPromptInput(input) {
  const title = cleanText(input?.title);
  const prompt = cleanText(input?.prompt);
  const slug = slugifyPrompt(cleanText(input?.slug));
  const primaryCategoryId = cleanId(input?.primaryCategoryId);
  const categoryIds = cleanIds(input?.categoryIds);
  const tags = [...new Set((Array.isArray(input?.tags) ? input.tags : cleanText(input?.tags).split(','))
    .map(cleanText)
    .filter(Boolean))];
  const intro = cleanText(input?.intro);
  const useCase = cleanText(input?.useCase);
  const status = input?.status === 'published' ? 'published' : input?.status === 'draft' ? 'draft' : '';
  const errors = {};

  if (title.length < 3 || title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title must be between 3 and ${MAX_TITLE_LENGTH} characters.`;
  }
  if (prompt.length < 10 || prompt.length > MAX_PROMPT_LENGTH) {
    errors.prompt = `Prompt text must be between 10 and ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`;
  }
  if (!slug || slug.length > MAX_SLUG_LENGTH || cleanText(input?.slug) !== slug) {
    errors.slug = 'Use a valid lowercase slug with letters, numbers, and hyphens.';
  }
  if (!primaryCategoryId) errors.primaryCategoryId = 'Choose a primary category.';
  if (categoryIds.length > MAX_TAGS) errors.categoryIds = 'Choose no more than 30 categories.';
  if (tags.length > MAX_TAGS) errors.tags = 'Use no more than 30 tags.';
  if (intro.length > 5_000) errors.intro = 'Description must be 5,000 characters or fewer.';
  if (useCase.length > 200) errors.useCase = 'Use case must be 200 characters or fewer.';
  if (!status) errors.status = 'Choose Draft or Published.';

  const orderedCategoryIds = primaryCategoryId
    ? [primaryCategoryId, ...categoryIds.filter((id) => id !== primaryCategoryId)]
    : categoryIds;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      title,
      prompt,
      slug,
      primaryCategoryId,
      categoryIds: orderedCategoryIds,
      tags,
      intro,
      useCase,
      status,
    },
  };
}

async function resolveCategories(client, data) {
  const supportsLibraryType = await supportsCategoryLibraryType(client);
  const result = await client.query(
    `SELECT id, name FROM categories
     WHERE id = ANY($1::bigint[])${supportsLibraryType ? " AND library_type = 'text'" : ''}`,
    [data.categoryIds],
  );
  const categories = new Map(result.rows.map((category) => [Number(category.id), category]));

  if (categories.size !== data.categoryIds.length || !categories.has(data.primaryCategoryId)) {
    const error = new Error('One or more selected categories no longer exist.');
    error.code = 'INVALID_CATEGORY_SELECTION';
    throw error;
  }

  return {
    primary: categories.get(data.primaryCategoryId),
    ordered: data.categoryIds.map((id) => categories.get(id)),
  };
}

async function replaceCategories(client, promptId, categoryIds) {
  await client.query('DELETE FROM prompt_categories WHERE prompt_id = $1', [promptId]);
  for (let position = 0; position < categoryIds.length; position += 1) {
    await client.query(
      'INSERT INTO prompt_categories (prompt_id, category_id, position) VALUES ($1, $2, $3)',
      [promptId, categoryIds[position], position],
    );
  }
}

function mapTextPrompt(row) {
  return {
    id: Number(row.id),
    title: row.title,
    prompt: row.prompt,
    slug: row.slug,
    category: row.category || '',
    categories: Array.isArray(row.categories) ? row.categories : [],
    primaryCategoryId: Number(row.primaryCategoryId) || null,
    categoryIds: Array.isArray(row.categoryIds) ? row.categoryIds.map(Number) : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    intro: row.intro || '',
    useCase: row.useCase || '',
    status: row.status,
    updatedAt: row.updatedAt || '',
  };
}

export async function listTextPromptRows({
  page = 1,
  pageSize = 30,
  search = '',
  status = 'all',
  category = '',
  sort = 'updated_desc',
} = {}) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 30, 10), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const normalizedSearch = cleanText(search).slice(0, 200);
  const normalizedStatus = status === 'published' || status === 'draft' ? status : 'all';
  const normalizedCategory = cleanText(category).slice(0, 200);
  const normalizedSort = ['updated_asc', 'title_asc', 'title_desc'].includes(sort)
    ? sort
    : 'updated_desc';
  const orderBy = {
    updated_desc: 'p.updated_at DESC NULLS LAST, p.id DESC',
    updated_asc: 'p.updated_at ASC NULLS LAST, p.id ASC',
    title_asc: 'p.title ASC, p.id ASC',
    title_desc: 'p.title DESC, p.id DESC',
  }[normalizedSort];
  const categoryExpression = 'COALESCE(primary_category.name, p.category, p.use_case)';
  const conditions = ["p.library_type = 'text'"];
  const values = [];

  if (normalizedSearch) {
    values.push(`%${normalizedSearch}%`);
    conditions.push(`p.title ILIKE $${values.length}`);
  }
  if (normalizedStatus !== 'all') {
    values.push(normalizedStatus);
    conditions.push(`p.status = $${values.length}`);
  }
  if (normalizedCategory) {
    values.push(normalizedCategory);
    conditions.push(`${categoryExpression} = $${values.length}`);
  }
  const where = conditions.join(' AND ');
  const pool = getPgPool();
  const [countResult, categoriesResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM prompts p
       LEFT JOIN categories primary_category ON primary_category.id = p.primary_category_id
       WHERE ${where}`,
      values,
    ),
    pool.query(`
      SELECT DISTINCT ${categoryExpression} AS category
      FROM prompts p
      LEFT JOIN categories primary_category ON primary_category.id = p.primary_category_id
      WHERE p.library_type = 'text'
        AND ${categoryExpression} IS NOT NULL
        AND ${categoryExpression} <> ''
      ORDER BY category
    `),
  ]);
  const total = Number(countResult.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;
  const result = await pool.query(
    `
      SELECT
        p.id, p.title, p.slug, p.status, p.updated_at::text AS "updatedAt",
        COALESCE(primary_category.name, p.category, p.use_case) AS category
      FROM prompts p
      LEFT JOIN categories primary_category ON primary_category.id = p.primary_category_id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `,
    [...values, safePageSize, offset],
  );

  return {
    rows: result.rows.map(mapTextPrompt),
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
    search: normalizedSearch,
    status: normalizedStatus,
    category: normalizedCategory,
    categories: categoriesResult.rows.map((row) => row.category),
    sort: normalizedSort,
  };
}

export async function getTextPromptById(id, { client = getPgPool() } = {}) {
  const result = await client.query(
    `
      SELECT
        p.id, p.title, p.prompt, p.slug, p.status, p.intro,
        p.use_case AS "useCase",
        COALESCE(primary_category.name, p.category) AS category,
        COALESCE(assigned.names, p.categories, '[]'::jsonb) AS categories,
        p.primary_category_id AS "primaryCategoryId",
        COALESCE(assigned.ids, '[]'::jsonb) AS "categoryIds",
        p.tags, p.image, p.images, p.og_image AS "ogImage",
        p.updated_at::text AS "updatedAt"
      FROM prompts p
      LEFT JOIN categories primary_category ON primary_category.id = p.primary_category_id
      LEFT JOIN LATERAL (
        SELECT
          JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names,
          JSONB_AGG(c.id ORDER BY pc.position, c.id) AS ids
        FROM prompt_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.prompt_id = p.id
      ) assigned ON true
      WHERE p.id = $1 AND p.library_type = 'text'
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ? mapTextPrompt(result.rows[0]) : null;
}

export async function insertTextPrompt(data, { mcpAuthorization = null } = {}) {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (mcpAuthorization) await lockMcpOAuthAuthorization(client, mcpAuthorization);
    const selection = await resolveCategories(client, data);
    const isPublicEligible = isIndexablePrompt({
      ...data,
      image: '',
      images: [],
      ogImage: '',
    });
    const result = await client.query(
      `
        INSERT INTO prompts (
          title, prompt, slug, image, images, category, categories, use_case, tags,
          created_at, intro, status, primary_category_id, library_type,
          is_public_eligible
        )
        VALUES ($1, $2, $3, NULL, '[]'::jsonb, $4, $5::jsonb, $6, $7::jsonb,
                CURRENT_DATE, $8, $9, $10, 'text', $11)
        RETURNING id, slug, status
      `,
      [
        data.title,
        data.prompt,
        data.slug,
        selection.primary.name,
        JSON.stringify(selection.ordered.map((category) => category.name)),
        data.useCase || null,
        JSON.stringify(data.tags),
        data.intro || null,
        mcpAuthorization ? 'draft' : data.status,
        data.primaryCategoryId,
        isPublicEligible,
      ],
    );
    const id = Number(result.rows[0].id);
    await replaceCategories(client, id, data.categoryIds);
    if (mcpAuthorization) await insertMcpPromptOwner(client, id, mcpAuthorization);
    await client.query('COMMIT');
    return { id, slug: result.rows[0].slug, status: result.rows[0].status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTextPrompt(
  id,
  data,
  {
    expectedStatus = null,
    mcpAuthorization = null,
    client: suppliedClient = null,
    manageTransaction = true,
  } = {},
) {
  const pool = getPgPool();
  const ownsClient = !suppliedClient;
  const client = suppliedClient || await pool.connect();
  try {
    if (manageTransaction) await client.query('BEGIN');
    if (mcpAuthorization) {
      await lockMcpOAuthAuthorization(client, mcpAuthorization);
      await lockMcpOAuthDraftAuthorization(client, id, 'text', mcpAuthorization);
    }
    const selection = await resolveCategories(client, data);
    const existing = await client.query(
      'SELECT image, images, og_image AS "ogImage" FROM prompts WHERE id = $1 AND library_type = $2',
      [id, 'text'],
    );
    if (!existing.rows[0]) {
      if (manageTransaction) await client.query('ROLLBACK');
      return null;
    }
    const isPublicEligible = isIndexablePrompt({
      ...existing.rows[0],
      ...data,
    });
    const accessSql = mcpAuthorization
      ? getMcpDraftAuthorizationSql(expectedStatus ? 14 : 13, expectedStatus ? 15 : 14)
      : '';
    const result = await client.query(
      `
        UPDATE prompts
        SET title = $2, prompt = $3, slug = $4, category = $5, categories = $6::jsonb,
            use_case = $7, tags = $8::jsonb, intro = $9, status = $10,
            primary_category_id = $11, is_public_eligible = $12,
            updated_at = NOW()
        WHERE id = $1 AND library_type = 'text'
          ${expectedStatus ? 'AND status = $13' : ''}
          ${accessSql}
        RETURNING id, slug, status, updated_at::text AS "updatedAt"
      `,
      [
        id,
        data.title,
        data.prompt,
        data.slug,
        selection.primary.name,
        JSON.stringify(selection.ordered.map((category) => category.name)),
        data.useCase || null,
        JSON.stringify(data.tags),
        data.intro || null,
        data.status,
        data.primaryCategoryId,
        isPublicEligible,
        ...(expectedStatus ? [expectedStatus] : []),
        ...(mcpAuthorization ? [mcpAuthorization.subject, mcpAuthorization.clientId] : []),
      ],
    );
    if (!result.rows[0]) {
      if (manageTransaction) await client.query('ROLLBACK');
      return null;
    }
    await replaceCategories(client, id, data.categoryIds);
    if (manageTransaction) await client.query('COMMIT');
    return {
      id: Number(result.rows[0].id),
      slug: result.rows[0].slug,
      status: result.rows[0].status,
      updatedAt: result.rows[0].updatedAt || '',
    };
  } catch (error) {
    if (manageTransaction) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
}

export async function deleteTextPrompt(id) {
  const result = await getPgPool().query(
    `DELETE FROM prompts
     WHERE id = $1 AND library_type = 'text'
     RETURNING id, title, slug, status`,
    [id],
  );
  return result.rows[0] || null;
}