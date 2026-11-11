import { getPgPool } from './db.js';
import { McpAuthorizationError, lockMcpOAuthAuthorization, lockMcpOAuthBlogDraftAuthorization, lockMcpOAuthCapability, canMcpOAuthReadBlogPost, insertMcpBlogPostOwner } from './mcp-oauth-db.js';

async function clearBlogCache() {
  const module = await import('./blog-db.js');
  module.clearBlogCache();
}

async function revalidateBlogContent(action, slug) {
  const module = await import('./blog-revalidation.js');
  module.revalidateBlogContent(action, slug);
}

const MAX_PAGE = 1000;
const MAX_PAGE_SIZE = 50;

export class McpBlogToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'McpBlogToolError';
  }
}

function ensureOAuth(authentication) {
  if (authentication?.type !== 'oauth') {
    throw new McpAuthorizationError('OAuth authentication is required for blog tools.');
  }
}

function ensureId(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new McpBlogToolError('id must be a positive integer.');
  }
  return value;
}

function makeSlug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function plainTextHtml(value) {
  return value
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, '<br>')}</p>`)
    .join('\n');
}

function safeImageUrl(value) {
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new McpBlogToolError('featuredImage must be an HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new McpBlogToolError('featuredImage must be an HTTPS URL without embedded credentials.');
  }
  return url.toString();
}

function normalizeInput(input, existing = {}) {
  const title = String(input.title ?? existing.title ?? '').trim();
  const slug = makeSlug(input.slug ?? existing.slug ?? title);
  const content = String(input.content ?? existing.content ?? '').trim();
  const excerpt = String(input.excerpt ?? existing.excerpt ?? '').trim();
  const featuredImage = safeImageUrl(input.featuredImage ?? existing.featuredImage ?? '');
  const featuredImageAlt = String(input.featuredImageAlt ?? existing.featuredImageAlt ?? '').trim();
  const category = String(input.category ?? existing.category ?? 'Creator Growth').trim();
  const tags = input.tags ?? existing.tags ?? [];

  if (!title || title.length > 200) throw new McpBlogToolError('title must be between 1 and 200 characters.');
  if (!slug || slug.length > 255) throw new McpBlogToolError('Provide a valid blog slug.');
  if (content.length > 40_000) throw new McpBlogToolError('content must be 40,000 characters or fewer.');
  if (excerpt.length > 2_000) throw new McpBlogToolError('excerpt must be 2,000 characters or fewer.');
  if (!category || category.length > 120) throw new McpBlogToolError('category must be between 1 and 120 characters.');
  if (
    !Array.isArray(tags)
    || tags.length > 30
    || tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 100)
  ) {
    throw new McpBlogToolError('tags must contain at most 30 non-empty strings of 100 characters or fewer.');
  }

  return {
    title,
    slug,
    excerpt,
    content,
    contentHtml: plainTextHtml(content),
    contentText: content,
    featuredImage,
    featuredImageAlt,
    category,
    tags: [...new Set(tags.map((tag) => tag.trim()))],
    seoTitle: String(input.seoTitle ?? existing.seoTitle ?? title).trim().slice(0, 500),
    seoDescription: String(input.seoDescription ?? existing.seoDescription ?? excerpt).trim().slice(0, 5000),
    ogImage: featuredImage,
    ogImageAlt: featuredImageAlt,
    keywords: [...new Set(tags.map((tag) => tag.trim()))].join(', '),
  };
}

function validatePublish(post) {
  if (!post.title.trim() || !post.content.trim()) {
    throw new McpBlogToolError('Blog posts require a title and content before publishing.');
  }
  if (post.featuredImage && !post.featuredImageAlt) {
    throw new McpBlogToolError('Featured image alt text is required before publishing.');
  }
}

function projectPost(row, { includeContent = true } = {}) {
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || '',
    ...(includeContent ? { content: row.content || '' } : {}),
    featuredImage: row.featured_image || '',
    featuredImageAlt: row.featured_image_alt || '',
    category: row.category || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status,
    publishDate: row.publish_date || '',
    updatedAt: row.updated_at || '',
    readingTime: Number(row.reading_time) || 5,
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
  };
}

const BLOG_POST_COLUMNS = `
  id, slug, title, excerpt, content, featured_image, featured_image_alt,
  category, tags, status, publish_date::text AS publish_date,
  updated_at::text AS updated_at, reading_time, seo_title, seo_description
`;
const BLOG_POST_LIST_COLUMNS = `
  id, slug, title, excerpt, featured_image, featured_image_alt,
  category, tags, status, publish_date::text AS publish_date,
  updated_at::text AS updated_at, reading_time, seo_title, seo_description
`;

export async function listBlogPosts(input, authentication = null) {
  ensureOAuth(authentication);
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const status = input.status ?? 'all';
  const search = input.search ?? '';
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
    throw new McpBlogToolError(`page must be between 1 and ${MAX_PAGE}.`);
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new McpBlogToolError(`pageSize must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (!['all', 'draft', 'published'].includes(status)) {
    throw new McpBlogToolError('status must be all, draft, or published.');
  }
  if (typeof search !== 'string' || search.length > 200) {
    throw new McpBlogToolError('search must be 200 characters or fewer.');
  }
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    await lockMcpOAuthAuthorization(client, authentication);
    await client.query(
      `
        SELECT post_id
        FROM mcp_blog_post_draft_access
        WHERE subject = $1
          AND revoked_at IS NULL
        FOR SHARE
      `,
      [authentication.subject],
    );
    const visibility = `
      (
        p.status = 'published'
        OR (
          p.status = 'draft'
          AND (
            EXISTS (
              SELECT 1 FROM mcp_blog_post_owners owner
              WHERE owner.post_id = p.id AND owner.subject = $1
            )
            OR EXISTS (
              SELECT 1 FROM mcp_blog_post_draft_access access
              WHERE access.post_id = p.id
                AND access.subject = $1
                AND access.revoked_at IS NULL
            )
          )
        )
      )
    `;
    const conditions = [visibility];
    const values = [authentication.subject];
    if (status !== 'all') {
      values.push(status);
      conditions.push(`p.status = $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(p.title ILIKE $${values.length} OR p.content ILIKE $${values.length})`);
    }
    const where = conditions.join(' AND ');
    const count = await client.query(
      `SELECT COUNT(*)::int AS total FROM blog_posts p WHERE ${where}`,
      values,
    );
    const total = Number(count.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    values.push(pageSize, (currentPage - 1) * pageSize);
    const rows = await client.query(
      `
        SELECT ${BLOG_POST_LIST_COLUMNS}
        FROM blog_posts p
        WHERE ${where}
        ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values,
    );
    await client.query('COMMIT');
    return {
      rows: rows.rows.map((row) => projectPost(row, { includeContent: false })),
      total,
      page: currentPage,
      pageSize,
      totalPages,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getBlogPost(input, authentication = null) {
  ensureOAuth(authentication);
  const id = ensureId(input.id);
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    await lockMcpOAuthAuthorization(client, authentication);
    if (!await canMcpOAuthReadBlogPost(client, id, authentication)) {
      throw new McpAuthorizationError('Blog post not found or not accessible.');
    }
    const result = await client.query(
      `SELECT ${BLOG_POST_COLUMNS} FROM blog_posts WHERE id = $1 LIMIT 1`,
      [id],
    );
    await client.query('COMMIT');
    return projectPost(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createBlogDraft(
  input,
  authentication = null,
  { clearCache = clearBlogCache } = {},
) {
  ensureOAuth(authentication);
  const data = normalizeInput(input);
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    await lockMcpOAuthAuthorization(client, authentication);
    const result = await client.query(
      `
        INSERT INTO blog_posts (
          slug, title, excerpt, content, content_html, content_text,
          featured_image, featured_image_alt, author, category, tags,
          status, featured, publish_date, reading_time, seo_title, seo_description,
          canonical_url, og_image, og_image_alt, faqs, toc, meta, keywords
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 'Abdul Qudoos', $9, $10::jsonb,
          'draft', FALSE, NULL, 5, $11, $12, '', $13, $14,
          '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, $15
        )
        RETURNING ${BLOG_POST_COLUMNS}
      `,
      [
        data.slug,
        data.title,
        data.excerpt,
        data.content,
        data.contentHtml,
        data.contentText,
        data.featuredImage,
        data.featuredImageAlt,
        data.category,
        JSON.stringify(data.tags),
        data.seoTitle,
        data.seoDescription,
        data.ogImage,
        data.ogImageAlt,
        data.keywords,
      ],
    );
    const row = result.rows[0];
    await insertMcpBlogPostOwner(client, row.id, authentication);
    await client.query('COMMIT');
    await clearCache();
    return projectPost(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateBlogDraft(
  input,
  authentication = null,
  { clearCache = clearBlogCache, revalidate = revalidateBlogContent } = {},
) {
  ensureOAuth(authentication);
  const id = ensureId(input.id);
  const client = await getPgPool().connect();
  let oldSlug;
  let newSlug;
  try {
    await client.query('BEGIN');
    await lockMcpOAuthAuthorization(client, authentication);
    await lockMcpOAuthBlogDraftAuthorization(client, id, authentication);
    const existingResult = await client.query(
      `SELECT ${BLOG_POST_COLUMNS} FROM blog_posts WHERE id = $1 AND status = 'draft'`,
      [id],
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new McpAuthorizationError('Blog post not found or not editable.');
    const data = normalizeInput(input, projectPost(existing));
    oldSlug = existing.slug;
    newSlug = data.slug;
    const updated = await client.query(
      `
        UPDATE blog_posts
        SET slug = $2, title = $3, excerpt = $4, content = $5, content_html = $6,
            content_text = $7, featured_image = $8, featured_image_alt = $9,
            category = $10, tags = $11::jsonb, seo_title = $12, seo_description = $13,
            og_image = $14, og_image_alt = $15, keywords = $16, updated_at = NOW()
        WHERE id = $1
          AND status = 'draft'
          AND EXISTS (
            SELECT 1 FROM mcp_oauth_authorizations auth
            WHERE auth.subject = $17 AND auth.client_id = $18 AND auth.revoked_at IS NULL
          )
          AND (
            EXISTS (
              SELECT 1 FROM mcp_blog_post_owners owner
              WHERE owner.post_id = blog_posts.id AND owner.subject = $17
            )
            OR EXISTS (
              SELECT 1 FROM mcp_blog_post_draft_access access
              WHERE access.post_id = blog_posts.id AND access.subject = $17
                AND access.revoked_at IS NULL
            )
          )
        RETURNING ${BLOG_POST_COLUMNS}
      `,
      [
        id, data.slug, data.title, data.excerpt, data.content, data.contentHtml,
        data.contentText, data.featuredImage, data.featuredImageAlt, data.category,
        JSON.stringify(data.tags), data.seoTitle, data.seoDescription, data.ogImage,
        data.ogImageAlt, data.keywords, authentication.subject, authentication.clientId,
      ],
    );
    if (!updated.rows[0]) throw new McpAuthorizationError('Blog post not found or not editable.');
    await client.query('COMMIT');
    await clearCache();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    await revalidate('update', newSlug);
    if (oldSlug !== newSlug) await revalidate('update', oldSlug);
  } catch (error) {
    console.error('[MCP] Blog draft saved but cache revalidation failed.', error?.name || 'unknown');
    throw new McpBlogToolError('Draft was saved, but public blog cache refresh failed.');
  }
  return getBlogPost({ id }, authentication);
}

export async function publishBlogDraft(
  input,
  authentication = null,
  { clearCache = clearBlogCache, revalidate = revalidateBlogContent } = {},
) {
  ensureOAuth(authentication);
  const id = ensureId(input.id);
  const client = await getPgPool().connect();
  let publishedSlug;
  let publishedRow;
  try {
    await client.query('BEGIN');
    await lockMcpOAuthAuthorization(client, authentication);
    await lockMcpOAuthCapability(client, authentication, 'publish_blog');
    await lockMcpOAuthBlogDraftAuthorization(client, id, authentication);
    const existingResult = await client.query(
      `SELECT ${BLOG_POST_COLUMNS} FROM blog_posts WHERE id = $1 AND status = 'draft'`,
      [id],
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new McpAuthorizationError('Blog post not found or not publishable.');
    validatePublish(projectPost(existing));
    const updated = await client.query(
      `
        UPDATE blog_posts
        SET status = 'published',
            publish_date = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND status = 'draft'
          AND EXISTS (
            SELECT 1 FROM mcp_oauth_authorizations auth
            WHERE auth.subject = $2 AND auth.client_id = $3
              AND auth.revoked_at IS NULL AND auth.can_publish_blog = TRUE
          )
          AND (
            EXISTS (
              SELECT 1 FROM mcp_blog_post_owners owner
              WHERE owner.post_id = blog_posts.id AND owner.subject = $2
            )
            OR EXISTS (
              SELECT 1 FROM mcp_blog_post_draft_access access
              WHERE access.post_id = blog_posts.id AND access.subject = $2
                AND access.revoked_at IS NULL
            )
          )
        RETURNING ${BLOG_POST_COLUMNS}
      `,
      [id, authentication.subject, authentication.clientId],
    );
    if (!updated.rows[0]) throw new McpAuthorizationError('Blog post not found or not publishable.');
    publishedRow = updated.rows[0];
    publishedSlug = publishedRow.slug;
    await client.query('COMMIT');
    await clearCache();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    await revalidate('publish', publishedSlug);
  } catch (error) {
    console.error('[MCP] Blog post published but cache revalidation failed.', error?.name || 'unknown');
    throw new McpBlogToolError('Blog post was published, but public blog cache refresh failed.');
  }
  return projectPost(publishedRow);
}
