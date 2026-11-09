export const SITE_NAME = 'AQPrompts';
export const SITE_URL = 'https://www.aqprompts.com';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-cover.webp`;
export const DEFAULT_DESCRIPTION =
  'AQPrompts publishes practical, beginner-friendly social media growth strategies, creator systems, and content marketing guides.';
export const DEFAULT_TWITTER_HANDLE = '@AQPrompts';
export const META_DESCRIPTION_MAX_LENGTH = 158;
export const DEFAULT_CONTENT_DATE = '2026-04-30';

function normalizeText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim();
}

function stripDescriptionNoise(value) {
  return normalizeText(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`~>|[\](){}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Produces a clean search-snippet description without cutting words awkwardly.
 * @param {string} value - Description candidate
 * @param {string} [fallback] - Fallback description
 * @param {number} [maxLength] - Maximum character length
 * @returns {string} SEO-safe meta description
 */
export function clampMetaDescription(value, fallback = DEFAULT_DESCRIPTION, maxLength = META_DESCRIPTION_MAX_LENGTH) {
  const max = Number.isFinite(maxLength) && maxLength > 0 ? maxLength : META_DESCRIPTION_MAX_LENGTH;
  const text = stripDescriptionNoise(value) || stripDescriptionNoise(fallback);

  if (text.length <= max) return text;

  const hardCut = text.slice(0, max + 1);
  const lastSpace = hardCut.lastIndexOf(' ');
  const cutAt = lastSpace >= 120 ? lastSpace : max;

  const finishSnippet = (raw) =>
    raw
      .replace(/[-\s,;:.]+$/g, '')
      .replace(/\s+(a|an|and|as|at|for|from|in|of|on|or|the|to|with)$/i, '')
      .replace(/[-\s,;:.]+$/g, '')
      .trim();

  const trimmed = finishSnippet(text.slice(0, cutAt));

  if (!trimmed) return text.slice(0, max).trim();
  if (/[.!?]$/.test(trimmed)) return trimmed;
  if (trimmed.length < max) return `${trimmed}.`;

  const shorter = trimmed.slice(0, max - 1);
  const finalSpace = shorter.lastIndexOf(' ');
  const sentence = finishSnippet(finalSpace >= 120 ? shorter.slice(0, finalSpace) : shorter);

  return sentence ? `${sentence}.` : trimmed;
}

/**
 * Converts a path to an absolute URL
 * @param {string} [path='/'] - The path to convert
 * @returns {string} Absolute URL
 */
export function absoluteUrl(path = '/') {
  if (!path) return SITE_URL;

  const value = String(path).trim();
  if (!value) return SITE_URL;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const hostname = parsed.hostname.toLowerCase();

      if (hostname === 'aqprompts.com' || hostname === 'www.aqprompts.com') {
        return `${SITE_URL}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      return value;
    }

    return value;
  }

  return `${SITE_URL}${value.startsWith('/') ? value : `/${value}`}`;
}

/**
 * Normalizes and converts an image URL to absolute
 * @param {string} image - The image URL or path
 * @returns {string} Absolute image URL
 */
export function normalizeImageUrl(image) {
  const value = normalizeText(image, DEFAULT_OG_IMAGE);
  return absoluteUrl(value);
}

/**
 * Gets the canonical URL for a path
 * @param {string} [path='/'] - The path to get canonical URL for
 * @returns {string} Canonical URL
 */
export function getCanonicalUrl(path = '/') {
  return absoluteUrl(path);
}

/**
 * Gets the URL for a blog post
 * @param {Object} post - The post object
 * @param {string} [post.canonicalUrl] - Custom canonical URL
 * @param {string} [post.slug] - Post slug
 * @returns {string} Post URL
 */
export function getPostUrl(post) {
  if (post?.canonicalUrl) return absoluteUrl(post.canonicalUrl);
  if (post?.slug) return absoluteUrl(`/blog/${post.slug}`);
  return absoluteUrl('/blog');
}

/**
 * Gets the SEO title for a blog post
 * @param {Object} post - The post object
 * @param {string} [post.seoTitle] - Custom SEO title
 * @param {string} [post.title] - Post title
 * @returns {string} SEO title
 */
export function getPostTitle(post) {
  return normalizeText(post?.seoTitle, post?.title || SITE_NAME);
}

/**
 * Gets the SEO description for a blog post
 * @param {Object} post - The post object
 * @param {string} [post.seoDescription] - Custom SEO description
 * @param {string} [post.excerpt] - Post excerpt
 * @returns {string} SEO description
 */
export function getPostDescription(post) {
  return clampMetaDescription(post?.seoDescription, post?.excerpt || DEFAULT_DESCRIPTION);
}

/**
 * Builds metadata for a category page
 * @param {string} categoryName - The category name
 * @param {string} categorySlug - The category slug
 * @returns {Object} Category metadata with title, description, and URL
 */
export function buildCategoryMeta(categoryName, categorySlug) {
  const safeCategoryName = normalizeText(categoryName, 'Category');
  const safeCategorySlug = normalizeText(categorySlug, 'category');

  const title = `${safeCategoryName} Articles | ${SITE_NAME}`;
  const description = `Explore ${safeCategoryName} articles, frameworks, and practical growth strategies from ${SITE_NAME}.`;
  const url = absoluteUrl(`/category/${safeCategorySlug}`);

  return { title, description: clampMetaDescription(description), url };
}

/**
 * Builds JSON-LD schema for the website
 * @returns {Object} Website schema.org markup
 */
export function buildWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: clampMetaDescription(DEFAULT_DESCRIPTION),
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/tools/ai-image-prompts?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/aqprompts-logo.webp'),
        width: 256,
        height: 256,
      },
    },
  };
}

/**
 * Builds JSON-LD schema for breadcrumbs
 * @param {Array<Object>} items - Breadcrumb items with name and item properties
 * @param {string} items[].name - The breadcrumb name
 * @param {string} [items[].item='/'] - The breadcrumb URL
 * @returns {Object} BreadcrumbList schema.org markup
 */
export function buildBreadcrumbSchema(items = []) {
  const validItems = items
    .map((item, index) => ({
      name: normalizeText(item?.name),
      item: absoluteUrl(item?.item || '/'),
      position: index + 1,
    }))
    .filter((item) => item.name && item.item);

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: validItems.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      item: item.item,
    })),
  };
}

/**
 * Builds JSON-LD schema for FAQ page
 * @param {Array<Object>} faqs - FAQ items
 * @param {string} faqs[].question - The FAQ question
 * @param {string} faqs[].answer - The FAQ answer
 * @returns {Object|null} FAQPage schema.org markup or null if no valid FAQs
 */
export function buildFaqSchema(faqs = []) {
  const validFaqs = (Array.isArray(faqs) ? faqs : [])
    .map((item) => ({
      question: normalizeText(item?.question),
      answer: normalizeText(item?.answer),
    }))
    .filter((item) => item.question && item.answer);

  if (validFaqs.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: validFaqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/**
 * Builds JSON-LD schema for a blog post
 * @param {Object} post - The blog post object
 * @param {string} [post.title] - Post title
 * @param {string} [post.seoTitle] - Custom SEO title
 * @param {string} [post.excerpt] - Post excerpt
 * @param {string} [post.seoDescription] - Custom SEO description
 * @param {string} [post.coverImage] - Post cover image
 * @param {string} [post.featuredImage] - Post featured image
 * @param {string} [post.author] - Post author
 * @param {string} [post.category] - Post category
 * @param {Array<string>} [post.tags] - Post tags
 * @param {string} [post.publishDate] - Post publish date
 * @param {string} [post.updatedAt] - Post updated date
 * @param {number} [post.readingTime] - Reading time in minutes
 * @returns {Object} BlogPosting schema.org markup
 */
export function buildArticleSchema(post) {
  const title = normalizeText(post?.title, getPostTitle(post));
  const description = getPostDescription(post);
  const url = getPostUrl(post);
  const image = normalizeImageUrl(post?.coverImage || post?.featuredImage || DEFAULT_OG_IMAGE);
  const category = normalizeText(post?.category);
  const tags = Array.isArray(post?.tags)
    ? post.tags.map((tag) => normalizeText(tag)).filter(Boolean)
    : [];
  const publishDate = normalizeText(post?.publishDate);
  const modifiedDate = normalizeText(post?.updatedAt, publishDate);
  const readingTimeValue =
    typeof post?.readingTime === 'number' && Number.isFinite(post.readingTime)
      ? post.readingTime
      : Number.parseInt(String(post?.readingTime || '').replace(/[^\d]/g, ''), 10);

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    name: title,
    description,
    image: [image],
    url,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    author: {
      '@type': 'Person',
      name: normalizeText(post?.authorMeta?.name || post?.author || 'Abdul Qudoos'),
      url: absoluteUrl(post?.authorMeta?.authorUrl || '/author/abdul-qudoos'),
      ...(post?.authorMeta?.avatar
        ? { image: normalizeImageUrl(post.authorMeta.avatar) }
        : {}),
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/aqprompts-logo.webp'),
      },
    },
    ...(publishDate ? { datePublished: publishDate } : {}),
    ...(modifiedDate ? { dateModified: modifiedDate } : {}),
    ...(category ? { articleSection: category } : {}),
    ...(tags.length > 0 ? { keywords: tags.join(', ') } : {}),
    ...(Number.isFinite(readingTimeValue) && readingTimeValue > 0
      ? { timeRequired: `PT${readingTimeValue}M` }
      : {}),
  };
}

/**
 * Builds JSON-LD schema for AI prompt (CreativeWork)
 * @param {Object} prompt - Prompt object
 * @returns {Object} CreativeWork schema.org markup
 */
export function buildCreativeWorkSchema(prompt = {}) {
  const imageUrl = normalizeImageUrl(prompt.image);

  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: normalizeText(prompt.title),
    description: clampMetaDescription(prompt.seoDescription, prompt.intro || prompt.prompt || DEFAULT_DESCRIPTION),
    image: {
      '@type': 'ImageObject',
      url: imageUrl,
      contentUrl: imageUrl,
      caption: normalizeText(prompt.title),
      representativeOfPage: true,
    },
    url: absoluteUrl(`/tools/ai-image-prompts/p/${prompt.slug}`),
    creator: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
    isPartOf: {
      '@type': 'CollectionPage',
      name: 'Instagram AI Image Prompt Library',
      url: absoluteUrl('/tools/ai-image-prompts'),
    },
    keywords: Array.isArray(prompt.tags) ? prompt.tags.join(', ') : '',
    dateModified: prompt.updatedAt || prompt.modifiedAt || DEFAULT_CONTENT_DATE,
    ...(prompt.reviewedAt ? { dateReviewed: prompt.reviewedAt } : {}),
    ...(prompt.recommendedAspectRatio ? { representativeOfPage: prompt.recommendedAspectRatio } : {}),
  };
}

/**
 * Builds JSON-LD schema for blog listing page
 * @param {Array<Object>} posts - Array of blog post objects
 * @returns {Object} CollectionPage schema.org markup
 */
export function buildBlogListingSchema(posts = []) {
  const validPosts = (Array.isArray(posts) ? posts : [])
    .map((post) => ({
      title: getPostTitle(post),
      url: getPostUrl(post),
      image: normalizeImageUrl(post?.coverImage || post?.featuredImage || DEFAULT_OG_IMAGE),
      description: getPostDescription(post),
      publishDate: normalizeText(post?.publishDate),
    }))
    .filter((post) => post.title && post.url);

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Blog | ${SITE_NAME}`,
    url: absoluteUrl('/blog'),
    description: clampMetaDescription(
      'Explore practical growth guides for Instagram, YouTube, TikTok, Facebook, and creator content systems.'
    ),
    hasPart: validPosts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: post.url,
      image: [post.image],
      description: post.description,
      ...(post.publishDate ? { datePublished: post.publishDate } : {}),
    })),
  };
}

