import assert from 'node:assert/strict';
import { test } from 'node:test';

import { enhancePromptBlocks, getPromptHeadings } from '../src/lib/blog-content.js';

// Regression tests for the theme-aware prompt-box redesign (2026-11-13):
// the public post renders each <pre class="prompt-block"> as a copy box
// whose header carries the prompt title + "Best for" line and a small pill
// Copy button, with a persistent "Copied — <title>" caption that names
// the prompt (replacing the old full-width orange button below the text
// and the 2-second toast that never said which prompt was copied).
// The box follows the site theme via CSS vars (light in light mode, dark
// in dark mode); the CSS itself is not asserted here, only the HTML the
// renderer emits. Fixture mirrors the Birthday post's shape: numbered h3
// titles, "Best for" paragraphs, images, and pre blocks with no data-title.

const BIRTHDAY_SHAPED = [
  '<pre class="prompt-block"><code>Orphan prompt with no heading above it.</code></pre>',
  '<h2>Quick Start Birthday AI Photo Prompts</h2>',
  '<p>Copy one of these three, attach a clear photo of yourself, and send.</p>',
  '<h3>1. Elegant Birthday Portrait</h3>',
  '<p>Best for: A profile photo, a birthday post, or a framed print.</p>',
  '<img src="https://example.com/portrait.webp" alt="birthday portrait">',
  '<pre class="prompt-block"><code>Create a photorealistic birthday portrait of a young woman.</code></pre>',
  '<p><strong>Why it works:</strong> One subject, one cake.</p>',
  '<h3>2. Lively Birthday Party Scene</h3>',
  '<p>Best for: A party album cover.</p>',
  '<img src="https://example.com/party.webp" alt="birthday party">',
  '<pre class="prompt-block" data-title="Party Scene (Custom Title)"><code>Create a lively birthday party scene with balloons.</code></pre>',
  '<pre><code>const x = 1;</code></pre>',
  '<h3>3. The "Best" Shot</h3>',
  '<p>Best for: The birthday card.</p>',
  '<pre class="prompt-block"><code>Take the best shot.</code></pre>',
].join('');

test('getPromptHeadings finds numbered headings with their Best for lines', () => {
  const headings = getPromptHeadings(BIRTHDAY_SHAPED);
  assert.equal(headings.length, 3);
  assert.equal(headings[0].title, 'Elegant Birthday Portrait');
  assert.equal(headings[0].bestFor, 'Best for: A profile photo, a birthday post, or a framed print.');
  assert.equal(headings[1].title, 'Lively Birthday Party Scene');
  assert.equal(headings[1].bestFor, 'Best for: A party album cover.');
  assert.equal(headings[2].title, 'The "Best" Shot');
  assert.equal(headings[2].bestFor, 'Best for: The birthday card.');
});

test('enhancePromptBlocks wraps each prompt in a header + pill + caption box', () => {
  const out = enhancePromptBlocks(BIRTHDAY_SHAPED);
  assert.equal((out.match(/prompt-code-shell/g) || []).length, 4);
  assert.equal((out.match(/article-prompt-header/g) || []).length, 4);
  assert.equal((out.match(/article-copy-caption/g) || []).length, 4);
  assert.equal((out.match(/data-copy-code/g) || []).length, 5);
  // The <pre> itself is untouched, so the gallery layout still counts it.
  assert.equal((out.match(/class="prompt-block"/g) || []).length, 4);
});

test('prompt titles: heading title, data-title wins, Prompt N fallback', () => {
  const out = enhancePromptBlocks(BIRTHDAY_SHAPED);
  // No heading above the first block: numbered fallback, no Best for line.
  assert.match(out, /<h3 class="article-prompt-title">Prompt 1<\/h3>/);
  assert.doesNotMatch(out, /Prompt 1<\/h3>\s*<p class="article-prompt-bestfor">/);
  // Heading title + Best for line in the header.
  assert.match(out, /<h3 class="article-prompt-title">Elegant Birthday Portrait<\/h3>/);
  assert.match(out, /<p class="article-prompt-bestfor">Best for: A profile photo, a birthday post, or a framed print\.<\/p>/);
  // data-title beats the heading above the block.
  assert.match(out, /<h3 class="article-prompt-title">Party Scene \(Custom Title\)<\/h3>/);
  assert.match(out, /data-copy-title="Party Scene \(Custom Title\)"/);
  assert.match(out, /aria-label="Copy Party Scene \(Custom Title\)"/);
});

test('copy button is a pill with icons and the caption names the prompt', () => {
  const out = enhancePromptBlocks(BIRTHDAY_SHAPED);
  assert.match(out, /article-copy-icon-copy/);
  assert.match(out, /article-copy-icon-check/);
  assert.match(out, /<span class="article-copy-label">Copy<\/span>/);
  assert.match(out, /<p class="article-copy-caption" role="status">✓ Copied — Elegant Birthday Portrait<\/p>/);
  assert.match(out, /<p class="article-copy-caption" role="status">✓ Copied — Prompt 1<\/p>/);
});

test('prompt text is preserved verbatim inside the box', () => {
  const out = enhancePromptBlocks(BIRTHDAY_SHAPED);
  assert.match(out, /<code>Create a photorealistic birthday portrait of a young woman\.<\/code>/);
  assert.match(out, /<code>Orphan prompt with no heading above it\.<\/code>/);
});

test('titles with quotes are escaped in attributes', () => {
  const out = enhancePromptBlocks(BIRTHDAY_SHAPED);
  assert.match(out, /data-copy-title="The &quot;Best&quot; Shot"/);
  // The title is escaped everywhere it is interpolated (element content
  // renders identically, so escaping there is safe too).
  assert.match(out, /<h3 class="article-prompt-title">The &quot;Best&quot; Shot<\/h3>/);
  assert.match(out, /<p class="article-copy-caption" role="status">✓ Copied — The &quot;Best&quot; Shot<\/p>/);
  assert.doesNotMatch(out, /data-copy-title="The "Best" Shot"/);
});

test('plain code blocks keep the old shape (button above the code, no caption)', () => {
  const out = enhancePromptBlocks(BIRTHDAY_SHAPED);
  assert.match(
    out,
    /<div class="article-code-shell"><button type="button" class="article-copy-button" data-copy-code aria-label="Copy">Copy<\/button><pre><code>const x = 1;<\/code><\/pre><\/div>/,
  );
});

test('empty input stays empty and non-prompt HTML passes through', () => {
  assert.equal(enhancePromptBlocks(''), '');
  assert.equal(enhancePromptBlocks('<p>Hello</p>'), '<p>Hello</p>');
});
