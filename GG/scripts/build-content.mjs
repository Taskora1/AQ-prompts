import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import nextEnv from '@next/env';
import {
  fingerprintDatabaseUrl,
  identitiesEqual,
  KNOWN_PRODUCTION_IDENTITY,
} from './lib/database-migration-safety.mjs';
import {
  getSafePublicMediaSource,
  replaceUnverifiedHtmlImages,
} from '../src/lib/media-safety.js';
import { compileMdxContent } from '../src/lib/blog-mdx-compiler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const { loadEnvConfig } = nextEnv;
const contentDir = path.join(root, 'content');
const blogDir = path.join(contentDir, 'blog');
const authorsDir = path.join(contentDir, 'authors');
const publicDir = path.join(root, 'public');
const generatedDir = path.join(root, 'src', 'generated');
const dataDir = path.join(publicDir, 'data');
const postsDataDir = path.join(dataDir, 'posts');
const PREVIEW_DATABASE_IDENTITY_FINGERPRINT =
  'sha256:e811277adcadb1e93001d41c5b616599e57824a649875d92cb56755b0a1560b8';
const BLOG_SLUG_ALIASES = {
  'how-to-growth-hack-instagram-reels': 'instagram-reels-growth-hacks-2026',
  'how-to-go-viral-on-instagram-reels': 'go-viral-on-instagram-reels',
  'how-to-grow-instagram-followers': 'how-to-grow-instagram-followers-organically',
  'best-instagram-niche-ideas-for-2026': 'best-instagram-niche-ideas-2026',
  'how-to-get-fast-growth-on-instagram': 'instagram-growth-strategy-2026',
  'how-to-make-educational-reels-instagram': 'how-to-create-saveable-content-instagram-reels-2026',
  'instagram-reels-tips-small-creators-2026': 'instagram-reels-growth-hacks-2026',
  'why-instagram-reach-dropped-suddenly-in-2026-a-practical-guide-to-recover-your-views':
    'instagram-reach-drop-2026-fix-recovery-guide',
};

const site = {
  name: 'AQPrompts',
  url: 'https://www.aqprompts.com',
  title: 'AQPrompts - Social media growth strategies for creators and brands',
  description:
    'Practical social media growth advice, creator strategy breakdowns, and actionable marketing guides for modern content brands.',
  email: process.env.SITE_EMAIL || 'hello@aqprompts.com',
  defaultOgImage: '/og-cover.webp',
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function writeGeneratedModule(file, payload) {
  ensureDir(path.dirname(file));
  const source = `export const generatedContent = ${JSON.stringify(payload, null, 2)};

export default generatedContent;
`;
  fs.writeFileSync(file, source);
}

export function fingerprintPreviewDatabaseIdentity(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const normalizedIdentity = [
    parsed.hostname.toLowerCase().replace(/\.$/, ''),
    decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    decodeURIComponent(parsed.username),
  ];
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(normalizedIdentity)).digest('hex')}`;
}

export function assertContentSyncSafety(env = process.env, {
  expectedPreviewIdentityFingerprint = PREVIEW_DATABASE_IDENTITY_FINGERPRINT,
  productionIdentity = KNOWN_PRODUCTION_IDENTITY,
} = {}) {
  const deploymentEnvironment = String(env.VERCEL_ENV || '').trim().toLowerCase();
  if (!['preview', 'production'].includes(deploymentEnvironment)) {
    throw new Error('Content sync requires an explicit Preview or Production environment.');
  }
  if (deploymentEnvironment === 'preview' && env.PREVIEW_DATABASE_MODE !== 'staging') {
    throw new Error('Content sync Preview requires PREVIEW_DATABASE_MODE=staging.');
  }

  const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL;
  if (!databaseUrl) {
    throw new Error('Content sync requires a configured database.');
  }

  let identity;
  let databaseProtocol;
  try {
    const parsed = new URL(databaseUrl);
    databaseProtocol = parsed.protocol;
    identity = fingerprintDatabaseUrl(databaseUrl);
  } catch {
    throw new Error('Content sync database identity cannot be verified.');
  }

  if (!['postgres:', 'postgresql:'].includes(databaseProtocol)) {
    throw new Error('Content sync requires a PostgreSQL database.');
  }

  if (deploymentEnvironment === 'preview') {
    if (identity.provider !== 'neon') {
      throw new Error('Content sync Preview requires the dedicated Neon database.');
    }
    if (identitiesEqual(identity, productionIdentity)) {
      throw new Error('Content sync Preview cannot use the registered Production database.');
    }
    if (fingerprintPreviewDatabaseIdentity(databaseUrl) !== expectedPreviewIdentityFingerprint) {
      throw new Error('Content sync database identity is not the verified Preview database.');
    }
    return;
  }

  if (!identitiesEqual(identity, productionIdentity)) {
    throw new Error('Content sync Production database does not match the registered Production identity.');
  }
}

function readLocalPromptsPayload() {
  const promptsFile = path.join(dataDir, 'prompts-index.json');
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(promptsFile, 'utf8'));
  } catch (error) {
    throw new Error(`Local content build requires a valid ${path.relative(root, promptsFile)} file.`, {
      cause: error,
    });
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.prompts)) {
    throw new Error(
      `Local content build requires ${path.relative(root, promptsFile)} to contain a prompts array.`,
    );
  }

  return payload;
}

function normalizeMojibake(value = '') {
  return String(value || '')
    .replace(/Ã¢â‚¬â„¢/g, 'â€™')
    .replace(/Ã¢â‚¬Å“/g, 'â€œ')
    .replace(/Ã¢â‚¬/g, 'â€')
    .replace(/Ã¢â‚¬â€/g, 'â€”')
    .replace(/Ã¢â‚¬â€œ/g, 'â€“')
    .replace(/Ã¢â‚¬Â¦/g, 'â€¦')
    .replace(/Ã¢â‚¬Â¢/g, 'â€¢')
    .replace(/Ã¢â€\u00a0â€™/g, 'â†’')
    .replace(/Ã°Å¸Å¡â‚¬/g, 'ðŸš€')
    .replace(/Ã°Å¸â€Â¥/g, 'ðŸ”¥')
    .replace(/Ãƒâ€”/g, 'Ã—')
    .replace(/Ã‚/g, '');
}

function normalizeTextValue(value = '') {
  return normalizeMojibake(String(value || '')).replace(/\s+/g, ' ').trim();
}

function sanitizeDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeDeep);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeDeep(item)]));
  }

  if (typeof value === 'string') {
    return normalizeMojibake(value);
  }

  return value;
}

function normalizeBlogHref(href = '') {
  const input = String(href || '').trim();
  const directMatch = input.match(/^\/blog\/([^/?#]+)(.*)?$/i);
  if (directMatch) {
    const slug = slugify(directMatch[1]);
    const suffix = directMatch[2] || '';
    const canonicalSlug = BLOG_SLUG_ALIASES[slug] || slug;
    return `/blog/${canonicalSlug}${suffix}`;
  }

  try {
    const parsed = new URL(input, site.url);
    if (parsed.origin !== site.url || !parsed.pathname.startsWith('/blog/')) return input;

    const pathname = normalizeBlogHref(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    return absoluteUrl(pathname);
  } catch {
    return input;
  }
}

function normalizeCanonicalUrl(value = '', slug = '') {
  const fallbackPath = `/blog/${slug}`;
  const input = String(value || fallbackPath).trim() || fallbackPath;
  return absoluteUrl(normalizeBlogHref(input));
}

function rewriteInternalBlogLinks(html = '') {
  return String(html || '').replace(/href="(\/blog\/[^"]+)"/gi, (match, href) => {
    return `href="${escapeHtml(normalizeBlogHref(href))}"`;
  });
}

function toPostSummary(post) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    category: post.category,
    excerpt: post.excerpt,
    publishDate: post.publishDate,
    date: post.publishDate,
    readingTime: post.readingTime,
    coverImage: post.coverImage,
    coverImageAlt: post.coverImageAlt,
    tags: post.tags,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    canonicalUrl: absoluteUrl(post.canonicalUrl),
    updatedAt: post.updatedAt,
    keywords: post.keywords,
    contentType: post.contentType,
    featuredPost: post.featuredPost,
    status: post.status || 'published',
    author: post.author,
    authorMeta: post.authorMeta,
    primaryVideo: post.primaryVideo,
  };
}


function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripTags(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ');
}

function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function promptRouteSlugify(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function absoluteUrl(input = '') {
  const value = String(input || '').trim();
  if (!value) return site.url;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const hostname = parsed.hostname.toLowerCase();

      if (hostname === 'aqprompts.com' || hostname === 'www.aqprompts.com') {
        return `${site.url}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      return value;
    }

    return value;
  }
  return `${site.url}${value.startsWith('/') ? value : `/${value}`}`;
}

function normalizeFrontmatterValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeFrontmatterValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeFrontmatterValue(item)])
    );
  }

  return typeof value === 'string' ? normalizeMojibake(value) : value;
}

function parseYamlValue(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseFrontmatterLegacy(yamlSource = '') {
  const lines = String(yamlSource || '').split(/\r?\n/);
  const data = {};
  let currentKey = null;
  let currentObject = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    const indent = line.match(/^\s*/)?.[0].length || 0;
    if (indent >= 2 && currentKey && Array.isArray(data[currentKey])) {
      const objectKeyValue = line.trim().match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (objectKeyValue && currentObject) {
        currentObject[objectKeyValue[1]] = parseYamlValue(objectKeyValue[2]);
        continue;
      }
    }

    const arrayItemMatch = line.match(/^\s*-\s*(.*)$/);
    if (arrayItemMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      const value = arrayItemMatch[1];

      if (!value) {
        currentObject = {};
        data[currentKey].push(currentObject);
      } else if (/^[A-Za-z0-9_]+:\s*/.test(value)) {
        currentObject = {};
        const parts = value.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (parts) {
          currentObject[parts[1]] = parseYamlValue(parts[2]);
          data[currentKey].push(currentObject);
        }
      } else {
        currentObject = null;
        data[currentKey].push(parseYamlValue(value));
      }
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyValueMatch) continue;

    const [, key, value] = keyValueMatch;
    currentKey = key;
    currentObject = null;
    data[key] = value.trim() ? parseYamlValue(value) : [];
  }

  return data;
}

function parseFrontmatter(raw = '') {
  const input = String(raw).replace(/^\uFEFF/, '');
  const match = input.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const [, yamlSource, body] = match;

  try {
    const data = yaml.load(yamlSource) || {};
    return {
      data:
        data && typeof data === 'object' && !Array.isArray(data)
          ? sanitizeDeep(normalizeFrontmatterValue(data))
          : {},
      body,
    };
  } catch (error) {
    console.warn(
      `Falling back to legacy frontmatter parser due to YAML parse error: ${error?.message || error}`
    );
  }

  return { data: sanitizeDeep(parseFrontmatterLegacy(yamlSource)), body };
}

function parseAuthors() {
  const authors = new Map();
  if (!fs.existsSync(authorsDir)) return authors;

  for (const file of fs.readdirSync(authorsDir)) {
    if (!file.endsWith('.md')) continue;

    const raw = fs.readFileSync(path.join(authorsDir, file), 'utf8');
    const { data } = parseFrontmatter(raw);
    const slug = path.basename(file, path.extname(file));

    authors.set(slug, {
      slug,
      name: data.name || 'Abdul Qudoos',
      role: data.role || 'Founder and Editor, AQPrompts',
      avatar: data.avatar || '/images/founder-aqprompts.webp',
      bio: data.bio || '',
      authorUrl: data.authorUrl || `/author/${slug}`,
    });
  }

  return authors;
}

function normalizeFaqs(faq) {
  return Array.isArray(faq)
    ? faq
        .map((item) => ({
          question: normalizeTextValue(item?.question),
          answer: normalizeTextValue(item?.answer),
        }))
        .filter((x) => x.question && x.answer)
    : [];
}

function normalizeTags(tags = [], focusKeyword = '') {
  const values = [
    ...(Array.isArray(tags) ? tags : []),
    focusKeyword,
  ]
    .map((item) => normalizeTextValue(item))
    .filter(Boolean);

  return [...new Set(values)];
}

function getReadingTime(frontmatterValue, fallbackText = '') {
  const parsed = Number.parseInt(String(frontmatterValue || '').replace(/[^\d]/g, ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return readingTimeFromText(fallbackText);
}

function readingTimeFromText(text = '') {
  return Math.max(1, Math.ceil(String(text).trim().split(/\s+/).filter(Boolean).length / 200));
}

function excerptFromText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 180).trim();
}

function normalizeVideoDescription(value = '', fallback = '') {
  const text = String(value || fallback).replace(/\s+/g, ' ').trim();
  if (!text) return 'Watch the video on AQPrompts.';
  return text.slice(0, 2048);
}

function buildPrimaryVideo(post) {
  const embed = Array.isArray(post?.videoEmbeds)
    ? post.videoEmbeds.find((item) => String(item?.videoId || '').trim())
    : null;

  if (!embed) return null;

  const videoId = String(embed.videoId || '').trim();
  const start = Number.isFinite(Number.parseInt(String(embed.start || 0), 10))
    ? Math.max(0, Number.parseInt(String(embed.start || 0), 10))
    : 0;
  const title = String(embed.title || `${post.title} video`).trim();
  const description = normalizeVideoDescription(embed.description, post.excerpt || post.seoDescription);
  const uploadDate = String(embed.uploadDate || post.publishDate || '').trim();
  const duration = String(embed.duration || '').trim();
  const durationSeconds = String(embed.durationSeconds || '').trim();
  const durationIso = String(embed.durationIso || '').trim();
  const thumbnailUrl = absoluteUrl(
    embed.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  );
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${
    start > 0 ? `&t=${start}s` : ''
  }`;
  const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1${
    start > 0 ? `&start=${start}` : ''
  }`;

  return {
    videoId,
    title,
    description,
    thumbnailUrl,
    uploadDate,
    duration,
    durationSeconds,
    durationIso,
    start,
    watchUrl,
    embedUrl,
  };
}

function relatedPostsFor(post, posts) {
  return posts
    .filter((item) => item.slug !== post.slug)
    .map((item) => ({
      item,
      score:
        (item.category === post.category ? 3 : 0) +
        (item.tags || []).filter((tag) => (post.tags || []).includes(tag)).length,
    }))
    .sort(
      (a, b) =>
        b.score - a.score || new Date(b.item.publishDate) - new Date(a.item.publishDate)
    )
    .map((x) => x.item)
    .slice(0, 3);
}

function buildRss(posts, payload) {
  let items = '';

  try {
    const prompts = Array.isArray(payload?.prompts) ? payload.prompts : [];
      
    items = prompts
      .slice(0, 20)
      .map(
        (prompt) => {
          const promptSlug = prompt?.slug || promptRouteSlugify(prompt?.title || '');
          const promptUrl = `${site.url}/tools/ai-image-prompts/p/${promptSlug}`;
          const imageUrl = /^https?:\/\//i.test(prompt?.image || '')
            ? prompt.image
            : prompt?.image
              ? `${site.url}${prompt.image}`
              : '';
          const title = escapeHtml(prompt?.title || 'AI Image Prompt');
          const description = escapeHtml(prompt?.intro || prompt?.prompt || '');
          const pubDate = new Date(payload?.updatedAt || Date.now()).toUTCString();
          const category = escapeHtml(prompt?.category || prompt?.useCase || 'AI Image Prompts');
          const imageTags = imageUrl
            ? `<enclosure url="${imageUrl}" type="image/webp" length="0" /><media:content url="${imageUrl}" type="image/webp" medium="image" fileSize="0" /><media:thumbnail url="${imageUrl}" />`
            : '';

          return `<item><title>${title}</title><link>${promptUrl}</link><description>${description}</description><category>${category}</category>${imageTags}<pubDate>${pubDate}</pubDate><guid isPermaLink="true">${promptUrl}</guid></item>`;
        }
      )
      .join('');
  } catch (e) {
    console.error('Error building RSS from prompts:', e);
  }

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>${escapeHtml(site.name)} - AI Image Prompts</title><link>${site.url}/tools/ai-image-prompts</link><description>${escapeHtml(site.description)} - AI Image Prompts for Instagram and Pinterest</description>${items}</channel></rss>`;
}

async function main() {
  loadEnvConfig(root);
  const deploymentEnvironment = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  let promptsPayload;
  if (['preview', 'production'].includes(deploymentEnvironment)) {
    assertContentSyncSafety();
    const { getPromptsPayload } = await import('../src/lib/prompts-db.js');
    promptsPayload = await getPromptsPayload();
  } else {
    promptsPayload = readLocalPromptsPayload();
    console.log('[content] local build: using public/data/prompts-index.json; database sync skipped');
  }
  ensureDir(postsDataDir);
  const authors = parseAuthors();

  const files = fs.existsSync(blogDir)
    ? fs.readdirSync(blogDir).filter((f) => f.endsWith('.mdx') && !f.startsWith('_'))
    : [];

  const posts = (
    await Promise.all(
      files.map(async (file) => {
      const raw = fs.readFileSync(path.join(blogDir, file), 'utf8');
      const { data, body } = parseFrontmatter(raw);
      const compiledContent = await compileMdxContent(normalizeMojibake(body));
      compiledContent.html = replaceUnverifiedHtmlImages(
        rewriteInternalBlogLinks(normalizeMojibake(compiledContent.html)),
        body,
      );
      const toc = compiledContent.headings;
      const contentText = stripTags(compiledContent.html)
        .replace(/\s+/g, ' ')
        .trim();

      const slug = data.slug
        ? slugify(data.slug)
        : slugify(data.title || path.basename(file, '.mdx'));

      const authorKey = String(data.author || 'abdul-qudoos').trim();
      const author = authors.get(authorKey) || {
        slug: authorKey,
        name: 'Abdul Qudoos',
        role: 'Founder and Editor, AQPrompts',
        avatar: '/images/founder-aqprompts.webp',
        bio: 'Abdul Qudoos creates and reviews AQPrompts guides and prompt-library content for creators using AI image tools.',
        authorUrl: `/author/${authorKey}`,
      };

      author.avatar = getSafePublicMediaSource(author.avatar, 'founder author real photograph');
      const coverImage = getSafePublicMediaSource(
        String(data.coverImage || data.featuredImage || '/og-cover.webp').trim(),
        String(data.coverImage || data.featuredImage || '/og-cover.webp').trim(),
      );
      const coverImageAlt =
        normalizeTextValue(data.coverImageAlt || `${data.title || 'AQPrompts article'} cover image`);
      const publishDate = String(data.date || new Date().toISOString().slice(0, 10));
      const updatedAt = String(data.updatedDate || publishDate);
      const tags = normalizeTags(data.tags, data.focusKeyword);
      const excerpt = normalizeTextValue(data.excerpt || data.description || excerptFromText(contentText));
      const category = normalizeTextValue(data.category || 'Social Media Tips');
      const title = normalizeTextValue(data.title || slug);
      const seoTitle = normalizeTextValue(data.seoTitle || title);
      const seoDescription = normalizeTextValue(data.description || excerpt);
      const canonicalUrl = normalizeCanonicalUrl(data.canonicalUrl || data.canonical, slug);

      const post = {
        id: slug,
        slug,
        title,
        excerpt,
        category,
        publishDate,
        date: publishDate,
        readingTime: getReadingTime(data.readingTime, contentText),
        coverImage,
        coverImageAlt,
        author: author.name,
        authorMeta: author,
        seoTitle,
        seoDescription,
        canonicalUrl,
        updatedAt,
        tags,
        keywords: tags.join(', '),
        faqs: normalizeFaqs(data.faq),
        contentText,
        featuredPost: Boolean(data.featured),
        draft: Boolean(data.draft) || String(data.status || '').trim().toLowerCase() === 'draft',
        status: String(data.status || '').trim().toLowerCase() === 'draft' ? 'draft' : 'published',
        contentType: 'blog',
        contentHtml: compiledContent.html,
        blocks: [],
        normalizedBlocks: [],
        videoEmbeds: compiledContent.embeds,
        toc,
        meta: {
          hasFaqs: normalizeFaqs(data.faq).length > 0,
          hasToc: toc.length > 0,
          hasTags: tags.length > 0,
          hasVideo: false,
          hasRelatedPosts: false,
          blockCount: toc.length,
        },
      };

      post.primaryVideo = buildPrimaryVideo(post);
      post.meta.hasVideo = Boolean(post.primaryVideo);

      return post;
    })
    ))
    .filter((post) => String(post.title).trim() && String(post.slug).trim() && post.draft !== true && post.status !== 'draft');

  posts.sort(
    (a, b) =>
      new Date(b.publishDate) - new Date(a.publishDate) || a.title.localeCompare(b.title)
  );

  for (const post of posts) {
    const relatedPosts = relatedPostsFor(post, posts).map(toPostSummary);
    const publicToc = (Array.isArray(post.toc) ? post.toc : []).filter((item) => {
      const text = String(item?.text || '').trim();
      const level = Number(item?.level || 0);

      if (!text || level !== 2) return false;
      if (text.toLowerCase() === String(post.title || '').trim().toLowerCase()) return false;
      if (/^(faq|faqs|frequently asked questions)$/i.test(text)) return false;

      return true;
    });

    post.meta.hasRelatedPosts = relatedPosts.length > 0;

    writeJson(path.join(postsDataDir, `${post.slug}.json`), {
      success: true,
      post: {
        ...post,
        blocks: undefined,
        normalizedBlocks: undefined,
        toc: undefined,
        meta: undefined,
        faqs: post.faqs,
        primaryVideo: post.primaryVideo,
      },
      blocks: [],
      normalizedBlocks: [],
      relatedPosts,
      faqs: post.faqs,
      primaryVideo: post.primaryVideo,
      toc: publicToc,
      meta: post.meta,
    });
  }

  const currentPostFiles = new Set(posts.map((post) => `${post.slug}.json`));

  if (fs.existsSync(postsDataDir)) {
    for (const fileName of fs.readdirSync(postsDataDir)) {
      if (!fileName.endsWith('.json') || currentPostFiles.has(fileName)) continue;
      fs.unlinkSync(path.join(postsDataDir, fileName));
    }
  }

  const listPosts = posts.map((post) => {
    const relatedPosts = relatedPostsFor(post, posts).map(toPostSummary);
    const publicToc = (Array.isArray(post.toc) ? post.toc : []).filter((item) => {
      const text = String(item?.text || '').trim();
      const level = Number(item?.level || 0);

      if (!text || level !== 2) return false;
      if (text.toLowerCase() === String(post.title || '').trim().toLowerCase()) return false;
      if (/^(faq|faqs|frequently asked questions)$/i.test(text)) return false;

      return true;
    });

    return {
      ...toPostSummary(post),
      content: post.contentHtml,
      blocks: [],
      normalizedBlocks: [],
      toc: publicToc,
      faqs: post.faqs,
      meta: {
        ...post.meta,
        hasRelatedPosts: relatedPosts.length > 0,
      },
      relatedPosts,
    };
  });

  const listSummaries = posts.map(toPostSummary);

  const generatedAt = new Date().toISOString();
  const contentPayload = {
    success: true,
    generatedAt,
    posts: listPosts,
    total: listPosts.length,
  };

  const summaryPayload = {
    success: true,
    generatedAt,
    posts: listSummaries,
    total: listSummaries.length,
  };

  writeJson(path.join(dataDir, 'posts.json'), contentPayload);
  writeJson(path.join(dataDir, 'posts-index.json'), summaryPayload);
  writeJson(path.join(dataDir, 'prompts-index.json'), promptsPayload);
  writeGeneratedModule(path.join(generatedDir, 'content.generated.js'), contentPayload);
  writeGeneratedModule(path.join(generatedDir, 'posts.generated.js'), summaryPayload);

  fs.writeFileSync(path.join(publicDir, 'rss.xml'), buildRss(listPosts, promptsPayload));

  console.log(`[content] built ${listPosts.length} posts`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error('[content] build failed:', error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
