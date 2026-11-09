import { fetchPostBySlug, getAllPostsSnapshot, getPostsSnapshot } from '@/lib/api';
import { getCachedBlogPostBySlug, getPublishedBlogPostsSlim } from '@/lib/blog-db';
import {
  getPromptCategory,
  getPromptCategoryUrl,
  isIndexablePrompt,
  PROMPT_BASE_PATH,
} from '@/lib/prompt-constants';
import {
  getAllPrompts as getAllDatabasePrompts,
  getPromptBySlug as getDatabasePromptBySlug,
} from '@/lib/prompts-db';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TWITTER_HANDLE,
  SITE_NAME,
  absoluteUrl,
  buildArticleSchema,
  buildBlogListingSchema,
  buildBreadcrumbSchema,
  buildCreativeWorkSchema,
  buildFaqSchema,
  buildWebsiteSchema,
  clampMetaDescription,
  getPostDescription,
  getPostTitle,
  normalizeImageUrl,
} from '@/lib/seo';

const DEFAULT_AUTHOR = 'Abdul Qudoos';

export const staticPageMetadata = {
  home: {
    path: '/',
    title: 'ChatGPT Photo Prompts & AI Portrait Prompts for Creators | AQPrompts',
    description:
      `Browse and copy free AI image prompts for portraits, social media, photo editing, and creator workflows. No account or payment required.`,
    keywords: [
      'free AI image prompts',
      'luxury AI portrait prompts',
      'editorial fashion AI prompts',
      'Instagram creator prompts 2026',
      'free Midjourney prompts',
    ],
  },
  about: {
    path: '/about',
    title: 'About AQPrompts | Free AI Portrait Prompts for Instagram Creators 2026',
    description:
      'AQPrompts provides free photorealistic AI portrait prompts for Instagram creators. Copy prompts for Midjourney, Leonardo AI, ChatGPT, and Gemini.',
    keywords: ['about AQPrompts', 'free AI portrait prompts', 'Instagram creators'],
  },
  categories: {
    path: '/categories',
    title: 'AI Prompt Categories | AQPrompts',
    description:
      'Browse AQPrompts categories for male portraits, adult women, couples, cinematic, business, celebrations, lifestyle, and photo editing prompts.',
    keywords: ['AI prompt categories', 'AI image prompt categories', 'AQPrompts categories'],
  },
  contact: {
    path: '/contact',
    title: 'Contact AQPrompts | AI Image Prompts',
    description:
      'Request a new AI image prompt, report an issue, submit a privacy request, or send AQPrompts editorial feedback.',
    keywords: ['contact AQPrompts', 'AI image prompts support', 'prompt request'],
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy Policy | AQPrompts',
    description:
      'AQPrompts privacy policy. Learn what data we collect, how analytics work, and how to contact us about privacy requests.',
    keywords: ['privacy policy', 'data protection', 'AQPrompts privacy'],
  },
  cookiePolicy: {
    path: '/cookie-policy',
    title: 'Cookie Policy | AQPrompts',
    description:
      'Learn how AQPrompts uses necessary storage, optional analytics, browser preferences, and consent controls.',
    keywords: ['cookie policy', 'cookie settings', 'AQPrompts cookies'],
  },
  terms: {
    path: '/terms',
    title: 'Terms and Conditions | AQPrompts',
    description:
      'AQPrompts terms and conditions for using our free AI image prompt library, blog articles, and creator resources.',
    keywords: ['terms and conditions', 'AQPrompts terms', 'AI prompts terms'],
  },
  disclaimer: {
    path: '/disclaimer',
    title: 'Disclaimer | AQPrompts',
    description:
      'Read the AQPrompts disclaimer for AI prompt results, advertising, copyright, external links, and third-party AI tools.',
    keywords: ['AQPrompts disclaimer', 'AI prompt disclaimer', 'AI generated content disclaimer'],
  },
  editorialPolicy: {
    path: '/editorial-policy',
    title: 'Editorial Policy | AQPrompts',
    description:
      'Learn how AQPrompts selects, reviews, discloses, updates, corrects, and removes prompt and article content.',
    keywords: ['AQPrompts editorial policy', 'AI content policy', 'prompt editorial standards'],
  },
  reviewMethod: {
    path: '/how-we-review-prompts',
    title: 'How We Review Prompts | AQPrompts',
    description:
      'See how AQPrompts reviews prompt clarity, identity guidance, safety, compatibility wording, duplication, and corrections.',
    keywords: ['prompt review methodology', 'how prompts are reviewed', 'AQPrompts standards'],
  },
  tools: {
    path: '/tools/ai-image-prompts',
    title: 'Free Creator Tools | AQPrompts',
    description:
      'Browse free AQPrompts tools for AI image prompts, photo editing prompts, and creator growth workflows.',
    keywords: ['creator tools', 'AI prompt tools', 'free Instagram tools'],
  },
  blog: {
    path: '/blog',
    title: 'AI Image Prompt Blog | AQPrompts',
    description:
      'Explore practical AI image prompt guides for portraits, fashion, photo editing, and creative visuals with Midjourney, Leonardo AI, ChatGPT, and Gemini.',
    keywords: ['AI image prompt blog', 'AI prompt guides', 'Midjourney prompts', 'Instagram image prompts'],
  },
  aiPrompts: {
    path: '/tools/ai-image-prompts',
    title: 'Free AI Portrait Prompts for Instagram 2026 | Midjourney, Leonardo AI & Gemini',
    description:
      'Browse free AI image prompts for Instagram. Photorealistic portrait prompts for Midjourney, Leonardo AI, ChatGPT, and Gemini.',
    keywords: ['AI portrait prompts', 'Midjourney prompts', 'Leonardo AI prompts', 'Instagram prompts'],
  },
  photoEditingPrompts: {
    path: '/tools/ai-image-prompts/photo-editing',
    title: 'Photo Editing Prompts for Instagram Creators 2026',
    description:
      'Free photo editing prompts for Instagram creators. Copy ready-to-use prompts for Midjourney, Adobe Firefly and ChatGPT.',
    keywords: ['photo editing prompts', 'AI photo editing', 'Instagram editing prompts'],
  },
};

export const promptCategoryMetadata = {
  men: {
    path: '/tools/ai-image-prompts/men',
    title: 'AI Image Prompts for Men | AQPrompts',
    description:
      'Copy free AI prompts for male portraits, cinematic street photos, fashion editorials, and realistic Instagram profile images.',
    category: 'Men',
  },
  women: {
    path: '/tools/ai-image-prompts/women',
    title: 'AI Image Prompts for Adult Women | AQPrompts',
    description:
      'Copy free AI prompts for female portraits, cinematic fashion shoots, aesthetic editorials, and polished Instagram creator photos.',
    category: 'Women',
  },
  couples: {
    path: '/tools/ai-image-prompts/couples',
    title: 'Couple AI Image Prompts for Romantic Photos 2026',
    description:
      'Copy romantic couple AI prompts for anniversaries, weddings, matching portraits, festive edits, and cinematic social media photos.',
    category: 'Couples',
  },
  celebrations: {
    path: '/tools/ai-image-prompts/celebrations',
    title: 'Celebration AI Prompts for Instagram 2026',
    description:
      'Copy celebration AI prompts for birthdays, milestones, festive portraits, and cinematic Instagram posts that feel personal.',
    category: 'Celebrations',
  },
  business: {
    path: '/tools/ai-image-prompts/business',
    title: 'Business AI Portraits for LinkedIn & Professional Profiles 2026',
    description:
      'Copy business AI portrait prompts for LinkedIn, creator branding, executive headshots, and polished professional profiles.',
    category: 'Business Portraits',
  },
  lifestyle: {
    path: '/tools/ai-image-prompts/lifestyle',
    title: 'Lifestyle AI Portrait Prompts for Instagram 2026',
    description:
      'Copy lifestyle AI portrait prompts for beach, travel, balcony, coffee, and casual Instagram photos with natural creator style.',
    category: 'Lifestyle Portraits',
  },
  cinematic: {
    path: '/tools/ai-image-prompts/cinematic',
    title: 'Cinematic AI Image Prompts for Instagram 2026',
    description:
      'Copy cinematic AI image prompts with dramatic lighting, film color, realistic portraits, and scroll-stopping Instagram style.',
    category: 'Cinematic',
  },
  photoEditing: {
    path: '/tools/ai-image-prompts/photo-editing',
    title: 'Photo Editing AI Prompts for Instagram Creators 2026',
    description:
      'Copy AI photo editing prompts for cinematic edits, restoration, poster designs, and polished Instagram visuals.',
    category: 'Photo Editing Prompts',
  },
};

function cleanText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim();
}

function buildPromptMetaDescription(prompt = {}) {
  const title = cleanText(prompt.title, 'creative images');
  const source = cleanText(prompt.metaDescription)
    || cleanText(prompt.intro)
    || `Copy this AI image prompt for ${title}. Customize the scene and details with ChatGPT, Gemini, or Midjourney.`;
  return clampMetaDescription(source);
}

export function getPromptDisplayTitle(prompt = {}) {
  const title = cleanText(prompt.title, 'AI Image Prompt');
  return /\bAI\s+(?:image\s+)?prompts?\b/i.test(title) ? title : `${title} AI Prompt`;
}

function withSiteName(title) {
  const cleanTitle = cleanText(title, SITE_NAME);
  if (cleanTitle === SITE_NAME || cleanTitle.includes(SITE_NAME)) return cleanTitle;
  return `${cleanTitle} | ${SITE_NAME}`;
}

function normalizeKeywords(keywords = []) {
  if (Array.isArray(keywords)) {
    return [...new Set(keywords.map((item) => cleanText(item)).filter(Boolean))];
  }

  return String(keywords || '')
    .split(',')
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function imageDescriptor(image, alt) {
  return {
    url: normalizeImageUrl(image || DEFAULT_OG_IMAGE),
    width: 1200,
    height: 630,
    alt: cleanText(alt, SITE_NAME),
  };
}

export function buildMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  canonical,
  image = DEFAULT_OG_IMAGE,
  imageAlt,
  type = 'website',
  noIndex = false,
  noFollow = noIndex,
  keywords = [],
  authors = [DEFAULT_AUTHOR],
  publishedTime,
  modifiedTime,
  section,
  tags = [],
} = {}) {
  const metaTitle = withSiteName(title);
  const metaDescription = clampMetaDescription(description, DEFAULT_DESCRIPTION);
  const canonicalUrl = absoluteUrl(canonical || path || '/');
  const imageMeta = imageDescriptor(image, imageAlt || title);
  const authorItems = (Array.isArray(authors) ? authors : [authors])
    .map((name) => ({ name: cleanText(name, DEFAULT_AUTHOR) }))
    .filter((item) => item.name);

  return {
    title: {
      absolute: metaTitle,
    },
    description: metaDescription,
    keywords: normalizeKeywords(keywords),
    authors: authorItems,
    creator: SITE_NAME,
    publisher: SITE_NAME,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: !noIndex,
      follow: !noFollow,
    },
    openGraph: {
      type,
      locale: 'en_US',
      url: canonicalUrl,
      siteName: SITE_NAME,
      title: metaTitle,
      description: metaDescription,
      images: [imageMeta],
      ...(type === 'article'
        ? {
            publishedTime: cleanText(publishedTime) || undefined,
            modifiedTime: cleanText(modifiedTime || publishedTime) || undefined,
            authors: authorItems.map((item) => item.name),
            section: cleanText(section) || undefined,
            tags: normalizeKeywords(tags),
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: metaTitle,
      description: metaDescription,
      images: [imageMeta.url],
      site: DEFAULT_TWITTER_HANDLE,
      creator: DEFAULT_TWITTER_HANDLE,
    },
  };
}

export function buildStaticPageMetadata(key) {
  return buildMetadata(staticPageMetadata[key] || staticPageMetadata.home);
}

export function buildPromptCategoryMetadata(key) {
  const meta = promptCategoryMetadata[key] || staticPageMetadata.aiPrompts;
  return buildMetadata({
    ...meta,
    keywords: ['AI portrait prompts', meta.category, 'Instagram prompts', 'Midjourney prompts'],
  });
}

export async function getAllPrompts() {
  return getAllDatabasePrompts();
}

export async function findPromptBySlug(slug) {
  const safeSlug = cleanText(slug);
  if (!safeSlug) return null;

  return getDatabasePromptBySlug(safeSlug);
}

export function buildPromptMetadata(prompt, path) {
  if (!prompt) {
    return buildMetadata({
      title: 'AI Prompt Not Found',
      description: 'This AQPrompts AI image prompt could not be found.',
      path: path || '/tools/ai-image-prompts',
      noIndex: !isIndexablePrompt(prompt),
    });
  }

  const promptPath = path || `/tools/ai-image-prompts/p/${prompt.slug}`;
  const title = getPromptDisplayTitle(prompt);
  const description = buildPromptMetaDescription(prompt);

  return buildMetadata({
    title,
    description,
    path: promptPath,
    image: prompt.ogImage || prompt.image,
    keywords: [...(Array.isArray(prompt.tags) ? prompt.tags : []), prompt.useCase, prompt.category],
    noIndex: !isIndexablePrompt(prompt),
    noFollow: false,
  });
}

export async function buildBlogPostMetadata(slug) {
  try {
    // Try Neon first, fall back to generated data
    const neonPost = await getCachedBlogPostBySlug(slug);
    const post = neonPost || (await fetchPostBySlug(slug))?.post;
    if (!post) throw new Error('Post not found');
    return buildMetadata({
      title: getPostTitle(post),
      description: getPostDescription(post),
      path: `/blog/${post.slug}`,
      canonical: post.canonicalUrl || `/blog/${post.slug}`,
      image: post.coverImage || post.featuredImage,
      imageAlt: post.coverImageAlt || post.title,
      type: 'article',
      keywords: post.keywords || post.tags,
      authors: [post.author || DEFAULT_AUTHOR],
      publishedTime: post.publishDate,
      modifiedTime: post.updatedAt || post.publishDate,
      section: post.category,
      tags: post.tags,
    });
  } catch {
    return buildMetadata({
      title: 'Blog Post Not Found',
      description: 'This AQPrompts blog post could not be found.',
      path: `/blog/${slug}`,
      noIndex: true,
    });
  }
}

export function buildStaticPageSchema(key) {
  const meta = staticPageMetadata[key] || staticPageMetadata.home;
  const explicitPageType = {
    about: 'AboutPage',
    contact: 'ContactPage',
  }[key];

  return [
    buildWebsiteSchema(),
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      ...(meta.path === '/' ? [] : [{ name: meta.title.split('|')[0].trim(), item: meta.path }]),
    ]),
    explicitPageType
      ? {
          '@context': 'https://schema.org',
          '@type': explicitPageType,
          name: meta.title.split('|')[0].trim(),
          description: meta.description,
          url: absoluteUrl(meta.path),
          isPartOf: {
            '@type': 'WebSite',
            name: SITE_NAME,
            url: absoluteUrl('/'),
          },
        }
      : null,
  ].filter(Boolean);
}

export async function buildBlogListingJsonLd() {
  // Read published posts from Neon (source of truth).
  // Slim query — listing JSON-LD only needs title/slug/image/excerpt/date, not content columns.
  const posts = await getPublishedBlogPostsSlim();
  return [
    buildWebsiteSchema(),
    buildBlogListingSchema(posts),
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'Blog', item: '/blog' },
    ]),
  ];
}

export async function buildBlogPostJsonLd(slug, postOverride = null) {
  // Reuse the already-fetched post when the page has it; otherwise fall back to
  // the cached/remote query path without changing blog metadata semantics.
  let post = postOverride;
  let faqs;

  if (!post) {
    const neonPost = await getCachedBlogPostBySlug(slug);
    if (neonPost) {
      post = neonPost;
      faqs = neonPost.faqs;
    } else {
      ({ post, faqs } = await fetchPostBySlug(slug));
    }
  } else {
    faqs = Array.isArray(post.faqs) ? post.faqs : [];
  }

  return [
    buildWebsiteSchema(),
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'Blog', item: '/blog' },
      { name: post.title, item: `/blog/${post.slug}` },
    ]),
    buildArticleSchema(post),
    buildFaqSchema(faqs || post.faqs),
  ].filter(Boolean);
}

export function buildPromptJsonLd(prompt) {
  if (!prompt) return [];
  const category = getPromptCategory(prompt);
  const categoryUrl = getPromptCategoryUrl(prompt);
  const title = getPromptDisplayTitle(prompt);
  const url = absoluteUrl(`/tools/ai-image-prompts/p/${prompt.slug}`);
  const imageUrl = normalizeImageUrl(prompt.ogImage || prompt.image);
  const publishedDate = cleanText(prompt.createdAt || prompt.date || prompt.updatedAt);
  const modifiedDate = cleanText(prompt.updatedAt || publishedDate);

  return [
    buildWebsiteSchema(),
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'AI Prompts', item: PROMPT_BASE_PATH },
      ...(category ? [{ name: category.label, item: categoryUrl }] : []),
      { name: prompt.title, item: `/tools/ai-image-prompts/p/${prompt.slug}` },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      author: {
        '@type': 'Person',
        name: DEFAULT_AUTHOR,
        url: absoluteUrl('/author/abdul-qudoos'),
      },
      ...(publishedDate ? { datePublished: publishedDate } : {}),
      ...(modifiedDate ? { dateModified: modifiedDate } : {}),
      image: [imageUrl],
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': url,
      },
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: absoluteUrl('/'),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      '@id': `${url}#primaryimage`,
      contentUrl: imageUrl,
      url: imageUrl,
      caption: cleanText(prompt.imageAltTexts?.['0'] || prompt.title),
      representativeOfPage: true,
    },
    buildCreativeWorkSchema(prompt),
  ];
}
