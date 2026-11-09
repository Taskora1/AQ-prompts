/**
 * Client-side Markdown ↔ HTML conversion utilities.
 *
 * Blog MDX files store raw Markdown as the body.
 * TipTap expects HTML.
 * This module bridges the two formats on the client side.
 *
 * Dependencies: unified, remark-parse, remark-html, turndown
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkHtml from 'remark-html';
import TurndownService from 'turndown';

/* ── Turndown instance (HTML → Markdown) ── */

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});

// Keep <pre><code> blocks as fenced code blocks, preserving language info
turndownService.addRule('fencedCodeBlock', {
  filter(node) {
    return (
      node.nodeName === 'PRE' &&
      node.firstChild &&
      node.firstChild.nodeName === 'CODE'
    );
  },
  replacement(content, node) {
    const code = node.firstChild;
    const text = code.textContent || '';
    // Extract language from class="language-xxx" (TipTap / Prism convention)
    const className = code.getAttribute('class') || '';
    const langMatch = className.match(/language-(\S+)/);
    const lang = langMatch ? langMatch[1] : '';
    return '\n\n```' + lang + '\n' + text.replace(/\n+$/, '') + '\n```\n\n';
  },
});

// Keep <img> tags as-is (don't let Turndown mangle them)
turndownService.addRule('images', {
  filter: 'img',
  replacement(content, node) {
    const src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    const title = node.getAttribute('title');
    let result = `![${alt}](${src}`;
    if (title) result += ` "${title}"`;
    result += ')';
    return result;
  },
});

// Keep <figure>/<figcaption> as a simple image + caption
turndownService.addRule('figure', {
  filter: 'figure',
  replacement(content, node) {
    // Read directly from the node (not from content) for reliability
    const img = node.querySelector('img');
    const caption = node.querySelector('figcaption');
    const src = img?.getAttribute('src') || '';
    const alt = img?.getAttribute('alt') || '';
    const captionText = caption?.textContent?.trim() || '';
    let result = `\n\n![${alt}](${src})`;
    if (captionText) result += `\n*${captionText}*`;
    return result + '\n\n';
  },
});

// Keep <mark> tags — preserves highlight with optional color
turndownService.addRule('mark', {
  filter: 'mark',
  replacement(content, node) {
    // Check data-color attribute first (TipTap multicolor highlight storage)
    const dataColor = node.getAttribute('data-color');
    if (dataColor) {
      return `<mark style="background-color: ${dataColor}">${content}</mark>`;
    }
    // Fallback: check style for background-color
    const style = node.getAttribute('style') || '';
    const bgMatch = style.match(/background-color:\s*([^;]+)/);
    if (bgMatch) {
      return `<mark style="background-color: ${bgMatch[1].trim()}">${content}</mark>`;
    }
    return `==${content}==`;
  },
});

// Keep <table> as HTML (Turndown's table conversion can be lossy)
turndownService.addRule('tables', {
  filter: 'table',
  replacement(content, node) {
    return '\n\n' + node.outerHTML + '\n\n';
  },
});

// Preserve raw HTML blocks (e.g. <div style="text-align:center">) that
// have no clean Markdown equivalent. Must come BEFORE the generic 'divs' rule
// so styled/classed divs keep their attributes instead of being unwrapped.
turndownService.addRule('rawHtml', {
  filter(node) {
    return (
      node.nodeName === 'DIV' &&
      (node.getAttribute('style') || node.getAttribute('class')) &&
      node.innerHTML
    );
  },
  replacement(content, node) {
    return '\n\n' + node.outerHTML + '\n\n';
  },
});

// Keep plain <div> wrappers (e.g. from TipTap) — unwrap and pass content through
turndownService.addRule('divs', {
  filter: 'div',
  replacement(content, node) {
    return '\n\n' + node.innerHTML + '\n\n';
  },
});

// Keep <hr> as markdown
turndownService.addRule('horizontalRule', {
  filter: 'hr',
  replacement() {
    return '\n\n---\n\n';
  },
});

/* ── Public API ── */

/**
 * Detect whether content is HTML (has tags) or plain Markdown.
 */
export function isHtmlContent(content = '') {
  const str = String(content || '').trim();
  if (!str) return false;
  // If it contains common HTML tags, treat as HTML
  return /<[a-z][\s\S]*>/i.test(str);
}

/**
 * Convert raw Markdown string to HTML.
 * Used when loading content into TipTap.
 */
export async function markdownToHtml(markdown = '') {
  const text = String(markdown || '').trim();
  if (!text) return '';

  // If already HTML, return as-is
  if (isHtmlContent(text)) return text;

  try {
    const result = await unified()
      .use(remarkParse)
      .use(remarkHtml, { sanitize: false })
      .process(text);

    return String(result).trim();
  } catch {
    // Fallback: wrap in <p> tags
    return text
      .split(/\n{2,}/)
      .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
      .join('\n');
  }
}

/**
 * Convert HTML string to Markdown.
 * Used when saving content from TipTap back to the MDX body.
 */
export function htmlToMarkdown(html = '') {
  const text = String(html || '').trim();
  if (!text) return '';

  // If it doesn't look like HTML, return as-is
  if (!isHtmlContent(text)) return text;

  try {
    let md = turndownService.turndown(text);

    // Clean up excessive blank lines (max 2 consecutive)
    md = md.replace(/\n{3,}/g, '\n\n');

    // Trim leading/trailing whitespace
    md = md.trim();

    return md;
  } catch {
    // Fallback: return original
    return text;
  }
}
