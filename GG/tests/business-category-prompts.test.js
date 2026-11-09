import assert from 'node:assert/strict';
import { test } from 'node:test';

import { filterCategoryListingPrompts } from '../src/lib/prompt-constants.js';

const publishedBusinessPrompts = [
  {
    title: 'Adult Founder Business Portrait',
    prompt: 'Professional founder portrait in a bright office.',
    slug: 'adult-founder-business-portrait',
  },
  {
    title: 'Celebrity Executive Business Portrait',
    prompt: 'A professional executive portrait in an office.',
    slug: 'celebrity-executive-business-portrait',
  },
];

test('category listings include complete published prompts regardless of indexing eligibility', () => {
  const prompts = filterCategoryListingPrompts([
    ...publishedBusinessPrompts,
    {
      title: 'Draft prompt',
      prompt: 'Draft content.',
      slug: 'draft-prompt',
      status: 'draft',
    },
    {
      title: 'Incomplete prompt',
      prompt: '',
      slug: 'incomplete-prompt',
      status: 'published',
    },
  ]);

  assert.deepEqual(prompts, publishedBusinessPrompts);
});
