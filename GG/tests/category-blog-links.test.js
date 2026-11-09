import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { PROMPT_CATEGORY_BLOG_LINKS } from '../src/lib/prompt-constants.js';

test('every prompt category has the requested related blog destination', () => {
  assert.deepEqual(Object.keys(PROMPT_CATEGORY_BLOG_LINKS), [
    'men',
    'women',
    'couples',
    'celebrations',
    'business',
    'lifestyle',
    'cinematic',
    'photo-editing',
  ]);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(PROMPT_CATEGORY_BLOG_LINKS).map(([category, link]) => [category, link.href]),
    ),
    {
      men: '/blog/chatgpt-image-prompts-for-men-for-cinematic-ai-photos',
      women: '/blog/luxury-ai-fashion-photography-prompts-for-women',
      couples: '/blog/9-couple-ai-photo-editing-prompts-copy-and-paste',
      celebrations: '/blog/birthday-ai-photo-prompts-copy-paste',
      business: '/blog/luxury-businessman-ai-portrait-prompts',
      lifestyle: '/blog/luxury-travel-ai-portrait-prompts',
      cinematic: '/blog/master-level-ai-prompts-luxury-cinematic-portraits',
      'photo-editing': '/blog/chatgpt-photo-editing',
    },
  );
});

test('category hubs and prompt detail pages render their mapped blog link', async () => {
  const source = await readFile(
    new URL('../src/components/prompts/PromptPages.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /PROMPT_CATEGORY_BLOG_LINKS\[category\.slug\]/);
  assert.match(source, /PROMPT_CATEGORY_BLOG_LINKS\[publicCategory\.slug\]/);
  assert.match(source, /From the blog/);
});
