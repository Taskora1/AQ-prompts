import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('prompt directory, page, and search APIs advertise one-day shared caching', async () => {
  const routes = await Promise.all([
    readFile(new URL('../app/api/prompts/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/prompts/page/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/prompts/search/route.js', import.meta.url), 'utf8'),
  ]);

  for (const route of routes) {
    assert.match(route, /s-maxage=86400, stale-while-revalidate=86400/);
  }
});

test('prompt stats and trending APIs share-cache for one hour', async () => {
  const routes = await Promise.all([
    readFile(new URL('../app/api/prompts/stats/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/prompts/trending/route.js', import.meta.url), 'utf8'),
  ]);

  for (const route of routes) {
    assert.match(route, /s-maxage=3600, stale-while-revalidate=3600/);
  }
});

test('public navigation points guides to the blog and legacy guides URL redirects', async () => {
  const [navbar, drawer, config] = await Promise.all([
    readFile(new URL('../src/components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/MobileSideDrawer.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../next.config.js', import.meta.url), 'utf8'),
  ]);

  assert.match(navbar, /label: 'Prompt Guides', href: '\/blog'/);
  assert.match(drawer, /label: 'Prompt Guides', href: '\/blog'/);
  assert.match(config, /source: '\/guides',\s+destination: '\/blog',\s+permanent: true/);
  assert.match(
    config,
    /const publicFeedHeaders = \[[\s\S]*?value: 'public, s-maxage=86400, stale-while-revalidate=86400'/,
  );
});
