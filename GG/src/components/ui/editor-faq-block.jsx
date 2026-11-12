// FAQ block — the real WordPress-style block for the post's FAQ section.
// A TipTap atom node: its content is the items attribute (an array of
// {question, answer}), edited in a NodeView card. It renders to exactly
// the HTML the public page already understands —
// <div class="faq-block"><h2>Frequently Asked Questions</h2>
// <h3>Q</h3><p>A</p> … </div> — which convertInlineFaqToAccordion turns
// into a <details> accordion. Old posts (a plain h2 FAQ section, no div)
// keep rendering through the same converter; only one FAQ section per
// post is allowed (editor button + ensureSingleFaqSection on save).

import { useEffect, useState } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

import { faqItemsFromHtml } from '../../lib/blog-content.js';

function FaqBlockView({ node, updateAttributes, deleteNode }) {
  const [items, setItems] = useState(() =>
    (node.attrs.items || []).map((item) => ({
      question: item?.question || '',
      answer: item?.answer || '',
    })),
  );
  // Keep the local draft in sync when the attribute changes from outside
  // (undo, setContent, another view).
  useEffect(() => {
    setItems(
      (node.attrs.items || []).map((item) => ({
        question: item?.question || '',
        answer: item?.answer || '',
      })),
    );
  }, [node.attrs.items]);

  const commit = (next) => {
    setItems(next);
    updateAttributes({
      items: next
        .map((item) => ({
          question: String(item.question || '').trim(),
          answer: String(item.answer || '').trim(),
        }))
        .filter((item) => item.question && item.answer),
    });
  };

  const setPair = (index, field, value) => {
    const next = items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item,
    );
    setItems(next);
  };

  return (
    <NodeViewWrapper className="faq-block-node">
      <div className="rounded border border-[#8c8f94] bg-[#f6f7f7] p-3">
        <div
          className="flex items-center justify-between gap-2"
          contentEditable={false}
        >
          <span className="text-xs font-bold uppercase tracking-wide text-[#2271b1]">
            FAQ — one section per post
          </span>
          <button
            type="button"
            aria-label="Delete FAQ block"
            title="Delete FAQ block"
            onClick={() => deleteNode()}
            className="rounded px-1.5 py-0.5 text-xs font-semibold text-[#b32d2e] hover:bg-[#fbeaea]"
          >
            Delete
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="rounded border border-[#dcdcde] bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[#1d2327]">
                  Question {index + 1}
                </label>
                {items.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove question ${index + 1}`}
                    onClick={() => commit(items.filter((_, i) => i !== index))}
                    className="rounded px-1.5 py-0.5 text-xs font-semibold text-[#b32d2e] hover:bg-[#fbeaea]"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                value={item.question}
                placeholder="Question"
                aria-label={`Question ${index + 1}`}
                onChange={(event) => setPair(index, 'question', event.target.value)}
                onBlur={() => commit(items)}
                className="mt-1 w-full rounded border border-[#8c8f94] bg-white px-2 py-1.5 text-sm text-[#1d2327] outline-none focus:border-[#2271b1]"
              />
              <label className="mt-2 block text-xs font-semibold text-[#1d2327]">
                Answer
              </label>
              <textarea
                value={item.answer}
                placeholder="Answer"
                aria-label={`Answer ${index + 1}`}
                rows={2}
                onChange={(event) => setPair(index, 'answer', event.target.value)}
                onBlur={() => commit(items)}
                className="mt-1 w-full rounded border border-[#8c8f94] bg-white px-2 py-1.5 text-sm text-[#1d2327] outline-none focus:border-[#2271b1]"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => commit([...items, { question: '', answer: '' }])}
          className="mt-3 inline-flex h-8 items-center rounded border border-[#8c8f94] bg-white px-3 text-xs font-semibold text-[#2c3338] hover:bg-[#f0f0f1]"
        >
          + Add question
        </button>
        <p className="mt-2 text-xs text-[#646970]">
          Empty questions are dropped when you save. The first FAQ section
          is the only one kept — a second one is removed on save.
        </p>
      </div>
    </NodeViewWrapper>
  );
}

export const FaqBlock = Node.create({
  name: 'faqBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      items: { default: [] },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.faq-block',
        getAttrs: (element) => ({
          items: faqItemsFromHtml(element.outerHTML),
        }),
      },
    ];
  },

  // Mirror of faqItemsToHtml (blog-content.js): h2 heading plus an h3
  // question + p answer per item. Keep the two in sync — the pure-helper
  // tests lock the string form, this locks the node form.
  renderHTML({ node }) {
    const items = (node.attrs.items || [])
      .map((item) => ({
        question: String(item?.question || '').trim(),
        answer: String(item?.answer || '').trim(),
      }))
      .filter((item) => item.question && item.answer);
    return [
      'div',
      { class: 'faq-block' },
      ['h2', {}, 'Frequently Asked Questions'],
      ...items.flatMap((item) => [
        ['h3', {}, item.question],
        ['p', {}, item.answer],
      ]),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FaqBlockView);
  },
});

// Insert an FAQ block at the cursor (one empty Q&A pair to start).
export function insertFaqBlock(editor) {
  if (!editor) return false;
  return editor
    .chain()
    .focus()
    .insertContent({
      type: 'faqBlock',
      attrs: { items: [{ question: '', answer: '' }] },
    })
    .run();
}
