import generatedPostSummaries from '@/generated/posts.generated';

const REQUEST_TIMEOUT_MS = 10000;
const SITE_URL = 'https://www.aqprompts.com';
const DEFAULT_COVER_IMAGE = `${SITE_URL}/og-cover.webp`;
const DATA_BASE = '/data';
const POSTS_DETAIL_BASE = `${DATA_BASE}/posts`;

const fallbackPosts = [];

const EMPTY_PAGINATION = {
  page: 1,
  limit: 9,
  totalPosts: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
  startIndex: 0,
  endIndex: 0,
};

const EMPTY_FILTERS = { search: '', category: '', tag: '' };
const EMPTY_AVAILABLE_FILTERS = {
  categories: [],
  tags: [],
  allCategories: [],
  allTags: [],
};
const postsSnapshotCache = new Map();

function normalizePrimaryVideo(video) {
  if (!video || typeof video !== 'object') return null;

  const videoId = String(video?.videoId || '').trim();
  const watchPagePath = String(video?.watchPagePath || '').trim();

  if (!videoId || !watchPagePath) return null;

  return {
    videoId,
    title: String(video?.title || 'AQPrompts video').trim(),
    description: String(video?.description || '').trim(),
    thumbnailUrl: String(video?.thumbnailUrl || '').trim(),
    uploadDate: String(video?.uploadDate || '').trim(),
    duration: String(video?.duration || '').trim(),
    durationSeconds: String(video?.durationSeconds || '').trim(),
    durationIso: String(video?.durationIso || '').trim(),
    start:
      typeof video?.start === 'number' && Number.isFinite(video.start)
        ? video.start
        : Number.parseInt(String(video?.start || 0), 10) || 0,
    watchUrl: String(video?.watchUrl || '').trim(),
    embedUrl: String(video?.embedUrl || '').trim(),
    watchPagePath,
    watchPageUrl: String(video?.watchPageUrl || `${SITE_URL}${watchPagePath}`).trim(),
  };
}

function getGeneratedPosts() {
  return Array.isArray(generatedPostSummaries?.posts) ? generatedPostSummaries.posts : [];
}

function toReadingTime(value, fallback = 5) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  const parsed = Number.parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return [...new Set(tags.map((item) => String(item || '').trim()).filter(Boolean))];
  }

  if (typeof tags === 'string') {
    return [
      ...new Set(
        tags
          .split(/[,|/]/g)
          .map((item) => item.trim())
          .filter(Boolean)
      ),
    ];
  }

  return [];
}

function normalizeFaqs(faqs) {
  if (!Array.isArray(faqs)) return [];

  return faqs
    .map((item) => ({
      question: String(item?.question || '').trim(),
      answer: String(item?.answer || '').trim(),
    }))
    .filter((item) => item.question && item.answer);
}

function normalizeToc(toc) {
  if (!Array.isArray(toc)) return [];

  return toc
    .map((item) => ({
      id: String(item?.id || '').trim(),
      type: String(item?.type || '').trim(),
      level:
        typeof item?.level === 'number'
          ? item.level
          : item?.type === 'heading_1'
            ? 1
            : item?.type === 'heading_2'
              ? 2
              : 3,
      text: String(item?.text || '').trim(),
      slug: String(item?.slug || '').trim(),
    }))
    .filter((item) => item.id && item.text);
}

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];

  return blocks.map((block) => ({
    ...block,
    id: String(block?.id || ''),
    type: String(block?.type || 'unsupported'),
    plainText: String(block?.plainText || ''),
    html: String(block?.html || ''),
    hasChildren: Boolean(block?.hasChildren),
    richText: Array.isArray(block?.richText) ? block.richText : [],
    children: Array.isArray(block?.children) ? normalizeBlocks(block.children) : [],
  }));
}

function normalizeMeta(meta) {
  return {
    hasFaqs: Boolean(meta?.hasFaqs),
    hasToc: Boolean(meta?.hasToc),
    hasTags: Boolean(meta?.hasTags),
    hasVideo: Boolean(meta?.hasVideo),
    hasRelatedPosts: Boolean(meta?.hasRelatedPosts),
    blockCount:
      typeof meta?.blockCount === 'number' && Number.isFinite(meta.blockCount)
        ? meta.blockCount
        : 0,
  };
}

function inferBlockCount(post, toc = []) {
  const explicitCount =
    typeof post?.meta?.blockCount === 'number' && Number.isFinite(post.meta.blockCount)
      ? post.meta.blockCount
      : null;

  if (explicitCount !== null) {
    return explicitCount;
  }

  if (Array.isArray(toc) && toc.length > 0) {
    return toc.length;
  }

  return String(post?.contentText || '').trim() ? 1 : 0;
}

function normalizeRelatedPosts(relatedPosts) {
  if (!Array.isArray(relatedPosts)) return [];
  return relatedPosts.map(normalizePost).filter(isValidPost);
}

function normalizePost(post) {
  if (!post) return null;

  const title = String(post.title || post.name || '').trim();
  const slug = String(post.slug || '').trim();
  const excerpt = String(post.excerpt || post.description || post.summary || '').trim();
  const category = String(
    post.category || post.categoryName || post.platform || 'Social Media Tips'
  ).trim();
  const publishDate = String(post.publishDate || post.date || post.publishedAt || '').trim();
  const coverImage = String(
    post.coverImage ||
      post.featuredImage ||
      post.image ||
      post.thumbnail ||
      DEFAULT_COVER_IMAGE
  ).trim();
  const toc = normalizeToc(post.toc);
  const contentText = String(post.contentText || '');
  const contentHtml = String(post.content || post.contentHtml || '');

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
    readingTime: toReadingTime(post.readingTime),
    seoTitle: post.seoTitle || title,
    seoDescription: post.seoDescription || excerpt,
    canonicalUrl: post.canonicalUrl || `${SITE_URL}/blog/${slug}`,
    updatedAt: post.updatedAt || publishDate,
    tags: normalizeTags(post.tags),
    faqs: normalizeFaqs(post.faqs),
    primaryVideo: normalizePrimaryVideo(post.primaryVideo),
    toc,
    meta: normalizeMeta({
      ...(post.meta || {}),
      blockCount: inferBlockCount(post, toc),
    }),
    blocks: Array.isArray(post.blocks) ? post.blocks : [],
    normalizedBlocks: normalizeBlocks(post.normalizedBlocks),
    relatedPosts: normalizeRelatedPosts(post.relatedPosts),
    content: contentHtml,
    contentHtml,
    contentText,
  };
}

function isValidPost(post) {
  return Boolean(post?.title && post?.slug);
}

class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function getJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: options.fresh ? 'no-store' : 'force-cache',
    });

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const text = await response.text();
      throw new ApiError(
        `Content data did not return JSON. Got: ${text.slice(0, 160)}`,
        response.status
      );
    }

    const data = await response.json();

    if (!response.ok || !data?.success) {
      throw new ApiError(data?.message || 'Content request failed', response.status, data);
    }

    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('The request took too long. Please try again.', 504);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      error?.message || 'Something went wrong while loading content.',
      error?.status || 500
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function normalizePagination(pagination) {
  return {
    page:
      typeof pagination?.page === 'number' && Number.isFinite(pagination.page)
        ? pagination.page
        : EMPTY_PAGINATION.page,
    limit:
      typeof pagination?.limit === 'number' && Number.isFinite(pagination.limit)
        ? pagination.limit
        : EMPTY_PAGINATION.limit,
    totalPosts:
      typeof pagination?.totalPosts === 'number' && Number.isFinite(pagination.totalPosts)
        ? pagination.totalPosts
        : EMPTY_PAGINATION.totalPosts,
    totalPages:
      typeof pagination?.totalPages === 'number' && Number.isFinite(pagination.totalPages)
        ? pagination.totalPages
        : EMPTY_PAGINATION.totalPages,
    hasNextPage: Boolean(pagination?.hasNextPage),
    hasPrevPage: Boolean(pagination?.hasPrevPage),
    startIndex:
      typeof pagination?.startIndex === 'number' && Number.isFinite(pagination.startIndex)
        ? pagination.startIndex
        : EMPTY_PAGINATION.startIndex,
    endIndex:
      typeof pagination?.endIndex === 'number' && Number.isFinite(pagination.endIndex)
        ? pagination.endIndex
        : EMPTY_PAGINATION.endIndex,
  };
}

function normalizeFilters(filters) {
  return {
    search: String(filters?.search || ''),
    category: String(filters?.category || ''),
    tag: String(filters?.tag || ''),
  };
}

function normalizeAvailableFilters(availableFilters) {
  return {
    categories: Array.isArray(availableFilters?.categories)
      ? availableFilters.categories.filter(Boolean)
      : [],
    tags: Array.isArray(availableFilters?.tags) ? availableFilters.tags.filter(Boolean) : [],
    allCategories: Array.isArray(availableFilters?.allCategories)
      ? availableFilters.allCategories.filter(Boolean)
      : [],
    allTags: Array.isArray(availableFilters?.allTags)
      ? availableFilters.allTags.filter(Boolean)
      : [],
  };
}

function normalizePostsPayload(data) {
  const posts = Array.isArray(data?.posts)
    ? data.posts.map(normalizePost).filter(isValidPost)
    : [];

  return {
    success: Boolean(data?.success),
    posts,
    total:
      typeof data?.total === 'number' && Number.isFinite(data.total)
        ? data.total
        : posts.length,
    count:
      typeof data?.count === 'number' && Number.isFinite(data.count)
        ? data.count
        : posts.length,
    pagination: normalizePagination(data?.pagination),
    filters: normalizeFilters(data?.filters || EMPTY_FILTERS),
    availableFilters: normalizeAvailableFilters(
      data?.availableFilters || EMPTY_AVAILABLE_FILTERS
    ),
  };
}

function normalizePostDetailPayload(data) {
  const mergedPost = {
    ...(data?.post || {}),
    content:
      data?.post?.content ??
      data?.post?.contentHtml ??
      data?.content ??
      data?.contentHtml ??
      '',
    contentHtml:
      data?.post?.contentHtml ??
      data?.post?.content ??
      data?.contentHtml ??
      data?.content ??
      '',
    contentText: data?.post?.contentText ?? data?.contentText ?? '',
    faqs: Array.isArray(data?.post?.faqs) ? data.post.faqs : data?.faqs,
    toc: Array.isArray(data?.post?.toc) ? data.post.toc : data?.toc,
    primaryVideo: data?.post?.primaryVideo || data?.primaryVideo || null,
  };

  const post = normalizePost(mergedPost);

  if (!isValidPost(post)) {
    throw new ApiError('Post not found', 404, data);
  }

  return {
    success: Boolean(data?.success),
    post,
    blocks: Array.isArray(data?.blocks) ? data.blocks : [],
    normalizedBlocks: normalizeBlocks(data?.normalizedBlocks),
    relatedPosts: normalizeRelatedPosts(data?.relatedPosts),
    faqs: normalizeFaqs(data?.faqs || post?.faqs),
    toc: normalizeToc(data?.toc || post?.toc),
    meta: normalizeMeta(data?.meta || post?.meta),
    primaryVideo: normalizePrimaryVideo(data?.primaryVideo || post?.primaryVideo),
  };
}

function readInlinePageData() {
  if (typeof window !== 'undefined') {
    const cachedData = window.__GG_PAGE_DATA__;

    if (cachedData) {
      if (typeof cachedData === 'object') return cachedData;

      try {
        return JSON.parse(cachedData);
      } catch {
        return null;
      }
    }
  }

  if (typeof document === 'undefined') return null;

  const element = document.getElementById('gg-page-data');
  if (!element?.textContent) return null;

  try {
    return JSON.parse(element.textContent);
  } catch {
    return null;
  }
}

function sortPosts(posts = []) {
  return [...posts].sort((a, b) => {
    const dateA = new Date(a.publishDate || a.updatedAt || 0).getTime();
    const dateB = new Date(b.publishDate || b.updatedAt || 0).getTime();

    if (dateB !== dateA) return dateB - dateA;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

function filterPosts(posts = [], params = {}) {
  const normalizedPosts = sortPosts(posts.map(normalizePost).filter(isValidPost));

  const search = String(params.search || '').trim().toLowerCase();
  const category = String(params.category || '').trim().toLowerCase();
  const tag = String(params.tag || '').trim().toLowerCase();
  const page = Math.max(1, Number.parseInt(String(params.page || 1), 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(String(params.limit || 9), 10) || 9));

  const filtered = normalizedPosts.filter((post) => {
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

  const totalPosts = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalPosts / limit));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);

  const categories = [...new Set(normalizedPosts.map((post) => post.category).filter(Boolean))];
  const tags = [...new Set(normalizedPosts.flatMap((post) => post.tags || []))];

  return {
    success: true,
    posts: paginated,
    total: totalPosts,
    count: paginated.length,
    pagination: {
      page: currentPage,
      limit,
      totalPosts,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
      startIndex: totalPosts === 0 ? 0 : startIndex + 1,
      endIndex: Math.min(startIndex + limit, totalPosts),
    },
    filters: {
      search: String(params.search || ''),
      category: String(params.category || ''),
      tag: String(params.tag || ''),
    },
    availableFilters: {
      categories,
      tags,
      allCategories: categories,
      allTags: tags,
    },
  };
}

function createFallbackPostsPayload(params = {}) {
  const normalizedFallbackPosts = fallbackPosts.map(normalizePost).filter(isValidPost);
  return filterPosts(normalizedFallbackPosts, params);
}

/**
 * Fetches posts with optional filtering and pagination
 * @param {Object} params - Filter and pagination parameters
 * @param {string} [params.search=''] - Search query to filter posts
 * @param {string} [params.category=''] - Category to filter posts by
 * @param {string} [params.tag=''] - Tag to filter posts by
 * @param {number} [params.page=1] - Page number for pagination
 * @param {number} [params.limit=9] - Number of posts per page
 * @returns {Object} Normalized posts payload with filtered posts and metadata
 */
export function fetchPosts(params = {}) {
  return normalizePostsPayload(filterPosts(getGeneratedPosts(), params));
}

/**
 * Gets posts snapshot with fallback to demo posts if needed
 * @param {Object} params - Filter and pagination parameters
 * @param {string} [params.search=''] - Search query to filter posts
 * @param {string} [params.category=''] - Category to filter posts by
 * @param {string} [params.tag=''] - Tag to filter posts by
 * @param {number} [params.page=1] - Page number for pagination
 * @param {number} [params.limit=9] - Number of posts per page
 * @returns {Object} Posts payload with fallback data if original fails
 */
export function getPostsSnapshot(params = {}) {
  const cacheKey = JSON.stringify({
    search: params.search || '',
    category: params.category || '',
    tag: params.tag || '',
    page: params.page || 1,
    limit: params.limit || 9,
  });

  if (postsSnapshotCache.has(cacheKey)) {
    return postsSnapshotCache.get(cacheKey);
  }

  try {
    const data = fetchPosts(params);
    const payload = Array.isArray(data.posts) && data.posts.length > 0 ? data : createFallbackPostsPayload(params);
    postsSnapshotCache.set(cacheKey, payload);
    return payload;
  } catch {
    console.warn('Content data failed. Using fallback demo posts instead.');
    const payload = createFallbackPostsPayload(params);
    postsSnapshotCache.set(cacheKey, payload);
    return payload;
  }
}

export function getAllPostsSnapshot() {
  return getPostsSnapshot({ limit: 1000 });
}

export function getAllPostSlugs() {
  return getAllPostsSnapshot().posts.map((post) => post.slug).filter(Boolean);
}

function findPostInCollection(slug, postsSource = []) {
  const allPosts = Array.isArray(postsSource)
    ? postsSource.map(normalizePost).filter(isValidPost)
    : [];

  const post = allPosts.find((item) => item.slug === slug);

  if (!post) {
    throw new ApiError('Post not found', 404);
  }

  const relatedPosts =
    Array.isArray(post?.relatedPosts) && post.relatedPosts.length > 0
      ? post.relatedPosts
      : sortPosts(
          allPosts.filter(
            (item) =>
              item.slug !== post.slug &&
              (item.category === post.category ||
                (Array.isArray(item.tags) &&
                  Array.isArray(post.tags) &&
                  item.tags.some((tag) => post.tags.includes(tag))))
          )
        ).slice(0, 3);

  return {
    success: true,
    post,
    blocks: Array.isArray(post?.blocks) ? post.blocks : [],
    normalizedBlocks: normalizeBlocks(post?.normalizedBlocks),
    relatedPosts,
    faqs: normalizeFaqs(post?.faqs),
    toc: normalizeToc(post?.toc),
    meta: normalizeMeta(
      post?.meta || {
        hasFaqs: Array.isArray(post?.faqs) && post.faqs.length > 0,
        hasToc: Array.isArray(post?.toc) && post.toc.length > 0,
        hasTags: Array.isArray(post?.tags) && post.tags.length > 0,
        hasRelatedPosts: relatedPosts.length > 0,
        blockCount: inferBlockCount(post, post?.toc),
      }
    ),
    primaryVideo: normalizePrimaryVideo(post?.primaryVideo),
  };
}

/**
 * Fetches posts with fallback handling
 * @param {Object} params - Filter and pagination parameters
 * @param {string} [params.search=''] - Search query to filter posts
 * @param {string} [params.category=''] - Category to filter posts by
 * @param {string} [params.tag=''] - Tag to filter posts by
 * @param {number} [params.page=1] - Page number for pagination
 * @param {number} [params.limit=9] - Number of posts per page
 * @returns {Promise<Object>} Posts payload with fallback data
 */
export async function fetchPostsWithFallback(params = {}) {
  return getPostsSnapshot(params);
}

/**
 * Gets inline post payload from server-rendered data
 * @param {string} slug - The post slug to look for
 * @returns {Object|null} Normalized post detail payload or null if not found
 */
export function getInlinePostPayload(slug) {
  const safeSlug = String(slug || '').trim();
  if (!safeSlug) return null;

  const inlineData = readInlinePageData();
  const inlineSlug = String(inlineData?.post?.slug || '').trim();

  if (!inlineData || inlineSlug !== safeSlug) {
    return null;
  }

  try {
    return normalizePostDetailPayload(inlineData);
  } catch {
    return null;
  }
}

async function fetchPostDetailFromBrowser(slug, options = {}) {
  const cacheBust = options.fresh ? `?ts=${Date.now()}` : '';
  const data = await getJson(
    `${POSTS_DETAIL_BASE}/${encodeURIComponent(slug)}.json${cacheBust}`,
    { fresh: options.fresh }
  );

  return normalizePostDetailPayload(data);
}

/**
 * Fetches a single post by slug with fallback options
 * @param {string} slug - The post slug to fetch
 * @param {Object} [options={}] - Fetch options
 * @param {boolean} [options.fresh=false] - Whether to bypass cache
 * @returns {Promise<Object>} Post detail payload
 * @throws {ApiError} If post is not found
 */
export async function fetchPostBySlug(slug, options = {}) {
  const safeSlug = String(slug || '').trim();

  if (!safeSlug) {
    throw new ApiError('Post not found', 404);
  }

  if (typeof window !== 'undefined') {
    if (!options.fresh) {
      const inlinePayload = getInlinePostPayload(safeSlug);
      if (inlinePayload) return inlinePayload;
    }

    return fetchPostDetailFromBrowser(safeSlug, options);
  }

  const { default: generatedContent } = await import('@/generated/content.generated');
  return findPostInCollection(
    safeSlug,
    Array.isArray(generatedContent?.posts) ? generatedContent.posts : []
  );
}

/**
 * Fetches a post by slug with fallback to demo posts
 * @param {string} slug - The post slug to fetch
 * @param {Object} [options={}] - Fetch options
 * @param {boolean} [options.fresh=false] - Whether to bypass cache
 * @returns {Promise<Object>} Post detail payload with fallback
 */
export async function fetchPostBySlugWithFallback(slug, options = {}) {
  try {
    return await fetchPostBySlug(slug, options);
  } catch (error) {
    const fallbackPost = fallbackPosts.map(normalizePost).find((post) => post.slug === slug);

    if (!fallbackPost) throw error;

    return {
      success: true,
      post: fallbackPost,
      blocks: Array.isArray(fallbackPost?.blocks) ? fallbackPost.blocks : [],
      normalizedBlocks: normalizeBlocks(fallbackPost?.normalizedBlocks),
      relatedPosts: fallbackPosts
        .map(normalizePost)
        .filter((post) => post.slug !== slug)
        .slice(0, 3),
      faqs: normalizeFaqs(fallbackPost?.faqs),
      toc: normalizeToc(fallbackPost?.toc),
      meta: normalizeMeta(
        fallbackPost?.meta || {
          hasFaqs: false,
          hasToc: false,
          hasTags: Array.isArray(fallbackPost.tags) && fallbackPost.tags.length > 0,
          hasRelatedPosts: true,
          blockCount: 0,
        }
      ),
      primaryVideo: normalizePrimaryVideo(fallbackPost?.primaryVideo),
    };
  }
}

export async function getPostSnapshotBySlug(slug, options = {}) {
  return fetchPostBySlugWithFallback(slug, options);
}

/**
 * Refreshes a post by fetching fresh data from server
 * @param {string} slug - The post slug to refresh
 * @returns {Promise<Object>} Fresh post detail payload
 */
export async function refreshPostBySlug(slug) {
  return fetchPostBySlug(slug, { fresh: true });
}

export { ApiError };


