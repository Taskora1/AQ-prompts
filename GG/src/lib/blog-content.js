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
