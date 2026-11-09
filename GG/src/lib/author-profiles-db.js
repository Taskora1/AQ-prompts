import { getPgPool } from './db.js';

const MAX_NAME = 160;
const MAX_ROLE = 200;
const MAX_BIO = 4_000;
const MAX_SOCIAL_LINKS = 12;

function clean(value) {
  return String(value ?? '').trim();
}

function validWebUrl(value, { allowRelative = false } = {}) {
  if (allowRelative && /^\/(?!\/)/.test(value)) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function mapAuthor(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    roleTitle: row.role_title || '',
    bio: row.bio || '',
    avatarUrl: row.avatar_url || '',
    socialLinks: Array.isArray(row.social_links) ? row.social_links : [],
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    url: `/author/${row.slug}`,
  };
}

export function validateAuthorProfileInput(input) {
  const name = clean(input?.name);
  const slug = clean(input?.slug).toLowerCase();
  const roleTitle = clean(input?.roleTitle);
  const bio = clean(input?.bio);
  const avatarUrl = clean(input?.avatarUrl);
  const socialLinks = Array.isArray(input?.socialLinks)
    ? input.socialLinks.map((link) => ({
      name: clean(link?.name),
      href: clean(link?.href),
    })).filter((link) => link.name || link.href)
    : [];
  const errors = {};

  if (input && Object.hasOwn(input, 'socialLinks') && !Array.isArray(input.socialLinks)) {
    errors.socialLinks = 'Social links must be provided as a list.';
  }
  if (!name || name.length > MAX_NAME) errors.name = `Name is required and must be ${MAX_NAME} characters or fewer.`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) {
    errors.slug = 'Use lowercase letters, numbers, and hyphens for the slug.';
  }
  if (roleTitle.length > MAX_ROLE) errors.roleTitle = `Role must be ${MAX_ROLE} characters or fewer.`;
  if (!bio || bio.length > MAX_BIO) errors.bio = `Bio is required and must be ${MAX_BIO} characters or fewer.`;
  if (avatarUrl && !validWebUrl(avatarUrl, { allowRelative: true })) {
    errors.avatarUrl = 'Avatar must be a site-relative path or an HTTPS URL.';
  }
  if (socialLinks.length > MAX_SOCIAL_LINKS) errors.socialLinks = `Add no more than ${MAX_SOCIAL_LINKS} social links.`;
  if (socialLinks.some((link) => !link.name || !validWebUrl(link.href))) {
    errors.socialLinks = 'Each social link needs a name and a valid HTTPS URL.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { name, slug, roleTitle, bio, avatarUrl, socialLinks },
  };
}

export async function listAuthorProfiles() {
  const result = await getPgPool().query(`
    SELECT id, slug, name, role_title, bio, avatar_url, social_links,
      created_at::text AS created_at, updated_at::text AS updated_at
    FROM author_profiles
    ORDER BY name
  `);
  return result.rows.map(mapAuthor);
}

export async function listAuthorProfileOptions() {
  const result = await getPgPool().query(`
    SELECT id, slug, name
    FROM author_profiles
    ORDER BY name
  `);
  return result.rows.map((row) => ({
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
  }));
}

export async function listAuthorSitemapRows() {
  const result = await getPgPool().query(`
    SELECT slug, updated_at::text AS "updatedAt"
    FROM author_profiles
    ORDER BY name
  `);
  return result.rows.map((row) => ({
    slug: row.slug,
    url: `/author/${row.slug}`,
    updatedAt: row.updatedAt || '',
  }));
}

export async function getPublishedBlogPostsByAuthor(author) {
  const result = await getPgPool().query(`
    SELECT
      slug,
      title,
      excerpt,
      featured_image,
      featured_image_alt,
      og_image,
      og_image_alt,
      category,
      publish_date,
      updated_at
    FROM blog_posts
    WHERE status = 'published'
      AND (
        author_meta->>'slug' = $1
        OR (author_meta->>'slug' IS NULL AND LOWER(author) = LOWER($2))
      )
    ORDER BY publish_date DESC NULLS LAST, updated_at DESC
  `, [author.slug, author.name]);
  return result.rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || '',
    featuredImage: row.featured_image || '',
    coverImage: row.og_image || row.featured_image || '',
    coverImageAlt: row.og_image_alt || row.featured_image_alt || '',
    category: row.category || 'Creator Growth',
    publishDate: String(row.publish_date || '').slice(0, 10),
    updatedAt: row.updated_at || '',
  }));
}

export async function getAuthorProfileBySlug(slug) {
  const result = await getPgPool().query(`
    SELECT id, slug, name, role_title, bio, avatar_url, social_links,
      created_at::text AS created_at, updated_at::text AS updated_at
    FROM author_profiles
    WHERE slug = $1
    LIMIT 1
  `, [slug]);
  return mapAuthor(result.rows[0]);
}

export async function createAuthorProfile(data) {
  const result = await getPgPool().query(`
    INSERT INTO author_profiles (slug, name, role_title, bio, avatar_url, social_links)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING id, slug, name, role_title, bio, avatar_url, social_links,
      created_at::text AS created_at, updated_at::text AS updated_at
  `, [
    data.slug,
    data.name,
    data.roleTitle,
    data.bio,
    data.avatarUrl,
    JSON.stringify(data.socialLinks),
  ]);
  return mapAuthor(result.rows[0]);
}

export async function updateAuthorProfile(slug, data) {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE author_profiles
      SET slug = $2, name = $3, role_title = $4, bio = $5, avatar_url = $6,
        social_links = $7::jsonb, updated_at = NOW()
      WHERE slug = $1
      RETURNING id, slug, name, role_title, bio, avatar_url, social_links,
        created_at::text AS created_at, updated_at::text AS updated_at
    `, [
      slug,
      data.slug,
      data.name,
      data.roleTitle,
      data.bio,
      data.avatarUrl,
      JSON.stringify(data.socialLinks),
    ]);
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(`
      UPDATE blog_posts
      SET author = $2, author_meta = COALESCE(author_meta, '{}'::jsonb) || $3::jsonb
      WHERE author_meta->>'slug' = $1
    `, [slug, data.name, JSON.stringify(toAuthorMeta(mapAuthor(result.rows[0])))]);
    await client.query('COMMIT');
    return mapAuthor(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function toAuthorMeta(author) {
  return {
    slug: author.slug,
    name: author.name,
    role: author.roleTitle,
    bio: author.bio,
    avatar: author.avatarUrl,
    authorUrl: author.url,
  };
}
