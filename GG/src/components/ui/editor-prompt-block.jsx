// Prompt block — the real WordPress-style block for an AI prompt.
// A TipTap node (not a plain codeBlock): a title plus the prompt text.
// It renders to exactly the HTML the public page already understands —
// <pre class="prompt-block" data-title="…"><code>…</code></pre> — so
// ArticleBody, the copy UI and the empty-block strip keep working
// unchanged, and old posts load back into this node (parse rule priority
// 100 beats StarterKit's plain codeBlock rule for pre.prompt-block).
// The editor shows a card with a title field and the editable prompt;
// an empty prompt shows a warning and is still stripped on save (the
// server backstop in blog-db / BlogForm).

import { useEffect, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react';

function PromptBlockView({ node, updateAttributes, deleteNode }) {
  const [title, setTitle] = useState(node.attrs.title || '');
  // Keep the local title in sync when the attribute changes from outside
  // (undo, setContent, another view).
  useEffect(() => {
    setTitle(node.attrs.title || '');
  }, [node.attrs.title]);

  const text = node.textContent || '';
  const isEmpty = !text.trim();

  return (
    <NodeViewWrapper className="prompt-block-node">
      <div
        className="flex items-center gap-2 rounded-t border border-b-0 border-[#8c8f94] bg-[#f6f7f7] px-3 py-1.5"
        contentEditable={false}
      >
        <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-[#2271b1]">
          Prompt
        </span>
        <input
          type="text"
          value={title}
          placeholder="Prompt title (optional)"
          aria-label="Prompt title"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            if (title !== (node.attrs.title || '')) updateAttributes({ title: title.trim() });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-[#1d2327] outline-none focus:border-[#2271b1] focus:bg-white"
        />
        <button
          type="button"
          aria-label="Delete prompt block"
          title="Delete prompt block"
          onClick={() => deleteNode()}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-[#b32d2e] hover:bg-[#fbeaea]"
        >
          Delete
        </button>
      </div>
      <pre className="prompt-block">
        <code>
          <NodeViewContent />
        </code>
      </pre>
      {isEmpty && (
        <div className="rounded-b border border-t-0 border-[#8c8f94] bg-[#fcf0f1] px-3 py-1.5 text-xs text-[#b32d2e]">
          This prompt is empty — it will not be saved. Write the prompt or
          delete this block.
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const PromptBlock = Node.create({
  name: 'promptBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  defining: true,

  addAttributes() {
    return {
      title: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre.prompt-block',
        priority: 100,
        getAttrs: (element) => ({
          title: element.getAttribute('data-title') || '',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'pre',
      mergeAttributes(HTMLAttributes, {
        class: 'prompt-block',
        'data-title': node.attrs.title || '',
      }),
      ['code', 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PromptBlockView);
  },

  addKeyboardShortcuts() {
    return {
      // Mod+Enter leaves the prompt block into a fresh paragraph below it.
      'Mod-Enter': ({ editor }) => {
        const { $from } = editor.state.selection;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name !== 'promptBlock') continue;
          const pos = $from.after(depth);
          return editor
            .chain()
            .focus()
            .insertContentAt(pos, { type: 'paragraph' })
            .setTextSelection(pos + 1)
            .run();
        }
        return false;
      },
    };
  },
});

// Toggle the current block between a paragraph and a prompt block (keeps
// its text, like the old codeBlock toggle did).
export function togglePromptBlock(editor) {
  if (!editor) return false;
  if (editor.isActive('promptBlock')) {
    return editor.chain().focus().setParagraph().run();
  }
  return editor.chain().focus().setNode('promptBlock', { title: '' }).run();
}
