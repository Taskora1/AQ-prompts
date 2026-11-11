/**
 * Blog Posts — Neon PostgreSQL data access layer.
 *
 * Follows the same patterns as prompts-db.js:
 * - Uses getPgPool() from db.js
 * - Parameterized queries
 * - JSONB for structured fields (tags, faqs, toc, meta)
 * - Proper indexing on slug, status, publish_date
 *
 * Source of truth for all blog content after migration.
 */

import { getPgPool } from './db.js';
import { cache } from 'react';

// ── Cache (similar to prompts-db.js) ───────────────────────────────────

const REDIRECTED_BLOG_POST_SLUGS = ['chatgpt-dress-change-prompt-guide-for-women'];

// ── Helpers ─────────────────────────────────────────────────────────────

function cleanText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// Normalize any date/timestamp to the HTML date-input format "yyyy-MM-dd".
// Handles "2026-06-01 00:00:00+00", "2026-06-01T00:00:00.000Z", and plain "2026-06-01".
function toISODate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw;
}
function mapPost(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || '',
    content: row.content || '',
    contentHtml: row.content_html || '',
    contentText: row.content_text || '',
    featuredImage: row.featured_image || '',
    featuredImageAlt: row.featured_image_alt || '',
    featuredImageAltText: row.featured_image_alt || '',
    author: row.author || 'Abdul Qudoos',
    authorMeta: row.author_meta || null,
    category: row.category || 'Creator Growth',
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status || 'draft',
    featured: Boolean(row.featured),
    publishDate: toISODate(row.publish_date),
    date: toISODate(row.publish_date),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    readingTime: Number(row.reading_time) || 5,
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    description: row.seo_description || '',
    canonicalUrl: row.canonical_url || '',
    ogImage: row.og_image || '',
    ogImageAlt: row.og_image_alt || '',
    faqs: Array.isArray(row.faqs) ? row.faqs : [],
    toc: Array.isArray(row.toc) ? row.toc : [],
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
    keywords: row.keywords || '',
    contentType: 'blog',
    featuredPost: Boolean(row.featured),
    primaryVideo: null,
    blocks: [],
    normalizedBlocks: [],
    relatedPosts: [],
  };
}

function mapPostWriteResult(row, data) {
  return mapPost({
    ...row,
    title: data.title || '',
    excerpt: data.excerpt || '',
    content: data.content || '',
    content_html: data.contentHtml || '',
    content_text: data.contentText || '',
    featured_image: data.featuredImage || '',
    featured_image_alt: data.featuredImageAlt || '',
    author: data.author || 'Abdul Qudoos',
    author_meta: data.authorMeta || null,
    category: data.category || 'Creator Growth',
    tags: Array.isArray(data.tags) ? data.tags : [],
    featured: data.featured || false,
    reading_time: data.readingTime || 5,
    seo_title: data.seoTitle || '',
    seo_description: data.seoDescription || '',
    canonical_url: data.canonicalUrl || '',
    og_image: data.ogImage || '',
    og_image_alt: data.ogImageAlt || '',
    faqs: Array.isArray(data.faqs) ? data.faqs : [],
    toc: Array.isArray(data.toc) ? data.toc : [],
    meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
    keywords: data.keywords || '',
  });
}

// ── Schema Setup ────────────────────────────────────────────────────────

// The Neon HTTP driver rejects multiple statements in one query
// ("cannot insert multiple commands into a prepared statement"), so each
// DDL statement below runs as its own pool.query() call — same pattern as
// ensureAdminLoginRateLimitSchema in admin-users-db.js and
// ensurePasswordResetTable in admin-password-reset-db.js. Previously all
// five statements were sent in one query, which broke every admin blog
// page/API call on its first request per Worker isolate.
const CREATE_BLOG_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT DEFAULT '',
  content TEXT DEFAULT '',
  content_html TEXT DEFAULT '',
  content_text TEXT DEFAULT '',
  featured_image TEXT DEFAULT '',
  featured_image_alt TEXT DEFAULT '',
  author TEXT DEFAULT 'Abdul Qudoos',
  author_meta JSONB DEFAULT NULL,
  category TEXT DEFAULT 'Creator Growth',
  tags JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  featured BOOLEAN DEFAULT false,
  publish_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  reading_time INTEGER DEFAULT 5,
  seo_title TEXT DEFAULT '',
  seo_description TEXT DEFAULT '',
  canonical_url TEXT DEFAULT '',
  og_image TEXT DEFAULT '',
  og_image_alt TEXT DEFAULT '',
  faqs JSONB DEFAULT '[]'::jsonb,
  toc JSONB DEFAULT '[]'::jsonb,
  meta JSONB DEFAULT '{}'::jsonb,
  keywords TEXT DEFAULT ''
)
`;

const CREATE_BLOG_POSTS_SLUG_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug)
`;

const CREATE_BLOG_POSTS_STATUS_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status)
`;

const CREATE_BLOG_POSTS_PUBLISH_DATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_blog_posts_publish_date ON blog_posts(publish_date)
`;

const CREATE_BLOG_POSTS_CATEGORY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category)
`;

let blogTableEnsured = false;

export async function ensureBlogTable() {
  if (blogTableEnsured) return;
  const db = getPgPool();
  await db.query(CREATE_BLOG_TABLE_SQL);
  await db.query(CREATE_BLOG_POSTS_SLUG_INDEX_SQL);
  await db.query(CREATE_BLOG_POSTS_STATUS_INDEX_SQL);
  await db.query(CREATE_BLOG_POSTS_PUBLISH_DATE_INDEX_SQL);
  await db.query(CREATE_BLOG_POSTS_CATEGORY_INDEX_SQL);
  blogTableEnsured = true;
}

// ── Read Operations ─────────────────────────────────────────────────────

/**
 * Get all blog posts for admin (includes drafts).
 * Reads directly from Neon — no caching for admin views.
 */
export async function listBlogPostsForAdmin({
  page = 1,
  pageSize = 30,
  status = 'all',
  search = '',
  category = '',
  sort = 'date_desc',
  includeExcerpt = true,
} = {}) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 30, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const safeStatus = ['all', 'published', 'draft'].includes(status) ? status : 'all';
  const safeSearch = String(search || '').trim().slice(0, 200);
  const safeCategory = String(category || '').trim().slice(0, 200);
  const safeSort = ['date_asc', 'title_asc', 'title_desc'].includes(sort) ? sort : 'date_desc';
  const orderBy = {
    date_desc: 'publish_date DESC NULLS LAST, updated_at DESC, id DESC',
    date_asc: 'publish_date ASC NULLS LAST, updated_at ASC, id ASC',
    title_asc: 'title ASC, id ASC',
    title_desc: 'title DESC, id DESC',
  }[safeSort];
  const conditions = ['($1 = \'all\' OR status = $1)'];
  const filters = [safeStatus];
  if (safeCategory) {
    filters.push(safeCategory);
    conditions.push(`category = $${filters.length}`);
  }
  if (safeSearch) {
    filters.push(`%${safeSearch}%`);
    conditions.push(`(title ILIKE $${filters.length} OR excerpt ILIKE $${filters.length} OR tags::text ILIKE $${filters.length})`);
  }
  const where = conditions.join(' AND ');
  const excerptColumn = includeExcerpt ? 'excerpt, ' : '';
  const offset = (safePage - 1) * safePageSize;
  const [countResult, statsResult, categoriesResult, result] = await Promise.all([
    getPgPool().query(`
      SELECT COUNT(*)::int AS total
      FROM blog_posts
      WHERE ${where}
    `, filters),
    getPgPool().query(`
      SELECT
        -- NB: alias is total_all, not all — ALL is a reserved word in
        -- SQLite and a bare AS all is a syntax error on the D1 path
        -- (it broke /admin/blog: the stats query is one of four in
        -- Promise.all, so one failure fails the whole admin list).
        COUNT(*)::int AS total_all,
        COUNT(*) FILTER (WHERE status = 'published')::int AS published,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS draft
      FROM blog_posts
    `),
    getPgPool().query(`
      SELECT DISTINCT category
      FROM blog_posts
      WHERE category IS NOT NULL AND category <> ''
      ORDER BY category
    `),
    getPgPool().query(`
    SELECT
      id, slug, title, ${excerptColumn}featured_image, author,
      category, tags, status, featured,
      publish_date::text AS publish_date,
      updated_at::text AS updated_at,
      reading_time
    FROM blog_posts
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT $${filters.length + 1} OFFSET $${filters.length + 2}
  `, [...filters, safePageSize, offset]),
  ]);

  return {
    rows: result.rows.map(mapPost),
    total: Number(countResult.rows[0]?.total || 0),
    statusCounts: {
      all: Number(statsResult.rows[0]?.total_all || 0),
      published: Number(statsResult.rows[0]?.published || 0),
      draft: Number(statsResult.rows[0]?.draft || 0),
    },
    page: safePage,
    pageSize: safePageSize,
    status: safeStatus,
    search: safeSearch,
    category: safeCategory,
    categories: categoriesResult.rows.map((row) => row.category),
    sort: safeSort,
  };
}

/**
 * Slim published-posts query — excludes heavy content columns.
 * Use for blog listing pages, homepage, RSS feeds.
 */
const SLIM_BLOG_CACHE_TTL_MS = 2 * 60 * 1000;
let cachedSlimPublishedPosts = null;
let cachedSlimPublishedAt = 0;
const HOMEPAGE_BLOG_CACHE_TTL_MS = 2 * 60 * 1000;
const HOMEPAGE_BLOG_LIMIT = 3;
let cachedHomepageBlogPosts = null;
let cachedHomepageBlogPostsAt = 0;
let cachedHomepageBlogPostsPromise = null;

function mapPostSlim(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || '',
    content: '',
    contentHtml: '',
    contentText: '',
    featuredImage: row.featured_image || '',
    featuredImageAlt: row.featured_image_alt || '',
    featuredImageAltText: row.featured_image_alt || '',
    author: row.author || 'Abdul Qudoos',
    authorMeta: row.author_meta || null,
    category: row.category || 'Creator Growth',
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status || 'draft',
    featured: Boolean(row.featured),
    publishDate: toISODate(row.publish_date),
    date: toISODate(row.publish_date),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    readingTime: Number(row.reading_time) || 5,
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    description: row.seo_description || '',
    canonicalUrl: row.canonical_url || '',
    ogImage: row.og_image || '',
    ogImageAlt: row.og_image_alt || '',
    faqs: [],
    toc: [],
    meta: {},
    keywords: row.keywords || '',
    contentType: 'blog',
    featuredPost: Boolean(row.featured),
    primaryVideo: null,
    blocks: [],
    normalizedBlocks: [],
    relatedPosts: [],
  };
}

export async function getPublishedBlogPostsSlim() {
  const now = Date.now();
  if (cachedSlimPublishedPosts && now - cachedSlimPublishedAt < SLIM_BLOG_CACHE_TTL_MS) {
    return cachedSlimPublishedPosts;
  }

  const result = await getPgPool().query(`
    SELECT
      id, slug, title, excerpt,
      featured_image, featured_image_alt, author, author_meta,
      category, tags, status, featured,
      publish_date::text AS publish_date,
      created_at::text AS created_at,
      updated_at::text AS updated_at,
      reading_time, seo_title, seo_description, canonical_url,
      og_image, og_image_alt, keywords
    FROM blog_posts
    WHERE status = 'published'
    ORDER BY publish_date DESC NULLS LAST, created_at DESC
  `);

  const posts = result.rows.map(mapPostSlim);
  cachedSlimPublishedPosts = posts;
  cachedSlimPublishedAt = now;
  return posts;
}

export async function getHomepageBlogPosts() {
  const now = Date.now();
  if (
    cachedHomepageBlogPosts
    && now - cachedHomepageBlogPostsAt < HOMEPAGE_BLOG_CACHE_TTL_MS
  ) {
    return cachedHomepageBlogPosts;
  }
  if (cachedHomepageBlogPostsPromise) return cachedHomepageBlogPostsPromise;

  cachedHomepageBlogPostsPromise = (async () => {
    const startedAt = Date.now();
    try {
      const result = await getPgPool().query({
        text: `
          SELECT
            slug,
            title,
            excerpt,
            seo_description AS description,
            category,
            featured_image,
            featured_image_alt
          FROM blog_posts
          WHERE status = 'published'
          ORDER BY publish_date DESC NULLS LAST, created_at DESC
          LIMIT $1
        `,
        values: [HOMEPAGE_BLOG_LIMIT],
      });
      console.info(`[HOME_TIMING] blog_guides_db_ms=${Date.now() - startedAt}`);
      const posts = result.rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt || '',
        description: row.description || '',
        category: row.category || 'Creator Growth',
        featuredImage: row.featured_image || '',
        featuredImageAltText: row.featured_image_alt || '',
      }));
      cachedHomepageBlogPosts = posts;
      cachedHomepageBlogPostsAt = Date.now();
      return posts;
    } catch (error) {
      console.error(`[HOME_TIMING] blog_guides_db_failed_ms=${Date.now() - startedAt}`);
      throw error;
    } finally {
      cachedHomepageBlogPostsPromise = null;
    }
  })();

  return cachedHomepageBlogPostsPromise;
}

export async function getPublishedBlogPostsForFeed() {
  const result = await getPgPool().query(`
    SELECT
      slug,
      title,
      excerpt,
      featured_image,
      category,
      tags,
      publish_date::text AS publish_date,
      updated_at::text AS updated_at
    FROM blog_posts
    WHERE status = 'published'
      AND slug <> ALL($1::text[])
    ORDER BY publish_date DESC NULLS LAST, updated_at DESC
  `, [REDIRECTED_BLOG_POST_SLUGS]);

  return result.rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || '',
    featuredImage: row.featured_image || '',
    category: row.category || 'Creator Growth',
    tags: Array.isArray(row.tags) ? row.tags : [],
    publishDate: toISODate(row.publish_date),
    updatedAt: row.updated_at || '',
  }));
}

/**
 * Get a single blog post by slug.
 * Returns null if not found.
 */
export async function getBlogPostBySlug(slug) {
  const safeSlug = cleanText(slug);
  if (!safeSlug) return null;

  const result = await getPgPool().query(`
    SELECT
      id, slug, title, excerpt, content, content_html, content_text,
      featured_image, featured_image_alt, author, author_meta,
      category, tags, status, featured,
      publish_date::text AS publish_date,
      created_at::text AS created_at,
      updated_at::text AS updated_at,
      reading_time, seo_title, seo_description, canonical_url,
      og_image, og_image_alt, faqs, toc, meta, keywords
    FROM blog_posts
    WHERE slug = $1
    LIMIT 1
  `, [safeSlug]);

  return mapPost(result.rows[0]);
}

/**
 * Get a published blog post by slug (public access).
 * Returns null for drafts or missing posts.
 */
// Deduplicate public metadata/page/JSON-LD lookups within one render request.
export const getCachedBlogPostBySlug = cache(getBlogPostBySlug);

export async function getPublishedBlogPostBySlug(slug) {
  const post = await getCachedBlogPostBySlug(slug);
  if (!post || post.status !== 'published') return null;
  return post;
}

/**
 * Lightweight published-post lookup for related-content panels.
 * Only returns fields needed for the same-category/tag matching logic used by
 * the blog detail page; this avoids fetching full article bodies and metadata
 * when building related-post suggestions.
 */
export async function getPublishedBlogPostsForRelated(
  slug,
  { category = 'Creator Growth', tags = [] } = {},
) {
  const safeSlug = cleanText(slug);
  if (!safeSlug) return [];

  const result = await getPgPool().query(`
    SELECT
      id,
      slug,
      title,
      category,
      tags,
      status,
      featured_image,
      featured_image_alt,
      publish_date::text AS publish_date,
      updated_at::text AS updated_at
    FROM blog_posts
    WHERE status = 'published'
      AND slug <> $1
      AND (
        BTRIM(COALESCE(NULLIF(category, ''), 'Creator Growth')) = $2
        OR (
          jsonb_typeof(tags) = 'array'
          AND tags ?| $3::text[]
        )
      )
    ORDER BY
      COALESCE(
        (LEFT(publish_date::text, 10)::date)::timestamp AT TIME ZONE 'UTC',
        updated_at,
        'epoch'::timestamptz
      ) DESC,
      title COLLATE "C" ASC
    LIMIT 6
  `, [safeSlug, category, tags]);

  return result.rows.map((row) => ({
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    category: row.category || 'Creator Growth',
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status || 'published',
    featuredImage: row.featured_image || '',
    featuredImageAlt: row.featured_image_alt || '',
    publishDate: toISODate(row.publish_date),
    updatedAt: row.updated_at || row.publish_date || '',
  }));
}

// ── Write Operations ────────────────────────────────────────────────────

/**
 * Create a new blog post.
 * Returns the created post.
 */
export async function createBlogPost(data) {
  const db = getPgPool();
  const result = await db.query(`
    INSERT INTO blog_posts (
      slug, title, excerpt, content, content_html, content_text,
      featured_image, featured_image_alt, author, author_meta,
      category, tags, status, featured,
      publish_date, reading_time, seo_title, seo_description,
      canonical_url, og_image, og_image_alt, faqs, toc, meta, keywords
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, $17, $18,
      $19, $20, $21, $22, $23, $24, $25
    )
    RETURNING
      id, slug, status,
      publish_date::text AS publish_date,
      created_at::text AS created_at,
      updated_at::text AS updated_at
  `, [
    data.slug,
    data.title,
    data.excerpt || '',
    data.content || '',
    data.contentHtml || '',
    data.contentText || '',
    data.featuredImage || '',
    data.featuredImageAlt || '',
    data.author || 'Abdul Qudoos',
    data.authorMeta ? JSON.stringify(data.authorMeta) : null,
    data.category || 'Creator Growth',
    JSON.stringify(data.tags || []),
    data.status || 'draft',
    data.featured || false,
    data.publishDate || data.date || new Date().toISOString().slice(0, 10),
    data.readingTime || 5,
    data.seoTitle || '',
    data.seoDescription || '',
    data.canonicalUrl || '',
    data.ogImage || '',
    data.ogImageAlt || '',
    JSON.stringify(data.faqs || []),
    JSON.stringify(data.toc || []),
    JSON.stringify(data.meta || {}),
    data.keywords || '',
  ]);

  // Clear cache
  clearBlogCache();

  return mapPostWriteResult(result.rows[0], data);
}

/**
 * Update an existing blog post.
 * Returns the updated post, or null if not found.
 */
export async function updateBlogPost(slug, data) {
  const db = getPgPool();
  const result = await db.query(`
    UPDATE blog_posts SET
      slug = $2,
      title = $3,
      excerpt = $4,
      content = $5,
      content_html = $6,
      content_text = $7,
      featured_image = $8,
      featured_image_alt = $9,
      author = $10,
      author_meta = $11,
      category = $12,
      tags = $13,
      status = $14,
      featured = $15,
      publish_date = $16,
      reading_time = $17,
      seo_title = $18,
      seo_description = $19,
      canonical_url = $20,
      og_image = $21,
      og_image_alt = $22,
      faqs = $23,
      toc = $24,
      meta = $25,
      keywords = $26,
      updated_at = NOW()
    WHERE slug = $1
    RETURNING
      id, slug, status,
      publish_date::text AS publish_date,
      created_at::text AS created_at,
      updated_at::text AS updated_at
  `, [
    slug,
    data.slug || slug,
    data.title || '',
    data.excerpt || '',
    data.content || '',
    data.contentHtml || '',
    data.contentText || '',
    data.featuredImage || '',
    data.featuredImageAlt || '',
    data.author || 'Abdul Qudoos',
    data.authorMeta ? JSON.stringify(data.authorMeta) : null,
    data.category || 'Creator Growth',
    JSON.stringify(data.tags || []),
    data.status || 'draft',
    data.featured || false,
    data.publishDate || data.date || new Date().toISOString().slice(0, 10),
    data.readingTime || 5,
    data.seoTitle || '',
    data.seoDescription || '',
    data.canonicalUrl || '',
    data.ogImage || '',
    data.ogImageAlt || '',
    JSON.stringify(data.faqs || []),
    JSON.stringify(data.toc || []),
    JSON.stringify(data.meta || {}),
    data.keywords || '',
  ]);

  if (result.rowCount === 0) return null;

  // Clear cache
  clearBlogCache();

  return mapPostWriteResult(result.rows[0], data);
}

/**
 * Delete a blog post by slug.
 * Returns true if deleted, false if not found.
 */
export async function deleteBlogPost(slug) {
  const safeSlug = cleanText(slug);
  if (!safeSlug) return false;

  const result = await getPgPool().query(
    'DELETE FROM blog_posts WHERE slug = $1',
    [safeSlug],
  );

  if (result.rowCount === 0) return false;

  // Clear cache
  clearBlogCache();

  return true;
}

// ── Cache Management ────────────────────────────────────────────────────

export function clearBlogCache() {
  cachedSlimPublishedPosts = null;
  cachedSlimPublishedAt = 0;
  cachedHomepageBlogPosts = null;
  cachedHomepageBlogPostsAt = 0;
  cachedHomepageBlogPostsPromise = null;
}

// ── Stats ───────────────────────────────────────────────────────────────

export async function getBlogPostStats() {
  const result = await getPgPool().query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'published')::int AS published,
      COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
    FROM blog_posts
  `);

  const row = result.rows[0];
  return {
    total: row.total || 0,
    published: row.published || 0,
    drafts: row.drafts || 0,
  };
}
