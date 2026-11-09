import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';

import PromptIntroContent from '../src/components/prompts/PromptIntroContent.js';

test('prompt intro renders rich formatting while dropping unsafe markup and links', () => {
  const html = renderToStaticMarkup(createElement(PromptIntroContent, {
    intro: '<p style="text-align: center"><strong>Bold intro</strong> <a href="javascript:alert(1)" onclick="alert(1)">unsafe link</a><script>alert(1)</script></p>',
  }));

  assert.match(html, /<p style="text-align:center"><strong>Bold intro<\/strong>/);
  assert.match(html, /<a class="text-orange-600 underline dark:text-orange-400">unsafe link<\/a>/);
  assert.doesNotMatch(html, /script|javascript:|onclick=/i);
});

test('prompt intro preserves legacy plain-text paragraphs', () => {
  const html = renderToStaticMarkup(createElement(PromptIntroContent, {
    intro: 'First paragraph.\n\nSecond paragraph.',
  }));

  assert.match(html, /<p class="whitespace-pre-line">First paragraph\.<\/p>/);
  assert.match(html, /<p class="whitespace-pre-line">Second paragraph\.<\/p>/);
});

test('prompt intro converts Markdown links in existing plain-text intros', () => {
  const html = renderToStaticMarkup(createElement(PromptIntroContent, {
    intro: 'Explore the [men AI photo prompts](https://aqprompts.com/tools/ai-image-prompts/men) collection and [another prompt](https://aqprompts.com/tools/ai-image-prompts/p/example).',
  }));

  assert.match(html, /<a href="https:\/\/aqprompts\.com\/tools\/ai-image-prompts\/men" target="_blank" rel="noopener noreferrer" class="text-orange-600 underline dark:text-orange-400">men AI photo prompts<\/a>/);
  assert.match(html, /<a href="https:\/\/aqprompts\.com\/tools\/ai-image-prompts\/p\/example" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /\]\(https:/);
});

test('prompt intro does not turn unsafe Markdown destinations into active links', () => {
  const html = renderToStaticMarkup(createElement(PromptIntroContent, {
    intro: 'Do not open [this](javascript:alert(1)).',
  }));

  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /\[this\]\(javascript:alert\(1\)\)/);
});
