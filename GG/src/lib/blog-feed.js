import { getPublishedBlogPostsForFeed } from '@/lib/blog-db';
import { getPromptFeedRows, getPromptUrl } from '@/lib/prompts';

const SITE_URL = process.env.SITE_URL || 'https://www.aqprompts.com';

function absoluteUrl(path = '') {
  const value = String(path || '').trim();
  if (!value) return SITE_URL;
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}${value.startsWith('/') ? value : `/${value}`}`;
}

function escapeXml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeDate(value = '') {
  const input = String(value || '').trim();
  if (!input) return null;

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function getNewBlogFeedPosts() {
  // RSS feed only uses title/slug/dates — slim query avoids content/content_html/content_text
  const posts = await getPublishedBlogPostsForFeed();

  return posts
    .filter((post) => post?.slug)
    .sort((a, b) => {
      const dateA = normalizeDate(a.publishDate || a.date || a.updatedAt)?.getTime() || 0;
      const dateB = normalizeDate(b.publishDate || b.date || b.updatedAt)?.getTime() || 0;
      return dateB - dateA;
    });
}

async function getPromptFeedItems() {
  const prompts = await getPromptFeedRows();
  return prompts
    .filter((prompt) => prompt?.title && prompt?.slug)
    .map((prompt) => ({
      title: prompt.title,
      url: absoluteUrl(getPromptUrl(prompt)),
      description: prompt.intro || prompt.prompt || '',
      category: prompt.category || prompt.useCase || 'AI Prompts',
      tags: Array.isArray(prompt.tags) ? prompt.tags : [],
      image: prompt.image || '/og-cover.webp',
      pubDate: normalizeDate(prompt.updatedAt) || new Date(),
    }));
}

async function getBlogFeedItems() {
  const posts = await getNewBlogFeedPosts();
  return posts.map((post) => ({
    title: post.title,
    url: absoluteUrl(`/blog/${post.slug}`),
    description: post.excerpt || post.seoDescription || post.description || '',
    category: post.category || 'AI Prompts',
    tags: Array.isArray(post.tags) ? post.tags : [],
    image: post.featuredImage || '/og-cover.webp',
    pubDate: normalizeDate(post.publishDate || post.date || post.updatedAt) || new Date(),
  }));
}

export async function buildBlogRssFeed({ title, description, feedPath = '/feed.xml' }) {
  const feedItems = [...(await getBlogFeedItems()), ...(await getPromptFeedItems())].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );
  const buildDate = new Date().toUTCString();
  const items = feedItems
    .map((item) => {
      const imageUrl = absoluteUrl(item.image);

      return `<item>
  <title>${escapeXml(item.title)}</title>
  <link>${escapeXml(item.url)}</link>
  <description>${escapeXml(item.description)}</description>
  <category>${escapeXml(item.category)}</category>
  ${item.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join('\n  ')}
  <enclosure url="${escapeXml(imageUrl)}" type="image/webp" />
  <media:content url="${escapeXml(imageUrl)}" type="image/webp" medium="image" />
  <media:thumbnail url="${escapeXml(imageUrl)}" />
  <pubDate>${item.pubDate.toUTCString()}</pubDate>
  <guid isPermaLink="true">${escapeXml(item.url)}</guid>
</item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>${escapeXml(title)}</title>
  <link>${escapeXml(SITE_URL)}</link>
  <description>${escapeXml(description)}</description>
  <language>en-us</language>
  <lastBuildDate>${buildDate}</lastBuildDate>
  <generator>AQPrompts</generator>
  <ttl>60</ttl>
  <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${escapeXml(absoluteUrl(feedPath))}" rel="self" type="application/rss+xml" />
${items}
</channel>
</rss>
`;
}

export function feedResponse(xml) {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
