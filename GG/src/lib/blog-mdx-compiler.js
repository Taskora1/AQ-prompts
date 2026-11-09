/**
 * Shared MDX compilation module.
 *
 * Extracted from scripts/build-content.mjs to ensure the migration script
 * and the production build produce IDENTICAL HTML output.
 *
 * Uses:
 * - @mdx-js/mdx (evaluate) — MDX → React components
 * - remark-gfm — GitHub Flavored Markdown (tables, strikethrough, task lists)
 * - rehype plugins — heading IDs, table wrappers, class normalization
 * - react-dom/server — React → static HTML
 *
 * Usage:
 *   import { compileMdxContent } from '@/lib/blog-mdx-compiler';
 *   const { html, headings, embeds } = await compileMdxContent(markdownBody);
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { evaluate } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import * as jsxRuntime from 'react/jsx-runtime';

// ── Helpers ─────────────────────────────────────────────────────────────

function normalizeMdxAttributeValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    return String(value.value ?? '').trim();
  }
  return '';
}

function getNodeText(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.value === 'string') return node.value;
  if (!Array.isArray(node.children)) return '';
  return node.children.map(getNodeText).join('');
}

function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Remark / Rehype Plugins ─────────────────────────────────────────────

/**
 * Collects YouTubeEmbed MDX JSX elements and extracts their attributes.
 */
function createRemarkYouTubeCollector(embeds = []) {
  return () => (tree) => {
    visit(tree, (node) => {
      if (node?.type !== 'mdxJsxFlowElement' || node?.name !== 'YouTubeEmbed') {
        return;
      }

      const attributes = {};

      for (const attr of Array.isArray(node.attributes) ? node.attributes : []) {
        if (attr?.type !== 'mdxJsxAttribute' || !attr?.name) continue;
        attributes[attr.name] = normalizeMdxAttributeValue(attr.value);
      }

      embeds.push(attributes);
    });
  };
}

/**
 * Normalizes MDX JSX attributes:
 * - Converts `class` to `className`
 * - Converts `<p>` flow elements to `<div>` to prevent nested paragraphs
 */
function createRemarkClassNameNormalizer() {
  return () => (tree) => {
    visit(tree, (node) => {
      if (
        node?.type !== 'mdxJsxFlowElement' &&
        node?.type !== 'mdxJsxTextElement'
      ) {
        return;
      }

      for (const attr of Array.isArray(node.attributes) ? node.attributes : []) {
        if (attr?.type === 'mdxJsxAttribute' && attr?.name === 'class') {
          attr.name = 'className';
        }
      }

      // Block-level <p> wrappers in MDX often end up nesting paragraphs.
      // Convert them to <div> so editor-generated callouts/cards stay valid.
      if (node?.type === 'mdxJsxFlowElement' && node?.name === 'p') {
        node.name = 'div';
      }
    });
  };
}

/**
 * Adds `id` attributes to headings for TOC generation.
 * Wraps tables in a `<div class="table-wrapper">`.
 * Converts `class` to `className` on standard HTML elements.
 */
function createRehypeContentDecorator(headings = []) {
  return () => (tree) => {
    const seenHeadingIds = new Map();

    visit(tree, 'element', (node, index, parent) => {
      if (!node || typeof node !== 'object') return;

      if (/^h[1-4]$/.test(String(node.tagName || ''))) {
        const text = getNodeText(node).replace(/\s+/g, ' ').trim();
        if (!text) return;

        const baseSlug = slugify(text) || `section-${headings.length + 1}`;
        const duplicateCount = seenHeadingIds.get(baseSlug) || 0;
        const slugValue = duplicateCount === 0 ? baseSlug : `${baseSlug}-${duplicateCount + 1}`;

        seenHeadingIds.set(baseSlug, duplicateCount + 1);
        node.properties = { ...(node.properties || {}), id: slugValue };

        headings.push({
          id: slugValue,
          type: `heading_${Math.min(4, Number(String(node.tagName).slice(1)) || 2)}`,
          level: Number(String(node.tagName).slice(1)) || 2,
          text,
          slug: slugValue,
        });

        return;
      }

      if (node.properties && 'class' in node.properties && !('className' in node.properties)) {
        const value = node.properties.class;
        node.properties.className = Array.isArray(value)
          ? value
          : String(value || '')
              .split(/\s+/)
              .filter(Boolean);
        delete node.properties.class;
      }

      if (node.tagName === 'table' && parent && typeof index === 'number') {
        parent.children[index] = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['table-wrapper'] },
          children: [node],
        };
      }
    });
  };
}

// ── Server Components ───────────────────────────────────────────────────

/**
 * Server-side YouTube embed component.
 * Renders an iframe for the YouTube video.
 */
function ServerYouTubeEmbed({
  videoId = '',
  title = 'YouTube video',
  className = '',
  start = 0,
}) {
  const safeVideoId = String(videoId || '').trim();
  if (!safeVideoId) return null;

  const safeStart = Number.isFinite(Number.parseInt(String(start || 0), 10))
    ? Math.max(0, Number.parseInt(String(start || 0), 10))
    : 0;

  const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(safeVideoId)}?rel=0&modestbranding=1${safeStart > 0 ? `&start=${safeStart}` : ''}`;

  const classTokens = new Set(
    ['youtube-embed', 'my-8', ...String(className || '').split(/\s+/)].filter(Boolean)
  );
  const wrapperClassName = Array.from(classTokens).join(' ');

  return React.createElement(
    'div',
    {
      className: `${wrapperClassName} relative overflow-hidden rounded-2xl shadow-lg`,
    },
    React.createElement('div', { className: 'aspect-video' },
      React.createElement('iframe', {
        src: embedUrl,
        title: title,
        className: 'h-full w-full border-0',
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        allowFullScreen: true,
        loading: 'lazy',
      })
    )
  );
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Compile MDX/Markdown body to HTML.
 *
 * This is the SAME compilation pipeline used by scripts/build-content.mjs.
 * The migration script must use this function to produce identical HTML.
 *
 * @param {string} body - Raw Markdown/MDX body text
 * @returns {Promise<{ html: string, headings: Array, embeds: Array }>}
 */
export async function compileMdxContent(body = '') {
  const headings = [];
  const embeds = [];

  const mod = await evaluate(String(body || ''), {
    ...jsxRuntime,
    remarkPlugins: [remarkGfm, createRemarkClassNameNormalizer(), createRemarkYouTubeCollector(embeds)],
    rehypePlugins: [createRehypeContentDecorator(headings)],
    development: false,
  });

  const html = renderToStaticMarkup(
    React.createElement(mod.default, {
      components: {
        YouTubeEmbed: ServerYouTubeEmbed,
      },
    })
  ).trim();

  return {
    html,
    headings,
    embeds,
  };
}
