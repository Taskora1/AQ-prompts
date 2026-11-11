import { getPgPool } from './db.js';
import { slugifyPrompt } from './prompt-constants.js';

const MAX_NAME_LENGTH = 120;
const MAX_SLUG_LENGTH = 120;

function cleanText(value) {
  return String(value ?? '').trim();
}

function mapCategory(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    libraryType: row.libraryType || 'photo',
    publicRouteSlug: row.publicRouteSlug || null,
    hasPublicPage: Boolean(row.publicRouteSlug),
    promptCount: Number(row.promptCount || 0),
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || '',
  };
}

// The library_type column has existed for months and is not going away
// at runtime, so the EXISTS probe is cached in module scope: it used to
// run before the listCategories cache check and on every
// getCategoryById/createCategory/updateCategory call. The cached value
// keeps the supportsLibraryType=false code path intact for a schema
// without the column — callers still branch on the boolean.
let cachedSupportsCategoryLibraryType;

export async function supportsCategoryLibraryType(client = null) {
  if (cachedSupportsCategoryLibraryType !== undefined) {
    return cachedSupportsCategoryLibraryType;
  }
  const result = await (client || getPgPool()).query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'categories'
        AND column_name = 'library_type'
    ) AS supported
  `);
  // EXISTS returns a boolean on Neon but 1/0 on D1.
  cachedSupportsCategoryLibraryType = Boolean(result.rows[0]?.supported);
  return cachedSupportsCategoryLibraryType;
}

export function clearSupportsCategoryLibraryTypeCache() {
  cachedSupportsCategoryLibraryType = undefined;
}

export function validateCategoryInput(input) {
  const name = cleanText(input?.name);
  const rawSlug = cleanText(input?.slug);
  const slug = slugifyPrompt(rawSlug || name);
  const requestedLibraryType = cleanText(input?.libraryType);
  const libraryType = requestedLibraryType === 'text' ? 'text' : 'photo';
  const errors = {};

  if (requestedLibraryType && !['photo', 'text'].includes(requestedLibraryType)) {
    errors.libraryType = 'Choose Photo or Text Prompt categories.';
  }
  if (name.length < 2) {
    errors.name = 'Category name must be at least 2 characters.';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Category name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  if (!slug) {
    errors.slug = 'Enter a valid category slug.';
  } else if (slug.length > MAX_SLUG_LENGTH) {
    errors.slug = `Slug must be ${MAX_SLUG_LENGTH} characters or fewer.`;
  } else if (rawSlug && rawSlug !== slug) {
    errors.slug = 'Use lowercase letters, numbers, and hyphens only.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { name, slug, libraryType },
  };
}

const CATEGORIES_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cachedCategories = new Map();

export async function listCategories({ libraryType = 'photo' } = {}) {
  const normalizedLibraryType = libraryType === 'text' ? 'text' : 'photo';
  const pool = getPgPool();
  const supportsLibraryType = await supportsCategoryLibraryType(pool);
  const cacheKey = `${normalizedLibraryType}:${supportsLibraryType}`;
  const now = Date.now();
  const cached = cachedCategories.get(cacheKey);
  if (cached && now - cached.createdAt < CATEGORIES_CACHE_TTL_MS) {
    return cached.categories;
  }

  const result = await pool.query(`
    SELECT
      c.id,
      c.name,
      c.slug,
      ${supportsLibraryType ? `c.library_type AS "libraryType",` : `'photo'::text AS "libraryType",`}
      c.public_route_slug AS "publicRouteSlug",
      c.created_at::text AS "createdAt",
      c.updated_at::text AS "updatedAt",
      COUNT(p.id)::int AS "promptCount"
    FROM categories c
    LEFT JOIN prompt_categories pc ON pc.category_id = c.id
    LEFT JOIN prompts p ON p.id = pc.prompt_id AND p.status = 'published'
    ${supportsLibraryType ? 'WHERE c.library_type = $1' : ''}
    GROUP BY c.id
    ORDER BY c.public_route_slug IS NULL, c.name
  `, supportsLibraryType ? [normalizedLibraryType] : []);

  const categories = result.rows.map(mapCategory);
  cachedCategories.set(cacheKey, { categories, createdAt: now });
  return categories;
}

export function clearCategoriesCache() {
  cachedCategories.clear();
}

export async function getCategoryById(id) {
  const pool = getPgPool();
  const supportsLibraryType = await supportsCategoryLibraryType(pool);
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.name,
        c.slug,
        ${supportsLibraryType ? `c.library_type AS "libraryType",` : `'photo'::text AS "libraryType",`}
        c.public_route_slug AS "publicRouteSlug",
        c.created_at::text AS "createdAt",
        c.updated_at::text AS "updatedAt",
        COUNT(p.id)::int AS "promptCount"
      FROM categories c
      LEFT JOIN prompt_categories pc ON pc.category_id = c.id
      LEFT JOIN prompts p ON p.id = pc.prompt_id AND p.status = 'published'
      WHERE c.id = $1
      GROUP BY c.id
      LIMIT 1
    `,
    [id],
  );

  return mapCategory(result.rows[0]);
}

export async function createCategory(data) {
  const pool = getPgPool();
  const supportsLibraryType = await supportsCategoryLibraryType(pool);
  const result = await pool.query(
    `
      INSERT INTO categories (name, slug${supportsLibraryType ? ', library_type' : ''})
      VALUES ($1, $2${supportsLibraryType ? ', $3' : ''})
      RETURNING
        id,
        name,
        slug,
        ${supportsLibraryType ? `library_type AS "libraryType",` : `'photo'::text AS "libraryType",`}
        public_route_slug AS "publicRouteSlug",
        created_at::text AS "createdAt",
        updated_at::text AS "updatedAt",
        0::int AS "promptCount"
    `,
    supportsLibraryType
      ? [data.name, data.slug, data.libraryType === 'text' ? 'text' : 'photo']
      : [data.name, data.slug],
  );

  return mapCategory(result.rows[0]);
}

export async function updateCategory(id, data) {
  const pool = getPgPool();
  const supportsLibraryType = await supportsCategoryLibraryType(pool);
  const result = await pool.query(
    `
      UPDATE categories
      SET name = $2, slug = $3, updated_at = NOW()
      WHERE id = $1${supportsLibraryType ? " AND library_type = 'photo'" : ''}
      RETURNING
        id,
        name,
        slug,
        ${supportsLibraryType ? `library_type AS "libraryType",` : `'photo'::text AS "libraryType",`}
        public_route_slug AS "publicRouteSlug",
        created_at::text AS "createdAt",
        updated_at::text AS "updatedAt"
    `,
    [id, data.name, data.slug],
  );
  if (!result.rows[0]) return null;

  const count = await pool.query(
    `SELECT COUNT(p.id)::int AS count
     FROM prompt_categories pc
     JOIN prompts p ON p.id = pc.prompt_id AND p.status = 'published'
     WHERE pc.category_id = $1`,
    [id],
  );

  return mapCategory({
    ...result.rows[0],
    promptCount: count.rows[0].count,
  });
}

export async function deleteCategory(id) {
  const category = await getCategoryById(id);
  if (!category) return { deleted: false, reason: 'not_found' };
  if (category.libraryType !== 'photo') return { deleted: false, reason: 'not_found' };
  if (category.hasPublicPage) {
    return {
      deleted: false,
      reason: 'public_page',
      category,
    };
  }
  if (category.promptCount > 0) {
    return {
      deleted: false,
      reason: 'in_use',
      category,
    };
  }

  await getPgPool().query('DELETE FROM categories WHERE id = $1', [id]);
  return { deleted: true, category };
}
