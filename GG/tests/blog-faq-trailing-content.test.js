import assert from 'node:assert/strict';
import { test } from 'node:test';

import { convertInlineFaqToAccordion } from '../src/lib/blog-content.js';

// Regression test (2026-11-18): the plain-h2 FAQ path rebuilt the FAQ
// section from the matched Q&A pairs alone and silently deleted anything
// after the last answer up to the next heading. That ate the
// quotable-facts blockquote on the Anniversary post: it is in the saved
// HTML but never reached the live page. A Quick answer box placed after
// an FAQ section would be eaten the same way.

const PLAIN_FAQ_WITH_BLOCKQUOTE = '<h2>Frequently Asked Questions</h2>'
  + '<h3>What is this?</h3><p>An answer.</p>'
  + '<h3>Second?</h3><p>Another answer.</p>'
  + '<blockquote><p>Anniversary facts worth knowing: the 1st anniversary is paper.</p></blockquote>'
  + '<h2>Conclusion</h2><p>Done.</p>';

test('plain-h2 FAQ keeps content after the last answer', () => {
  const out = convertInlineFaqToAccordion(PLAIN_FAQ_WITH_BLOCKQUOTE);
  assert.match(out, /article-faq-list/);
  assert.match(out, /Anniversary facts worth knowing/);
  assert.match(out, /<h2>Conclusion<\/h2>/);
  // The blockquote stays between the accordion and the Conclusion heading.
  assert.ok(out.indexOf('Anniversary facts') > out.indexOf('article-faq-list'));
  assert.ok(out.indexOf('Anniversary facts') < out.indexOf('<h2>Conclusion</h2>'));
});

test('plain-h2 FAQ at end of document keeps trailing blockquote', () => {
  const html = '<h2>Frequently Asked Questions</h2><h3>Q?</h3><p>A.</p><blockquote><p>Keep me.</p></blockquote>';
  const out = convertInlineFaqToAccordion(html);
  assert.match(out, /Keep me/);
  assert.match(out, /article-faq-list/);
});

test('faq-block div path keeps trailing content (no regression)', () => {
  const html = '<div class="faq-block"><h2>Frequently Asked Questions</h2><h3>Q?</h3><p>A.</p></div><blockquote><p>Keep me.</p></blockquote><h2>Conclusion</h2>';
  const out = convertInlineFaqToAccordion(html);
  assert.match(out, /Keep me/);
  assert.match(out, /<h2>Conclusion<\/h2>/);
});

test('FAQ with no trailing content keeps its shape', () => {
  const html = '<h2>Frequently Asked Questions</h2><h3>Q?</h3><p>A.</p><h2>Next</h2><p>After.</p>';
  const out = convertInlineFaqToAccordion(html);
  assert.match(out, /article-faq-list/);
  assert.match(out, /<h2>Next<\/h2>/);
  assert.match(out, /After\./);
});

test('no FAQ section returns input unchanged', () => {
  const html = '<h2>Intro</h2><p>Hello.</p><blockquote><p>Quote.</p></blockquote>';
  assert.equal(convertInlineFaqToAccordion(html), html);
});
