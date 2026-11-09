import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePrompt } from '../src/lib/prompts-db.js';

test('prompt normalization preserves editorial line breaks and splits comma-separated tools', () => {
  const prompt = normalizePrompt({
    title: 'Silk Waves AI Prompt',
    slug: 'silk-waves',
    prompt: 'Create a portrait.',
    intro: 'First paragraph.\n\nSecond paragraph with\nan authored line break.',
    tools: 'ChatGPT, Midjourney, Flux',
    tags: ['silk waves', 'photorealistic', 'gold watch', 'portrait'],
  });

  assert.equal(prompt.intro, 'First paragraph.\n\nSecond paragraph with\nan authored line break.');
  assert.deepEqual(prompt.tools, ['ChatGPT', 'Midjourney', 'Flux']);
  assert.deepEqual(prompt.tags, ['silk waves', 'photorealistic', 'gold watch', 'portrait']);
});
