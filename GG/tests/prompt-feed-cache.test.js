import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import {
  clearPromptsCache,
  getPromptFeedRows,
} from '../src/lib/prompts-db.js';

let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;
let originalNow;
let now;
let queryCount = 0;
let lastQuery = '';

before(() => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalPostgresUrl = process.env.POSTGRES_URL;
  originalPrismaUrl = process.env.POSTGRES_PRISMA_URL;
  originalPool = globalThis.__dbPgPool;
  originalNow = Date.now;
  now = originalNow();
  Date.now = () => now;
  process.env.DATABASE_URL = 'postgres://localhost/unit_test';
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async query(query) {
      queryCount += 1;
      lastQuery = typeof query === 'string' ? query : query.text;
      return {
        rows: Array.from({ length: 100 }, (_, index) => ({
          title: `Prompt ${index + 1}`,
          slug: `prompt-${index + 1}`,
          prompt: `Complete prompt body ${index + 1} ${'detail '.repeat(60)}`,
          image: `/images/prompt-${index + 1}.webp`,
          tags: ['portrait', 'creator'],
          category: 'Portrait',
          useCase: 'Photography',
          intro: `Full introduction ${index + 1}`,
          updatedAt: `2026-10-${String(27 - (index % 27)).padStart(2, '0')}T00:00:00.000Z`,
        })),
      };
    },
  };
});

after(() => {
  Date.now = originalNow;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
  if (originalPrismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
  else process.env.POSTGRES_PRISMA_URL = originalPrismaUrl;
  if (originalPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = originalPool;
});

test('prompt feed query caps rows at 100 and preserves complete prompt fields/order', async () => {
  queryCount = 0;
  clearPromptsCache();

  const rows = await getPromptFeedRows();

  assert.equal(rows.length, 100);
  assert.match(lastQuery, /ORDER BY p\.updated_at DESC NULLS LAST, p\.id DESC\s+LIMIT 100/i);
  assert.match(lastQuery, /p\.prompt,/i);
  assert.deepEqual(Object.keys(rows[0]), [
    'title', 'slug', 'prompt', 'image', 'tags', 'category', 'intro', 'updatedAt',
  ]);
  assert.match(rows[0].prompt, /Complete prompt body 1/);
  assert.ok(rows[0].prompt.length > 300);
  assert.equal(queryCount, 1);
});

test('prompt feed rows are shared across calls and invalidated by prompt cache clearing', async () => {
  queryCount = 0;
  clearPromptsCache();

  const [first, concurrent] = await Promise.all([
    getPromptFeedRows(),
    getPromptFeedRows(),
  ]);
  assert.strictEqual(first, concurrent);
  assert.equal(queryCount, 1);

  now += 23 * 60 * 60 * 1000;
  assert.strictEqual(await getPromptFeedRows(), first);
  assert.equal(queryCount, 1);

  now += 60 * 60 * 1000;
  await getPromptFeedRows();
  assert.equal(queryCount, 2);

  clearPromptsCache();
  await getPromptFeedRows();
  assert.equal(queryCount, 3);
});

test('the three prompt/blog feeds retain valid RSS item fields and share daily CDN caching', async () => {
  const feedModule = await readFile(new URL('../src/lib/blog-feed.js', import.meta.url), 'utf8');
  const nextConfig = await readFile(new URL('../next.config.js', import.meta.url), 'utf8');
  const feedRoutes = await Promise.all([
    readFile(new URL('../app/feed.xml/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/rss.xml/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/pinterest-feed.xml/route.js', import.meta.url), 'utf8'),
  ]);

  assert.match(feedModule, /<\?xml version="1\.0" encoding="UTF-8"\?>[\s\S]*<rss version="2\.0"/);
  for (const field of [
    '<title>${escapeXml(item.title)}</title>',
    '<link>${escapeXml(item.url)}</link>',
    '<description>${escapeXml(item.description)}</description>',
    '<category>${escapeXml(item.category)}</category>',
    '${item.tags.map',
    '<enclosure url=',
    '<pubDate>${item.pubDate.toUTCString()}</pubDate>',
    '<guid isPermaLink="true">${escapeXml(item.url)}</guid>',
  ]) {
    assert.ok(feedModule.includes(field), `RSS item field is missing: ${field}`);
  }
  assert.match(feedModule, /public, s-maxage=86400, stale-while-revalidate=86400/);
  assert.match(nextConfig, /public, s-maxage=86400, stale-while-revalidate=86400/);
  assert.equal((nextConfig.match(/source: '\/(?:feed|rss|pinterest-feed)\.xml'/g) || []).length, 3);
  for (const route of feedRoutes) {
    assert.match(route, /buildBlogRssFeed/);
    assert.match(route, /feedResponse/);
  }
});
