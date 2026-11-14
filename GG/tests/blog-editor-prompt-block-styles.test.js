import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Regression tests for the fullscreen prompt-box bug (2026-11-14/15):
// live evidence (2026-11-15, Birthday post): in NORMAL mode all 12
// prompt boxes render fine; in FULLSCREEN every prompt box VANISHES
// (blank white gap, no box/label/Copy button). Two guards: (1) the
// editor stylesheet pins an explicit dark background + light text for
// pre.prompt-block, so the prompt text can never render light-on-white;
// (2) BlockEditor forces the editor view to rebuild after a programmatic
// setContent; (3) the render is a SINGLE tree — fullscreen is only a
// class-name change, never a separate return that unmounts and remounts
// <EditorContent> (TipTap clears all node views on unmount and the
// remount never re-subscribes the portal registry, so the prompt-block
// node views never came back in fullscreen).

const css = readFileSync(
  new URL('../src/components/ui/editor-styles.css', import.meta.url),
  'utf8',
);
const editor = readFileSync(
  new URL('../src/components/ui/BlockEditor.jsx', import.meta.url),
  'utf8',
);

test('editor stylesheet pins explicit dark prompt-block colours', () => {
  const rule = css.match(/pre\.prompt-block\s*\{[^}]*\}/);
  assert.ok(
    rule,
    'expected an explicit pre.prompt-block rule in editor-styles.css',
  );
  assert.match(rule[0], /background:\s*#1d2327/);
  assert.match(rule[0], /color:\s*#f0f0f1/);
});

test('BlockEditor rebuilds the view after programmatic setContent', () => {
  assert.match(editor, /updateState\(view\.state\)/);
  // All three content paths refresh: mount, external-value sync, imperative handle.
  const calls = editor.match(/refreshEditorView\(editor\)/g) || [];
  assert.ok(
    calls.length >= 3,
    `expected refreshEditorView on all three content paths, found ${calls.length}`,
  );
});

test('fullscreen toggle never unmounts EditorContent (single render tree)', () => {
  // Regression test for the live fullscreen bug (2026-11-15): toggling
  // fullscreen used to be a separate early return, which unmounted and
  // remounted <EditorContent>; TipTap clears all node views on unmount
  // and the remount never re-subscribes the portal registry, so every
  // prompt-block node view vanished in fullscreen. The render must be
  // one tree whose fullscreen state is only class names.
  assert.doesNotMatch(
    editor,
    /if\s*\(\s*isFullscreen\s*\)\s*\{/,
    'fullscreen must not be a separate early-return branch',
  );
  // Fullscreen is a class-name switch on the single outer wrapper.
  assert.match(editor, /isFullscreen\s*\n?\s*\?\s*'fixed inset-0/);
  // Exactly one <EditorContent> mount point in the component code
  // (the other match is the explanatory comment above the return).
  const mounts = editor.match(/<EditorContent editor=\{editor\}/g) || [];
  assert.equal(mounts.length, 1, `expected a single <EditorContent>, found ${mounts.length}`);
  // The fullscreen header is always rendered (hidden in normal mode),
  // so the tree shape never changes across the toggle.
  assert.match(editor, /Block Editor — Fullscreen/);
  assert.match(editor, /: 'hidden'/);
});
