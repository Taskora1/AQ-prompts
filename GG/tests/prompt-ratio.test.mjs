import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { isSupportedAspectRatio, withAspectRatio } from '../src/lib/prompt-ratio.js';

test('ratio personalization keeps the space before the following prompt word', () => {
  const fragments = [
    'composition',
    'framing',
    'frame',
    'portrait',
    'vertical',
    'studio',
  ];

  for (const fragment of fragments) {
    assert.equal(
      withAspectRatio(`vertical 9:16 ${fragment}.`, '4:5'),
      `vertical 4:5 aspect ratio ${fragment}.`,
    );
  }
});

test('ratio personalization replaces existing ratio phrases and retains spacing', () => {
  assert.equal(
    withAspectRatio('portrait, aspect ratio 9:16 composition.', '1:1'),
    'portrait, 1:1 aspect ratio composition.',
  );
  assert.equal(
    withAspectRatio('portrait, 9:16 aspect ratio composition.', '16:9'),
    'portrait, 16:9 aspect ratio composition.',
  );
  assert.equal(withAspectRatio('portrait, 9:16', '4:5'), 'portrait, 4:5 aspect ratio');
});

test('ratio personalization appends a ratio when none is present', () => {
  assert.equal(withAspectRatio('A portrait prompt.', '4:5'), 'A portrait prompt., aspect ratio 4:5');
  assert.equal(withAspectRatio('', '4:5'), 'aspect ratio 4:5');
});

// The copy-controls component (PromptCopyControls.jsx) was removed by the
// prompt-box redesign: prompt-box copying now runs through the blog-content
// shells + CopyGate in SinglePostPage.jsx, so there is no separate copy
// component left to share the ratio personalization with. The display path
// still personalizes the ratio — that is what this test pins now.
test('aspect ratio personalization is applied by the prompt display', async () => {
  const detail = await readFile(
    new URL('../src/components/prompts/PromptDetailExperience.jsx', import.meta.url),
    'utf8',
  );

  assert.match(detail, /withAspectRatio\(plainPrompt, selectedRatio\)/);
});

test('aspect ratio normalization accepts only supported values', () => {
  assert.equal(isSupportedAspectRatio('9/16'), '9:16');
  assert.equal(isSupportedAspectRatio('3:2'), '');
});
