/**
 * Blog API — reads blog posts from Neon PostgreSQL.
 *
 * This module replaces the generated-file-based blog reads in api.js.
 * It provides the same interface that the blog frontend expects:
 * - getBlogPostSnapshotBySlug(slug)
 * - getAllBlogPostSlugs()
 *
 * Source of truth: Neon blog_posts table.
 */

import {
  getPublishedBlogPostsSlim,
  getPublishedBlogPostsForRelated,
  getCachedBlogPostBySlug,
  getPublishedBlogPostBySlug,
  listBlogPostsForAdmin,
} from './blog-db.js';

const SITE_URL = 'https://www.aqprompts.com';

// ── Normalization (mirrors api.js normalizePost for blog) ────────────────

function normalizePost(post) {
  if (!post) return null;

  const title = String(post.title || '').trim();
  const slug = String(post.slug || '').trim();
  const excerpt = String(post.excerpt || '').trim();
  const category = String(post.category || 'Creator Growth').trim();
  const publishDate = String(post.publishDate || post.date || '').trim();
  const coverImage = String(post.featuredImage || '').trim() || '/og-cover.webp';
  const contentHtml = String(post.contentHtml || post.content || '');
  const contentText = String(post.contentText || '');
  const toc = Array.isArray(post.toc) ? post.toc : [];
  const faqs = Array.isArray(post.faqs) ? post.faqs : [];
  const tags = Array.isArray(post.tags) ? post.tags : [];

  return {
    ...post,
    id: String(post.id || ''),
    title,
    slug,
    excerpt,
    category,
    publishDate,
    date: publishDate,
    coverImage,
    featuredImage: coverImage,
    author: post.author || 'Abdul Qudoos',
    authorMeta: post.authorMeta || {
      slug: 'abdul-qudoos',
      name: 'Abdul Qudoos',
      role: 'Founder and Editor, AQPrompts',
      avatar: '/images/founder-aqprompts.webp',
      bio: 'Abdul Qudoos creates and reviews AQPrompts guides and prompt-library content for creators using AI image tools.',
      authorUrl: '/author/abdul-qudoos',
    },
    readingTime: Number(post.readingTime) || 5,
    seoTitle: post.seoTitle || title,
    seoDescription: post.seoDescription || excerpt,
    canonicalUrl: post.canonicalUrl || `${SITE_URL}/blog/${slug}`,
    updatedAt: post.updatedAt || publishDate,
    tags,
    faqs,
    toc,
    content: String(post.content || ''),
    contentHtml,
    contentText,
    meta: post.meta && typeof post.meta === 'object' ? post.meta : {
      hasFaqs: faqs.length > 0,
      hasToc: toc.length > 0,
      hasTags: tags.length > 0,
      hasVideo: false,
      hasRelatedPosts: false,
      blockCount: toc.length,
    },
    blocks: [],
    normalizedBlocks: [],
    primaryVideo: null,
    featuredPost: Boolean(post.featured),
    status: post.status || 'published',
    contentType: 'blog',
  };
}

function isValidPost(post) {
  return Boolean(post?.title && post?.slug);
}

function sortPosts(posts = []) {
  return [...posts].sort((a, b) => {
    const dateA = new Date(a.publishDate || a.updatedAt || 0).getTime();
    const dateB = new Date(b.publishDate || b.updatedAt || 0).getTime();
    if (dateB !== dateA) return dateB - dateA;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

function findRelatedPosts(post, allPosts, limit = 3) {
  if (!post) return [];

  return sortPosts(
    allPosts.filter(
      (item) =>
        item.slug !== post.slug &&
        item.status === 'published' &&
        (item.category === post.category ||
          (Array.isArray(item.tags) &&
            Array.isArray(post.tags) &&
            item.tags.some((tag) => post.tags.includes(tag)))),
    ),
  ).slice(0, limit);
}

// ── Public API ──────────────────────────────────────────────────────────

export async function getAdminBlogPostsSnapshot(params = {}) {
  const result = await listBlogPostsForAdmin(params);
  const posts = result.rows.map(normalizePost).filter(isValidPost);
  return {
    success: true,
    posts,
    total: result.total,
    count: posts.length,
    page: result.page,
    pageSize: result.pageSize,
    status: result.status,
    statusCounts: result.statusCounts,
    search: result.search,
    category: result.category,
    categories: result.categories,
    sort: result.sort,
  };
}

/**
 * Published-posts snapshot — excludes heavy content columns.
 * Use for blog listing pages, homepage, RSS feeds.
 */
export async function getPublishedBlogPostsSnapshotSlim() {
  const posts = (await getPublishedBlogPostsSlim()).map(normalizePost).filter(isValidPost);
  return {
    success: true,
    posts,
    total: posts.length,
    count: posts.length,
  };
}

/**
 * Get a single blog post by slug with related posts.
 * Returns a detail payload matching the format expected by SinglePostPage.
 */
export async function getBlogPostSnapshotBySlug(slug) {
  const post = await getCachedBlogPostBySlug(slug);
  if (!post) {
    throw new Error('Post not found');
  }

  const normalizedPost = normalizePost(post);
  if (!normalizedPost) {
    throw new Error('Post not found');
  }

  // Related-post lookup needs only the fields used for post matching and display.
  // This avoids the full published-post rowset while preserving the exact same
  // selection, ordering, and limit logic used by the existing fallback behavior.
  const relatedCandidates = await getPublishedBlogPostsForRelated(slug, {
    category: normalizedPost.category,
    tags: normalizedPost.tags,
  });
  const rawRelatedPosts = findRelatedPosts(normalizedPost, relatedCandidates, 3);
  const relatedPosts = rawRelatedPosts.map((post) => ({
    ...normalizePost(post),
    contentHtml: '',
    contentText: '',
    content: '',
  }));

  // Compute TOC (filter out h1 and FAQ headings)
  const publicToc = normalizedPost.toc.filter((item) => {
    const text = String(item?.text || '').trim();
    const level = Number(item?.level || 0);
    if (!text || level !== 2) return false;
    if (text.toLowerCase() === normalizedPost.title.toLowerCase()) return false;
    if (/^(faq|faqs|frequently asked questions)$/i.test(text)) return false;
    return true;
  });

  return {
    success: true,
    post: {
      ...normalizedPost,
      toc: publicToc,
    },
    blocks: [],
    normalizedBlocks: [],
    relatedPosts,
    faqs: normalizedPost.faqs,
    toc: publicToc,
    meta: {
      ...normalizedPost.meta,
      hasRelatedPosts: relatedPosts.length > 0,
      blockCount: publicToc.length,
    },
    primaryVideo: null,
  };
}

/**
 * Get all published blog post slugs (for generateStaticParams).
 */
export async function getAllBlogPostSlugs() {
  // Slugs-only concern — slim query avoids pulling content/content_html/content_text
  const posts = await getPublishedBlogPostsSlim();
  return posts.filter((post) => post?.slug).map((post) => ({ slug: post.slug }));
}

/**
 * Filter and paginate blog posts (for blog listing page).
 */
export function filterBlogPosts(posts = [], params = {}) {
  const search = String(params.search || '').trim().toLowerCase();
  const category = String(params.category || '').trim().toLowerCase();
  const tag = String(params.tag || '').trim().toLowerCase();

  const filtered = posts.filter((post) => {
    const matchesSearch =
      !search ||
      [post.title, post.category, post.excerpt, ...(post.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search);

    const matchesCategory =
      !category || String(post.category || '').toLowerCase() === category;

    const matchesTag =
      !tag || (post.tags || []).some((item) => String(item).toLowerCase() === tag);

    return matchesSearch && matchesCategory && matchesTag;
  });

  return filtered;
}
