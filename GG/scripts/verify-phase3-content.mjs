import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import yaml from 'js-yaml';

const root = process.cwd();
const blogDir = path.join(root, 'content', 'blog');
const publicDir = path.join(root, 'public');
const siteOrigin = 'https://www.aqprompts.com';
const checkExternal = process.argv.includes('--external');

const failures = [];
const warnings = [];
const externalUrls = new Set();

function parseArticle(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    failures.push(`${path.basename(filePath)}: missing valid frontmatter`);
    return { data: {}, body: raw };
  }

  return {
    data: yaml.load(match[1]) || {},
    body: raw.slice(match[0].length),
  };
}

function publicFileExists(urlPath) {
  const decoded = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  return fs.existsSync(path.join(publicDir, decoded.replace(/^\/+/, '')));
}

const articleFiles = fs
  .readdirSync(blogDir)
  .filter((name) => name.endsWith('.mdx') && !name.startsWith('_'))
  .sort();

const articles = articleFiles.map((name) => {
  const filePath = path.join(blogDir, name);
  const parsed = parseArticle(filePath);
  return { name, filePath, ...parsed };
});

const blogSlugs = new Set(articles.map(({ data }) => String(data.slug || '').trim()).filter(Boolean));

const promptIndexPath = path.join(publicDir, 'data', 'prompts-index.json');
const promptPayload = JSON.parse(fs.readFileSync(promptIndexPath, 'utf8'));
const promptRecords = Array.isArray(promptPayload) ? promptPayload : promptPayload.prompts || [];
const promptSlugs = new Set(promptRecords.map((item) => String(item.slug || '').trim()).filter(Boolean));

const staticRoutes = new Set(['/']);
for (const entry of fs.readdirSync(path.join(root, 'app'), { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/^page\.(jsx|js)$/.test(entry.name)) continue;
  const fullPath = path.join(entry.parentPath || entry.path, entry.name);
  const relative = path.relative(path.join(root, 'app'), fullPath).replaceAll('\\', '/');
  if (relative.includes('[')) continue;
  staticRoutes.add(`/${relative.replace(/\/page\.(jsx|js)$/, '')}`.replace(/\/$/, '') || '/');
}

function internalRouteExists(href) {
  let route = href;
  try {
    if (/^https?:\/\//i.test(href)) {
      const parsed = new URL(href);
      if (!['aqprompts.com', 'www.aqprompts.com'].includes(parsed.hostname)) return true;
      route = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return false;
  }

  route = route.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (publicFileExists(route)) return true;
  if (staticRoutes.has(route)) return true;
  if (route.startsWith('/blog/')) return blogSlugs.has(route.slice('/blog/'.length));
  if (route.startsWith('/tools/ai-image-prompts/p/')) {
    return promptSlugs.has(route.slice('/tools/ai-image-prompts/p/'.length));
  }
  return false;
}

for (const article of articles) {
  const { name, data, body } = article;
  if (data.author !== 'abdul-qudoos' && data.author !== 'Abdul Qudoos') {
    failures.push(`${name}: author is not Abdul Qudoos`);
  }
  if (!data.date) failures.push(`${name}: missing publication date`);
  if (!data.updatedDate) warnings.push(`${name}: missing updatedDate`);
  if (!data.featuredImage && !data.coverImage) failures.push(`${name}: missing featured image`);
  if (!data.featuredImageAlt && !data.coverImageAlt) failures.push(`${name}: missing featured-image alt text`);

  const cover = String(data.featuredImage || data.coverImage || '');
  if (cover.startsWith('/') && !publicFileExists(cover)) failures.push(`${name}: missing cover file ${cover}`);

  const h1Count = (body.match(/^# .+$/gm) || []).length;
  if (h1Count !== 1) failures.push(`${name}: expected one source H1, found ${h1Count}`);

  for (const match of body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    const alt = match[1].trim();
    const src = match[2].trim();
    if (!alt) failures.push(`${name}: empty image alt for ${src}`);
    if (src.startsWith('/') && !publicFileExists(src)) failures.push(`${name}: missing image ${src}`);
    if (/^https?:\/\//i.test(src)) externalUrls.add(src);
  }

  for (const match of body.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    const href = match[1].trim();
    if (/^(mailto:|tel:|#)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) {
      const parsed = new URL(href);
      if (!['aqprompts.com', 'www.aqprompts.com'].includes(parsed.hostname)) externalUrls.add(href);
    }
    if (!internalRouteExists(href)) failures.push(`${name}: broken internal link ${href}`);
  }
}

async function verifyExternal(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'AQPrompts-content-audit/1.0' },
    });
    if ([403, 405].includes(response.status)) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'AQPrompts-content-audit/1.0' },
      });
    }
    return { url, status: response.status, finalUrl: response.url };
  } catch (error) {
    return { url, status: 0, error: error?.message || String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

console.log(`Articles checked: ${articles.length}`);
console.log(`Prompt routes available: ${promptSlugs.size}`);
console.log(`External references discovered: ${externalUrls.size}`);

if (checkExternal) {
  const results = await Promise.all([...externalUrls].sort().map(verifyExternal));
  for (const result of results) {
    console.log(`EXTERNAL ${result.status || 'ERROR'} ${result.url}${result.error ? ` (${result.error})` : ''}`);
    if (result.status === 404 || result.status === 410) failures.push(`broken external link ${result.url}`);
    if (!result.status) warnings.push(`external link could not be verified: ${result.url}`);
  }
}

for (const warning of warnings) console.warn(`WARNING: ${warning}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);

if (failures.length) {
  console.error(`Phase 3 content verification failed with ${failures.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log(`Phase 3 content verification passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
}
