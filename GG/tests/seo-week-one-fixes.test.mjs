import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { toPromptCardItem } from '../src/lib/prompt-card.js';

test('prompt card serialization prefers stored image alt text and falls back to the title', () => {
  const prompt = {
    title: 'Riverside portrait',
    imageAltTexts: { 0: 'A portrait beside a palm-lined river' },
  };

  assert.equal(toPromptCardItem(prompt).imageAlt, 'A portrait beside a palm-lined river');
  assert.equal(toPromptCardItem({ title: 'Studio portrait' }).imageAlt, 'Studio portrait');
});

test('couples category metadata uses its own canonical route', async () => {
  const route = await readFile(
    new URL('../app/tools/ai-image-prompts/couples/page.jsx', import.meta.url),
    'utf8',
  );

  assert.match(route, /path: `\$\{PROMPT_BASE_PATH\}\/\$\{category\.slug\}`/);
  assert.doesNotMatch(route, /path: category\.href/);
});

test('prompt metadata never falls back to the raw prompt instructions', async () => {
  const source = await readFile(new URL('../src/lib/metadata.js', import.meta.url), 'utf8');
  const helper = source.match(
    /function buildPromptMetaDescription\(prompt = \{\}\) \{[\s\S]*?\n\}/,
  )?.[0];

  assert.ok(helper);
  assert.match(helper, /prompt\.metaDescription/);
  assert.match(helper, /prompt\.intro/);
  assert.match(helper, /prompt\.title/);
  assert.doesNotMatch(helper, /prompt\.prompt/);
});

test('public sitemap excludes noindex trending and legacy admin sitemap redirects to it', async () => {
  const sitemap = await readFile(new URL('../app/sitemap.js', import.meta.url), 'utf8');
  const legacyRoute = await readFile(new URL('../app/api/sitemap/route.js', import.meta.url), 'utf8');
  const adminNavigation = await readFile(
    new URL('../app/admin/AdminNavigation.jsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(sitemap, /PROMPT_BASE_PATH\}\/trending/);
  assert.match(legacyRoute, /NextResponse\.redirect\(new URL\('\/sitemap\.xml', request\.url\)\)/);
  assert.match(adminNavigation, /href="\/api\/sitemap"/);
  assert.doesNotMatch(legacyRoute, /\/category\//);
});

test('homepage H1 and metadata target ChatGPT photo prompts', async () => {
  const home = await readFile(
    new URL('../src/components/home/HomeLanding.jsx', import.meta.url),
    'utf8',
  );
  const metadata = await readFile(new URL('../src/lib/metadata.js', import.meta.url), 'utf8');

  assert.match(home, /ChatGPT Photo Prompts for Creators/);
  assert.match(metadata, /ChatGPT Photo Prompts & AI Portrait Prompts for Creators \| AQPrompts/);
  assert.match(home, /\/blog\/chatgpt-prompts-for-photos/);
  assert.match(home, /\/blog\/chatgpt-photo-dress-change-prompt-15-copy-paste-ai-outfit-prompts/);
  assert.match(home, /PROMPT_BASE_PATH\}\/photo-editing/);
});

test('about prompt count is dynamically rendered from the published prompt total', async () => {
  const route = await readFile(new URL('../app/about/page.jsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/route-views/AboutPage.jsx', import.meta.url), 'utf8');

  assert.match(route, /dynamic = 'force-dynamic'/);
  assert.match(page, /\$\{promptCount\}\+/);
});

test('dress-change guide redirects permanently to the canonical outfit post', async () => {
  const config = await readFile(new URL('../next.config.js', import.meta.url), 'utf8');
  const blogDb = await readFile(new URL('../src/lib/blog-db.js', import.meta.url), 'utf8');

  assert.match(config, /source: '\/blog\/chatgpt-dress-change-prompt-guide-for-women'/);
  assert.match(config, /destination: '\/blog\/chatgpt-photo-dress-change-prompt-15-copy-paste-ai-outfit-prompts'/);
  assert.match(config, /permanent: true/);
  assert.match(blogDb, /const REDIRECTED_BLOG_POST_SLUGS = \['chatgpt-dress-change-prompt-guide-for-women'\]/);
  assert.match(blogDb, /WHERE status = 'published'\s+AND slug <> ALL\(\$1::text\[\]\)/);
});

test('prompt and blog sitemap entries fall back to their publish dates', async () => {
  const sitemap = await readFile(new URL('../app/sitemap.js', import.meta.url), 'utf8');

  assert.match(sitemap, /prompt\.createdAt \|\| prompt\.updatedAt/);
  assert.match(sitemap, /post\.updatedAt \|\| post\.publishDate/);
});
