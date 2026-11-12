import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';

import { PromptBlock } from './editor-prompt-block';
import { FaqBlock } from './editor-faq-block';

/**
 * Returns the TipTap extensions array for the BlogForm block editor.
 * All packages are free / open-source — no paid TipTap services.
 */
export function createExtensions({ placeholder = 'Write your blog post…' } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // No class override here: plain code blocks stay plain <pre><code>.
      // Prompt blocks are the separate PromptBlock node, which renders
      // <pre class="prompt-block"> itself. (Before Batch A, StarterKit's
      // codeBlock carried the prompt-block class — old saved HTML already
      // has the class, so it still parses back as a PromptBlock.)
    }),
    PromptBlock,
    FaqBlock,
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { class: 'editor-link' },
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { class: 'editor-image' },
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Placeholder.configure({
      placeholder,
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}
