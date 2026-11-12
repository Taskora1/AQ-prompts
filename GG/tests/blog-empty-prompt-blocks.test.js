import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, before, beforeEach, test } from 'node:test';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import { countEmptyPromptBlocks, stripEmptyPromptBlocks } from '../src/lib/blog-content.js';

// blog-db.js imports { cache } from 'react' (a React 19 server API); the
// installed React 18.3.1 has no such export in the build Node resolves, so
// redirect 'react' to the local stub (tests/react-stub.mjs) before importing
// blog-db. React's cache only memoizes — the identity stand-in keeps the
// same behavior for these tests.
register('./react-stub-hooks.mjs', import.meta.url);
const { createBlogPost, updateBlogPost } = await import('../src/lib/blog-db.js');

// Regression tests for the TipTap empty-prompt-block fix (2026-11-13):
// a prompt block is a TipTap codeBlock rendered as
// <pre class="prompt-block"><code>…</code></pre>. An empty one used to be
// saved and rendered as a copy box that copies nothing (the Birthday-post
// bug: a 45-char empty block). Empty prompt blocks are now stripped on
// save (admin API via blog-db, and the BlogForm client) and at render time
// (SinglePostPage), so no empty prompt block can reach a reader.

const WITH_EMPTY = '<p>Intro text</p><pre class="prompt-block"><code></code></pre>'
  + '<pre class="prompt-block"><code>Real prompt text</code></pre><p>Outro</p>';
const STRIPPED = '<p>Intro text</p><pre class="prompt-block"><code>Real prompt text</code></pre><p>Outro</p>';

test('stripEmptyPromptBlocks removes an empty prompt block and keeps a real one', () => {
  const { html, removed } = stripEmptyPromptBlocks(WITH_EMPTY);
  assert.equal(removed, 1);
  assert.equal(html, STRIPPED);
});

test('stripEmptyPromptBlocks removes whitespace-only, &nbsp; and <br> blocks', () => {
  const html = '<pre class="prompt-block"><code>   </code></pre>'
    + '<pre class="prompt-block"><code>&nbsp;&nbsp;</code></pre>'
    + '<pre class="prompt-block"><code><br></code></pre>'
    + '<pre class="prompt-block"><code>Keep me</code></pre>';
  const { html: clean, removed } = stripEmptyPromptBlocks(html);
  assert.equal(removed, 3);
  assert.equal(clean, '<pre class="prompt-block"><code>Keep me</code></pre>');
});

test('stripEmptyPromptBlocks leaves non-prompt code blocks alone', () => {
  const html = '<pre><code></code></pre><pre class="prompt-block"><code>Keep</code></pre>';
  const { html: clean, removed } = stripEmptyPromptBlocks(html);
  assert.equal(removed, 0);
  assert.equal(clean, html);
});

test('stripEmptyPromptBlocks detects the class on the code tag too', () => {
  const { html, removed } = stripEmptyPromptBlocks('<pre><code class="prompt-block"></code></pre><p>x</p>');
  assert.equal(removed, 1);
  assert.equal(html, '<p>x</p>');
});

test('countEmptyPromptBlocks counts without changing the HTML', () => {
  assert.equal(countEmptyPromptBlocks(WITH_EMPTY), 1);
  assert.equal(countEmptyPromptBlocks('<p>No blocks here</p>'), 0);
  assert.equal(countEmptyPromptBlocks(''), 0);
});

// ── Server-side strip (blog-db is the choke point for the admin API) ──

let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;
const captured = [];

before(() => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalPostgresUrl = process.env.POSTGRES_URL;
  originalPrismaUrl = process.env.POSTGRES_PRISMA_URL;
  originalPool = globalThis.__dbPgPool;
  process.env.DATABASE_URL = 'postgres://localhost/unit_test';
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async query(_text, values) {
      captured.push(values);
      return {
        rows: [{
          id: 1, slug: 'test-post', status: 'draft',
          publish_date: '2026-01-01',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }],
        rowCount: 1,
      };
    },
    async end() {},
  };
});

after(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
  if (originalPrismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
  else process.env.POSTGRES_PRISMA_URL = originalPrismaUrl;
  if (originalPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = originalPool;
});

beforeEach(() => {
  captured.length = 0;
});

test('createBlogPost strips empty prompt blocks from the stored HTML', async () => {
  await createBlogPost({
    slug: 'test-post',
    title: 'Test post',
    content: WITH_EMPTY,
    contentHtml: WITH_EMPTY,
    contentText: 'Intro text Outro',
    status: 'draft',
  });

  assert.equal(captured.length, 1);
  const values = captured[0];
  assert.equal(values[3], STRIPPED);
  assert.equal(values[4], STRIPPED);
  assert.equal(values[5], 'Intro textReal prompt textOutro');
});

test('createBlogPost leaves clean content and its contentText untouched', async () => {
  await createBlogPost({
    slug: 'test-post',
    title: 'Test post',
    content: STRIPPED,
    contentHtml: STRIPPED,
    contentText: 'Custom text kept as-is',
    status: 'draft',
  });

  const values = captured[0];
  assert.equal(values[3], STRIPPED);
  assert.equal(values[4], STRIPPED);
  assert.equal(values[5], 'Custom text kept as-is');
});

test('updateBlogPost strips empty prompt blocks from the stored HTML', async () => {
  await updateBlogPost('test-post', {
    slug: 'test-post',
    title: 'Test post',
    content: WITH_EMPTY,
    contentHtml: WITH_EMPTY,
    contentText: 'Intro text Outro',
    status: 'draft',
  });

  assert.equal(captured.length, 1);
  const values = captured[0];
  assert.equal(values[4], STRIPPED);
  assert.equal(values[5], STRIPPED);
  assert.equal(values[6], 'Intro textReal prompt textOutro');
});
