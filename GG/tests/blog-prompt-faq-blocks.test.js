import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, before, beforeEach, test } from 'node:test';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import {
  countPromptBlocks,
  ensureSingleFaqSection,
  faqItemsFromHtml,
  faqItemsToHtml,
  getPromptBlocks,
  hasFaqSection,
  sanitizeBlogBlocks,
  stripEmptyFaqBlocks,
} from '../src/lib/blog-content.js';

// blog-db.js imports { cache } from 'react' (a React 19 server API); the
// installed React 18.3.1 has no such export in the build Node resolves, so
// redirect 'react' to the local stub (tests/react-stub-hooks.mjs) before
// importing blog-db. React's cache only memoizes — the identity stand-in
// keeps the same behavior for these tests.
register('./react-stub-hooks.mjs', import.meta.url);
const { createBlogPost } = await import('../src/lib/blog-db.js');

// Tests for the Batch A editor blocks (2026-11-13): the real Prompt block
// (TipTap promptBlock node, title + text) and the real FAQ block (TipTap
// faqBlock node, question + answer pairs). Both serialize to HTML the
// public renderer already understands; the pure helpers below are the
// contract the nodes, the save path and the renderer share.

const FAQ_HTML = '<div class="faq-block"><h2>Frequently Asked Questions</h2>'
  + '<h3>What is this?</h3><p>An answer.</p>'
  + '<h3>Second?</h3><p>Another answer.</p></div>';
const PLAIN_FAQ = '<h2>Frequently Asked Questions</h2>'
  + '<h3>What is this?</h3><p>An answer.</p>'
  + '<h2>Next section</h2><p>After.</p>';
const FAQ_ITEMS = [
  { question: 'What is this?', answer: 'An answer.' },
  { question: 'Second?', answer: 'Another answer.' },
];

// ── Prompt blocks ──

test('getPromptBlocks returns title and text, ignores plain code blocks', () => {
  const html = '<pre class="prompt-block" data-title="Golden hour"><code>Real prompt</code></pre>'
    + '<pre><code>plain code</code></pre>'
    + '<pre class="prompt-block"><code>Untitled prompt</code></pre>';
  assert.deepEqual(getPromptBlocks(html), [
    { title: 'Golden hour', text: 'Real prompt' },
    { title: '', text: 'Untitled prompt' },
  ]);
  assert.equal(countPromptBlocks(html), 2);
});

test('getPromptBlocks decodes entities in the title', () => {
  const html = '<pre class="prompt-block" data-title="Fish &amp; chips"><code>x</code></pre>';
  assert.deepEqual(getPromptBlocks(html), [{ title: 'Fish & chips', text: 'x' }]);
});

// ── FAQ HTML round-trip ──

test('faqItemsToHtml builds the faq-block shape and drops empty items', () => {
  assert.equal(faqItemsToHtml(FAQ_ITEMS), FAQ_HTML);
  assert.equal(
    faqItemsToHtml([{ question: 'Q?', answer: '' }, { question: '', answer: 'A' }, ...FAQ_ITEMS]),
    FAQ_HTML,
  );
  assert.equal(faqItemsToHtml([]), '');
  assert.equal(faqItemsToHtml(null), '');
});

test('faqItemsToHtml escapes HTML in questions and answers', () => {
  const html = faqItemsToHtml([{ question: '<b>Bold?</b>', answer: 'A & B' }]);
  assert.equal(
    html,
    '<div class="faq-block"><h2>Frequently Asked Questions</h2>'
      + '<h3>&lt;b&gt;Bold?&lt;/b&gt;</h3><p>A &amp; B</p></div>',
  );
});

test('faqItemsFromHtml parses the faq-block div and the plain h2 section', () => {
  assert.deepEqual(faqItemsFromHtml(FAQ_HTML), FAQ_ITEMS);
  assert.deepEqual(faqItemsFromHtml(PLAIN_FAQ), [FAQ_ITEMS[0]]);
  assert.deepEqual(faqItemsFromHtml('<p>No FAQ here</p>'), []);
});

test('faqItemsToHtml / faqItemsFromHtml round-trip', () => {
  assert.deepEqual(faqItemsFromHtml(faqItemsToHtml(FAQ_ITEMS)), FAQ_ITEMS);
});

// ── One FAQ per post ──

test('hasFaqSection detects both FAQ forms', () => {
  assert.equal(hasFaqSection(FAQ_HTML), true);
  assert.equal(hasFaqSection(PLAIN_FAQ), true);
  assert.equal(hasFaqSection('<h2>Not a FAQ</h2><p>text</p>'), false);
  assert.equal(hasFaqSection(''), false);
});

test('stripEmptyFaqBlocks removes only empty faq-block divs', () => {
  const empty = '<div class="faq-block"><h2>Frequently Asked Questions</h2></div>';
  const { html, removed } = stripEmptyFaqBlocks(`${empty}<p>Keep</p>${FAQ_HTML}`);
  assert.equal(removed, 1);
  assert.equal(html, `<p>Keep</p>${FAQ_HTML}`);
  // A plain h2 FAQ section is never stripped (its questions might be in
  // a shape this helper cannot parse — deleting them would lose content).
  const plain = stripEmptyFaqBlocks(PLAIN_FAQ);
  assert.equal(plain.removed, 0);
  assert.equal(plain.html, PLAIN_FAQ);
});

test('ensureSingleFaqSection keeps the first section, removes later ones', () => {
  const twoDivs = `${FAQ_HTML}<p>Middle</p>${FAQ_HTML}`;
  const { html, removed } = ensureSingleFaqSection(twoDivs);
  assert.equal(removed, 1);
  assert.equal(html, `${FAQ_HTML}<p>Middle</p>`);

  const divThenPlain = `${FAQ_HTML}${PLAIN_FAQ}`;
  const second = ensureSingleFaqSection(divThenPlain);
  assert.equal(second.removed, 1);
  // The later FAQ section goes, but the unrelated "Next section" after it stays.
  assert.equal(second.html, `${FAQ_HTML}<h2>Next section</h2><p>After.</p>`);

  const plainThenDiv = `${PLAIN_FAQ}${FAQ_HTML}`;
  const third = ensureSingleFaqSection(plainThenDiv);
  assert.equal(third.removed, 1);
  assert.equal(third.html, PLAIN_FAQ);

  assert.deepEqual(ensureSingleFaqSection(FAQ_HTML), { html: FAQ_HTML, removed: 0 });
  assert.deepEqual(ensureSingleFaqSection('<p>Nothing</p>'), { html: '<p>Nothing</p>', removed: 0 });
});

test('sanitizeBlogBlocks combines all three cleanups', () => {
  const html = '<p>Intro</p>'
    + '<pre class="prompt-block"><code></code></pre>'
    + '<div class="faq-block"><h2>Frequently Asked Questions</h2></div>'
    + FAQ_HTML
    + PLAIN_FAQ
    + '<pre class="prompt-block"><code>Real prompt</code></pre>';
  const result = sanitizeBlogBlocks(html);
  assert.equal(result.removedEmptyPrompts, 1);
  assert.equal(result.removedEmptyFaqs, 1);
  assert.equal(result.removedExtraFaqs, 1);
  assert.equal(
    result.html,
    `<p>Intro</p>${FAQ_HTML}<h2>Next section</h2><p>After.</p><pre class="prompt-block"><code>Real prompt</code></pre>`,
  );
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

test('createBlogPost keeps one FAQ section and strips empty blocks', async () => {
  const withDup = '<p>Intro</p>'
    + FAQ_HTML
    + '<h2>Frequently Asked Questions</h2><h3>Q2?</h3><p>A2.</p>'
    + '<pre class="prompt-block"><code></code></pre>'
    + '<pre class="prompt-block"><code>Real prompt</code></pre>';
  const expected = `<p>Intro</p>${FAQ_HTML}<pre class="prompt-block"><code>Real prompt</code></pre>`;

  await createBlogPost({
    slug: 'test-post',
    title: 'Test post',
    content: withDup,
    contentHtml: withDup,
    contentText: 'Intro text',
    status: 'draft',
  });

  assert.equal(captured.length, 1);
  const values = captured[0];
  assert.equal(values[3], expected);
  assert.equal(values[4], expected);
  assert.equal(values[5], 'IntroFrequently Asked QuestionsWhat is this?An answer.Second?Another answer.Real prompt');
});
