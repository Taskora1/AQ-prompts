import { getPublishedBlogPostsForFeed } from '@/lib/blog-db';
import {
  getPublishedPromptSitemapRowsSlim,
  getPromptUrl,
  PROMPT_BASE_PATH,
  PROMPT_CATEGORIES,
} from '@/lib/prompts';
import { listAuthorSitemapRows } from '@/lib/author-profiles-db';
import { formatSitemapLastModified } from '@/lib/sitemap-date';

export const revalidate = 86400;

const CANONICAL_ORIGIN = 'https://www.aqprompts.com';

const staticRoutes = [
  { route: '/', changeFrequency: 'daily', priority: 1.0 },
  { route: '/categories', changeFrequency: 'weekly', priority: 0.9 },
  { route: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { route: '/contact', changeFrequency: 'monthly', priority: 0.5 },
  { route: '/feedback', changeFrequency: 'weekly', priority: 0.5 },
  { route: '/privacy', changeFrequency: 'monthly', priority: 0.5 },
  { route: '/cookie-policy', changeFrequency: 'monthly', priority: 0.5 },
  { route: '/terms', changeFrequency: 'monthly', priority: 0.5 },
  { route: '/disclaimer', changeFrequency: 'monthly', priority: 0.5 },
  { route: '/editorial-policy', changeFrequency: 'monthly', priority: 0.6 },
  { route: '/ai-policy', changeFrequency: 'monthly', priority: 0.5 },
  { route: '/how-we-review-prompts', changeFrequency: 'monthly', priority: 0.6 },
  { route: '/author/abdul-qudoos', changeFrequency: 'monthly', priority: 0.6 },
  { route: '/blog', changeFrequency: 'weekly', priority: 0.7 },
  { route: PROMPT_BASE_PATH, changeFrequency: 'daily', priority: 0.9 },
  { route: '/secret-prompts', changeFrequency: 'daily', priority: 0.7 },
];

const promptCategoryRoutes = Object.values(PROMPT_CATEGORIES).map((category) => ({
  route: `${PROMPT_BASE_PATH}/${category.slug}`,
  changeFrequency: 'weekly',
  priority: 0.8,
}));

function canonicalUrl(route = '/') {
  if (/^https?:\/\//i.test(String(route || ''))) return String(route);
  const pathname = String(route || '/').startsWith('/') ? route : `/${route}`;
  return `${CANONICAL_ORIGIN}${pathname}`;
}

export default async function sitemap() {
  const seen = new Set();

  function entry(route, lastModified, extra = {}) {
    const url = canonicalUrl(route);
    if (seen.has(url)) return null;
    seen.add(url);
    const formattedLastModified = formatSitemapLastModified(lastModified);
    return {
      url,
      ...(formattedLastModified ? { lastModified: formattedLastModified } : {}),
      ...extra,
    };
  }

  const entries = [...staticRoutes, ...promptCategoryRoutes].map((item) =>
    entry(item.route, item.lastModified, {
      changeFrequency: item.changeFrequency,
      priority: item.priority,
    })
  );

  // The three source queries are independent, so they run in parallel
  // (the image sitemap already does this). The authors query keeps its
  // own try/catch behaviour via .catch() — an authors failure still
  // logs and yields no author entries instead of failing the sitemap —
  // while a prompts or posts failure still fails the whole sitemap, as
  // before. Entries are appended in the same order (authors, prompts,
  // posts), so the output is identical.
  // The prompts query uses the slim rows (slug + dates only): this route
  // never renders images, so it skips the adult-context regex and the
  // per-row normalizePrompt that the image sitemap needs — the main
  // sitemap generation stays inside the Workers 10 ms CPU limit.
  const [authors, prompts, posts] = await Promise.all([
    listAuthorSitemapRows().catch((error) => {
      console.error('Author profile sitemap query failed:', error);
      return [];
    }),
    getPublishedPromptSitemapRowsSlim(),
    // Read published posts from Neon (slim — sitemap only needs slug + dates, no content columns)
    getPublishedBlogPostsForFeed(),
  ]);

  for (const author of authors) {
    if (!author?.slug) continue;
    entries.push(entry(author.url, author.updatedAt, {
      changeFrequency: 'monthly',
      priority: 0.5,
    }));
  }

  for (const prompt of prompts) {
    if (!prompt?.slug) continue;
    entries.push(entry(getPromptUrl(prompt), prompt.createdAt || prompt.updatedAt, {
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  }

  for (const post of posts) {
    if (!post?.slug) continue;
    entries.push(
      entry(`/blog/${post.slug}`, post.updatedAt || post.publishDate, {
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    );
  }

  return entries.filter(Boolean);
}
