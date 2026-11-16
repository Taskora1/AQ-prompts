// Blog content helpers — pure functions with no imports, safe to use from
// client components (BlogForm, SinglePostPage) and server code (blog-db).
//
// Prompt blocks are TipTap codeBlock nodes rendered as
// <pre class="prompt-block"><code>…</code></pre>. An empty one (no visible
// text) renders on the public post as a copy box that copies nothing — the
// Birthday-post bug. These helpers remove such blocks wherever blog HTML
// is saved or rendered, so an empty prompt block can never reach a reader.

const PRE_CODE_RE = /<pre\b([^>]*)>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi;
const PROMPT_BLOCK_CLASS_RE = /\bprompt-block\b/i;

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

// Visible text inside a <code> element: tags stripped, entities decoded,
// whitespace collapsed. Empty for a blank block, a whitespace-only block,
// or one holding only <br> / &nbsp;.
function codeText(codeHtml) {
  return decodeHtmlEntities(String(codeHtml || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// Removes prompt blocks whose code has no visible text. Non-prompt code
// blocks are left untouched. Returns the cleaned HTML and how many blocks
// were removed.
export function stripEmptyPromptBlocks(html = '') {
  let removed = 0;
  const clean = String(html || '').replace(
    PRE_CODE_RE,
    (match, preAttrs, codeAttrs, codeHtml) => {
      if (!PROMPT_BLOCK_CLASS_RE.test(`${preAttrs || ''} ${codeAttrs || ''}`)) return match;
      if (codeText(codeHtml)) return match;
      removed += 1;
      return '';
    },
  );
  return { html: clean, removed };
}

// All block-level cleanups for saved/rendered blog HTML, in order: drop
// empty prompt blocks, drop empty FAQ blocks, keep only the first FAQ
// section. Returns the cleaned HTML and the individual removal counts.
export function sanitizeBlogBlocks(html = '') {
  const prompts = stripEmptyPromptBlocks(html);
  const faqs = stripEmptyFaqBlocks(prompts.html);
  const single = ensureSingleFaqSection(faqs.html);
  return {
    html: single.html,
    removedEmptyPrompts: prompts.removed,
    removedEmptyFaqs: faqs.removed,
    removedExtraFaqs: single.removed,
  };
}

// True when the HTML already holds an FAQ section — a <div
// class="faq-block"> or an h2 "Frequently Asked Questions" heading. The
// editor uses it to disable the FAQ insert button (one FAQ per post).
export function hasFaqSection(html = '') {
  const source = String(html || '');
  if (/<div\b[^>]*\bfaq-block\b/i.test(source)) return true;
  const headingPattern = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
  let match;
  while ((match = headingPattern.exec(source)) !== null) {
    if (/frequently asked questions/i.test(codeText(match[1]))) return true;
  }
  return false;
}

// Removes FAQ blocks with no valid Q&A items (an empty FAQ block saved
// by mistake). Only <div class="faq-block"> is touched — a plain h2 FAQ
// section is left alone, because its questions might be written in a
// shape this helper cannot parse, and deleting them would lose content.
export function stripEmptyFaqBlocks(html = '') {
  let removed = 0;
  const clean = String(html || '').replace(
    /<div\b[^>]*\bfaq-block\b[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      if (faqItemsFromHtml(match).length > 0) return match;
      removed += 1;
      return '';
    },
  );
  return { html: clean, removed };
}

// How many empty prompt blocks the HTML holds (without changing it).
export function countEmptyPromptBlocks(html = '') {
  return stripEmptyPromptBlocks(html).removed;
}

// Escape text for safe interpolation into HTML (FAQ rendering).
function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Every prompt block in the HTML: its title (data-title, may be '') and
// its visible prompt text. Used by the editor (warnings) and tests; the
// public renderer keys off the same <pre class="prompt-block"> shape.
export function getPromptBlocks(html = '') {
  const blocks = [];
  String(html || '').replace(
    PRE_CODE_RE,
    (match, preAttrs, codeAttrs, codeHtml) => {
      if (!PROMPT_BLOCK_CLASS_RE.test(`${preAttrs || ''} ${codeAttrs || ''}`)) return match;
      const titleMatch = String(preAttrs || '').match(/data-title=["']([^"']*)["']/i);
      blocks.push({
        title: titleMatch ? decodeHtmlEntities(titleMatch[1]).trim() : '',
        text: codeText(codeHtml),
      });
      return match;
    },
  );
  return blocks;
}

export function countPromptBlocks(html = '') {
  return getPromptBlocks(html).length;
}

// --- Public prompt-box rendering (theme-aware redesign, 2026-11-13) ---
// The public post renders each prompt block as a copy box. The box header
// carries the prompt's title + "Best for" line and a small pill Copy
// button with an icon; the copy confirmation is a persistent
// "Copied — <title>" caption inside the box — it names the prompt, unlike
// the old 2-second toast. Title source, in order: the pre's data-title
// (new editor saves it), the nearest preceding numbered heading (h2/h3,
// number stripped — old posts like the Birthday post have no data-title),
// else "Prompt N" in document order. "Best for" comes from the <p> right
// after that heading when it starts with "Best for". Non-prompt code
// blocks keep the old shape (small Copy button above the code).

const COPY_ICON_SVG = '<svg class="article-copy-icon article-copy-icon-copy" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON_SVG = '<svg class="article-copy-icon article-copy-icon-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

// Numbered headings in the article (h2/h3 starting "1. ", "2) ", ...)
// with the "Best for" paragraph that follows each one, if any. The box
// header titles come from here for posts saved before the editor wrote
// data-title onto the pre (e.g. the Birthday post).
export function getPromptHeadings(html = '') {
  const source = String(html || '');
  const headings = [];
  const headingRe = /<(h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = headingRe.exec(source)) !== null) {
    const text = codeText(match[2]);
    if (!/^\d{1,2}[.)]\s/.test(text)) continue;
    const title = text.replace(/^\d{1,2}[.)]\s*/, '').trim();
    if (!title) continue;
    const paraMatch = source.slice(headingRe.lastIndex).match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>/i);
    const paraText = paraMatch ? codeText(paraMatch[1]) : '';
    headings.push({
      index: match.index,
      title,
      bestFor: /^best for:/i.test(paraText) ? paraText : '',
    });
  }
  return headings;
}

// Wrap every <pre class="prompt-block"> in the new copy-box shell and
// leave every other code block in the old shape. The <pre> itself is
// untouched, so the gallery layout (which counts prompt-block classes)
// and the empty-block strip keep working on the result.
export function enhancePromptBlocks(html = '') {
  const source = String(html || '');
  const headings = getPromptHeadings(source);
  let promptIndex = 0;
  return source.replace(
    PRE_CODE_RE,
    (match, preAttrs, codeAttrs, codeHtml, offset) => {
      if (!PROMPT_BLOCK_CLASS_RE.test(`${preAttrs || ''} ${codeAttrs || ''}`)) {
        const plainCode = codeText(codeHtml);
        const label = plainCode.length > 120 || /reference image|prompt/i.test(plainCode)
          ? 'Copy Prompt'
          : 'Copy';
        return `<div class="article-code-shell"><button type="button" class="article-copy-button" data-copy-code aria-label="${escapeHtml(label)}">${escapeHtml(label)}</button><pre${preAttrs}><code${codeAttrs}>${codeHtml}</code></pre></div>`;
      }

      promptIndex += 1;
      const titleMatch = String(preAttrs || '').match(/data-title=["']([^"']*)["']/i);
      const dataTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]).trim() : '';
      const heading = [...headings].reverse().find((item) => item.index < offset);
      const title = dataTitle || heading?.title || `Prompt ${promptIndex}`;
      const bestFor = heading?.bestFor || '';
      const safeTitle = escapeHtml(title);
      return `<div class="article-code-shell prompt-code-shell">`
        + `<div class="article-prompt-header"><div class="article-prompt-heading">`
        + `<h3 class="article-prompt-title">${safeTitle}</h3>`
        + (bestFor ? `<p class="article-prompt-bestfor">${escapeHtml(bestFor)}</p>` : '')
        + `</div><button type="button" class="article-copy-button" data-copy-code data-copy-title="${safeTitle}" aria-label="Copy ${safeTitle}" aria-live="polite">${COPY_ICON_SVG}${CHECK_ICON_SVG}<span class="article-copy-label">Copy</span></button></div>`
        + `<pre${preAttrs}><code${codeAttrs}>${codeHtml}</code></pre>`
        + `<p class="article-copy-caption" role="status">✓ Copied — ${safeTitle}</p></div>`;
    },
  );
}

// FAQ block HTML: one <div class="faq-block"> holding the h2 heading and
// an h3 question + p answer per item — the exact shape the public renderer
// (convertInlineFaqToAccordion) turns into a <details> accordion. Empty
// items are dropped; no valid items means no block at all.
export function faqItemsToHtml(items = []) {
  const clean = (Array.isArray(items) ? items : [])
    .map((item) => ({
      question: String(item?.question || '').trim(),
      answer: String(item?.answer || '').trim(),
    }))
    .filter((item) => item.question && item.answer);
  if (clean.length === 0) return '';
  const pairs = clean
    .map((item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`)
    .join('');
  return `<div class="faq-block"><h2>Frequently Asked Questions</h2>${pairs}</div>`;
}

// The FAQ section inside the HTML (a <div class="faq-block">, or a plain
// h2 "Frequently Asked Questions" section), up to the next h2 or the end.
// Returns '' when there is no FAQ section.
function extractFaqSection(html = '') {
  const source = String(html || '');
  const divMatch = source.match(/<div\b[^>]*\bfaq-block\b[^>]*>[\s\S]*?<\/div>/i);
  if (divMatch) return divMatch[0];
  const headingPattern = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
  let headingMatch;
  while ((headingMatch = headingPattern.exec(source)) !== null) {
    if (!/frequently asked questions/i.test(codeText(headingMatch[1]))) continue;
    const headingEnd = headingMatch.index + headingMatch[0].length;
    const nextHeadingIndex = source.slice(headingEnd).search(/<h2\b/i);
    const sectionEnd = nextHeadingIndex < 0 ? source.length : headingEnd + nextHeadingIndex;
    return source.slice(headingMatch.index, sectionEnd);
  }
  return '';
}

// Parse the FAQ items out of the HTML's FAQ section (either form). Empty
// questions/answers are dropped.
export function faqItemsFromHtml(html = '') {
  const section = extractFaqSection(html);
  if (!section) return [];
  return [...section.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>\s*((?:<p\b[^>]*>[\s\S]*?<\/p>\s*)+)/gi)]
    .map(([, question, answers]) => ({
      question: codeText(question),
      answer: codeText(answers),
    }))
    .filter((item) => item.question && item.answer);
}

// Standing rule: only one FAQ section per post. Keeps the first FAQ
// section in document order and removes every later one (a <div
// class="faq-block"> or a plain h2 FAQ section). Returns the cleaned HTML
// and how many sections were removed.
export function ensureSingleFaqSection(html = '') {
  const source = String(html || '');
  const ranges = [];
  const divRe = /<div\b[^>]*\bfaq-block\b[^>]*>[\s\S]*?<\/div>/gi;
  let match;
  while ((match = divRe.exec(source)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  const headingPattern = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
  while ((match = headingPattern.exec(source)) !== null) {
    if (!/frequently asked questions/i.test(codeText(match[1]))) continue;
    if (ranges.some(([start, end]) => match.index >= start && match.index < end)) continue;
    // The section is the h2 plus its consecutive h3-question + p-answer
    // pairs. It ends at the last pair — anything after that (a prompt
    // block, a paragraph, an image) is not part of the FAQ section and
    // must not be swallowed when a later section is removed.
    let end = match.index + match[0].length;
    const pairPattern = /\s*<h3\b[^>]*>[\s\S]*?<\/h3>\s*((?:<p\b[^>]*>[\s\S]*?<\/p>\s*)+)/gi;
    pairPattern.lastIndex = end;
    let pairMatch;
    while ((pairMatch = pairPattern.exec(source)) !== null) {
      if (pairMatch.index !== end) break;
      end = pairMatch.index + pairMatch[0].length;
    }
    ranges.push([match.index, end]);
  }
  if (ranges.length <= 1) return { html: source, removed: 0 };
  ranges.sort((a, b) => a[0] - b[0]);
  const [keepStart, keepEnd] = ranges[0];
  let removed = 0;
  let out = '';
  let pos = 0;
  for (const [start, end] of ranges) {
    if (start === keepStart && end === keepEnd) {
      out += source.slice(pos, end);
      pos = end;
      continue;
    }
    out += source.slice(pos, start);
    pos = end;
    removed += 1;
  }
  out += source.slice(pos);
  return { html: out, removed };
}
