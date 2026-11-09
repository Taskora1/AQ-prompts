import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('sitemap includes complete published prompt detail routes', async () => {
  const source = await readFile(new URL('../app/sitemap.js', import.meta.url), 'utf8');
  const promptDatabase = await readFile(new URL('../src/lib/prompts-db.js', import.meta.url), 'utf8');
  const sitemapEligibility = promptDatabase.match(
    /export function isSitemapEligiblePrompt[\s\S]*?\n}\n/,
  )?.[0];
  assert.match(source, /export const revalidate = 86400/);
  assert.match(source, /getPublishedPromptSitemapRows/);
  assert.match(source, /for \(const prompt of prompts\)/);
  assert.match(source, /if \(!prompt\?\.slug\) continue/);
  assert.match(source, /entry\(getPromptUrl\(prompt\), prompt\.createdAt \|\| prompt\.updatedAt/);
  assert.doesNotMatch(source, /getSitemapImageUrls|\bimages:/);
  assert.match(promptDatabase, /suppressUnverifiedMedia: true/);
  assert.match(promptDatabase, /images: prompt\.images/);
  assert.match(promptDatabase, /AND NULLIF\(BTRIM\(p\.title\), ''\) IS NOT NULL/);
  assert.match(promptDatabase, /AND NULLIF\(BTRIM\(p\.prompt\), ''\) IS NOT NULL/);
  assert.ok(sitemapEligibility);
  assert.match(sitemapEligibility, /containsMinorSubjectReference/);
  assert.doesNotMatch(sitemapEligibility, /isIndexablePrompt/);
  assert.doesNotMatch(source, /DEFAULT_LASTMOD|2026-08-25/);
});

test('separate image sitemap includes published blog covers and is discoverable', async () => {
  const route = await readFile(new URL('../app/image-sitemap.xml/route.js', import.meta.url), 'utf8');
  const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');
  const imageUrls = await readFile(new URL('../src/lib/sitemap-image-urls.js', import.meta.url), 'utf8');

  assert.match(route, /getSitemapImageUrls\(post\.featuredImage, CANONICAL_ORIGIN\)/);
  assert.match(route, /buildImageSitemapXml\(pages\)/);
  assert.match(robots, /Sitemap: https:\/\/www\.aqprompts\.com\/image-sitemap\.xml/);
  assert.match(imageUrls, /VERIFIED_MEDIA_PLACEHOLDER/);
  assert.match(imageUrls, /imageUrls\.add\(imageUrl\.toString\(\)\)/);
});

test('published prompt mutations on-demand revalidate the sitemap', async () => {
  const source = await readFile(new URL('../src/lib/admin-prompt-revalidation.js', import.meta.url), 'utf8');
  const publicPromptPaths = source.match(/const PUBLIC_PROMPT_INDEX_PATHS = \[([\s\S]*?)\];/)?.[1];

  assert.ok(publicPromptPaths);
  assert.match(publicPromptPaths, /'\/sitemap\.xml'/);
});

test('robots allows AdSense access and keeps the redundant prompt-path rule out of its group', async () => {
  const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');
  const adsenseRules = robots.match(
    /User-agent: Mediapartners-Google([\s\S]*?)(?=\nUser-agent:|$)/,
  )?.[1];
  assert.ok(adsenseRules);
  assert.match(adsenseRules, /Allow: \//);
  assert.doesNotMatch(adsenseRules, /Disallow:\s*\/tools\/ai-image-prompts\/p\//);
  assert.doesNotMatch(adsenseRules, /Allow:\s*\/tools\/ai-image-prompts\/p\//);
});

test('robots explicitly allows Reflectionbot', async () => {
  const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');
  const reflectionRules = robots.match(
    /User-agent: Reflectionbot([\s\S]*?)(?=\nUser-agent:|$)/,
  )?.[1];
  assert.ok(reflectionRules);
  assert.match(reflectionRules, /Allow: \//);
  assert.doesNotMatch(reflectionRules, /Disallow:\s*\//);
});
