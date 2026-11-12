'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Facebook,
  Linkedin,
  Search,
  Share2,
  Twitter,
} from 'lucide-react';

import Footer from '../components/Footer';
import Header from '../components/Header';
import ArticleBody from '../components/ArticleBody';
import ResponsiveImage from '../components/ResponsiveImage';
import Breadcrumb from '../components/Breadcrumb';
import ErrorBoundary from '../components/ErrorBoundary';
import { useCopyGate } from '../components/CopyGate';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { formatStableDate } from '../lib/utils';
import { isAuditedNoIndexPromptSlug } from '../lib/content-indexing-policy';
import { BLOG_POST_COVER_SIZES, getBlogPostCoverImage } from '../lib/article';

const NewsletterSignup = dynamic(() => import('../components/NewsletterSignup'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[164px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)]" />
  ),
});

function slugifyHeading(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function slugifyPrompt(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function linkPromptKeywordsHtml(html = '') {
  const replacements = [
    { phrase: 'Leonardo AI prompts', href: '/tools/ai-image-prompts' },
    { phrase: 'portrait prompts', href: '/tools/ai-image-prompts' },
    { phrase: 'AI prompts', href: '/tools/ai-image-prompts' },
  ];

  let inAnchor = false;
  let protectedDepth = 0;

  return String(html || '')
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part) return part;
      if (part.startsWith('<')) {
        if (/^<a\b/i.test(part)) inAnchor = true;
        if (/^<\/a>/i.test(part)) inAnchor = false;
        if (/^<(pre|code)\b/i.test(part)) protectedDepth += 1;
        if (/^<\/(pre|code)>/i.test(part)) protectedDepth = Math.max(0, protectedDepth - 1);
        return part;
      }
      if (inAnchor || protectedDepth > 0) return part;

      return replacements.reduce((text, { phrase, href }) => {
        const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        return text.replace(pattern, (match) => `<a href="${href}">${match}</a>`);
      }, part);
    })
    .join('');
}

function stablePromptScore(seed, title) {
  const input = `${seed || 'post'}:${title || ''}`;
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getDisplayFaqs(post) {
  const faqs = post?.faqs;
  if (!Array.isArray(faqs)) return [];
  return faqs
    .map((faq) => ({
      question: String(faq?.question || '').trim(),
      answer: String(faq?.answer || '').trim(),
    }))
    .filter((faq) => faq.question && faq.answer);
}

function textFromHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Drop a table column whose body cells all carry the same value (for
// example a "Best ratio" column that repeats "4:5" in every row). Only
// fires when the column is provably redundant: header plus at least two
// body rows, identical non-empty cell text, no spanning cells.
function dropRedundantTableColumns(html = '') {
  return String(html || '').replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (tableMatch, tableInner) => {
    const rows = [...tableInner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rows.length < 3) return tableMatch;
    if (/<t[hd]\b[^>]*(colspan=["']?([2-9]|1[0-9])|rowspan=["']?([2-9]|1[0-9]))/i.test(tableInner)) {
      return tableMatch;
    }

    const parsedRows = rows.map((row) =>
      [...row[1].matchAll(/<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((cell) => ({
        tag: cell[1],
        text: textFromHtml(cell[3]),
      })),
    );
    const columnCount = parsedRows[0].length;
    if (!columnCount || parsedRows.some((row) => row.length !== columnCount)) return tableMatch;

    const redundantIndex = parsedRows[0].findIndex((headerCell, columnIndex) => {
      if (columnIndex === 0) return false;
      const firstValue = parsedRows[1][columnIndex].text;
      if (!firstValue) return false;
      return parsedRows.slice(1).every((row) => row[columnIndex].text === firstValue);
    });
    if (redundantIndex < 0) return tableMatch;

    let result = tableInner;
    result = result.replace(/<colgroup\b[^>]*>([\s\S]*?)<\/colgroup>/i, (groupMatch, groupInner) => {
      const cols = [...groupInner.matchAll(/<col\b[^>]*\/?>/gi)];
      if (cols.length !== columnCount) return groupMatch;
      return groupMatch.replace(cols[redundantIndex][0], '');
    });
    result = result.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (rowMatch, rowInner) => {
      const cells = [...rowInner.matchAll(/<t[hd]\b[^>]*>[\s\S]*?<\/t[hd]>/gi)];
      if (cells.length !== columnCount) return rowMatch;
      return rowMatch.replace(cells[redundantIndex][0], '');
    });

    return tableMatch.replace(tableInner, result);
  });
}

// Turn an in-body FAQ section (h2 "Frequently Asked Questions" followed
// by h3 questions with paragraph answers) into a <details> accordion.
// Wording is unchanged; only the markup changes. The h2 gets the
// common-questions id so the "Jump to FAQ" link still lands on it.
function convertInlineFaqToAccordion(html = '') {
  const source = String(html || '');
  const headingPattern = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi;
  let headingMatch;
  let faqHeading = null;

  while ((headingMatch = headingPattern.exec(source)) !== null) {
    if (/frequently asked questions/i.test(textFromHtml(headingMatch[2]))) {
      faqHeading = headingMatch;
      break;
    }
  }
  if (!faqHeading) return source;

  const headingEnd = faqHeading.index + faqHeading[0].length;
  const nextHeadingIndex = source.slice(headingEnd).search(/<h2\b/i);
  const sectionEnd = nextHeadingIndex < 0 ? source.length : headingEnd + nextHeadingIndex;
  const section = source.slice(headingEnd, sectionEnd);

  const pairs = [...section.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>\s*((?:<p\b[^>]*>[\s\S]*?<\/p>\s*)+)/gi)];
  if (pairs.length === 0) return source;

  const accordion = `<div class="article-faq-list">${pairs
    .map(
      ([, question, answers]) =>
        `<details class="article-faq-item"><summary class="article-faq-question"><span>${question.trim()}</span><span class="article-faq-chevron" aria-hidden="true">›</span></summary><div class="article-faq-answer">${answers.trim()}</div></details>`,
    )
    .join('')}</div>`;

  const headingAttrs = faqHeading[1] || '';
  const headingWithId = /id\s*=/.test(headingAttrs)
    ? faqHeading[0]
    : faqHeading[0].replace(/^<h2\b/i, '<h2 id="common-questions"');

  return `${source.slice(0, faqHeading.index)}${headingWithId}${accordion}${source.slice(sectionEnd)}`;
}

// Post-page-only style overrides. globals.css is owned by the parallel
// list-page workstream, so the prompt-code contrast and in-body FAQ
// accordion styles live here. This <style> renders after the global
// stylesheet, so equal-specificity rules win over it.
const POST_PAGE_STYLES = `
.article-prose .prompt-code-shell { background: #101a30; }
.article-prose .prompt-code-shell pre { background: #16223c; }
.article-prose .prompt-code-shell pre code { color: #ffffff; font-size: 1rem; font-weight: 600; line-height: 1.8; }
.article-prose .article-code-shell pre code { font-size: 0.95rem; line-height: 1.75; }
@media (min-width: 1024px) {
  .article-prose[data-prompt-gallery="true"] > div > .article-gallery-prompt-card .prompt-code-shell pre code { font-size: 1rem; line-height: 1.8; }
}
.article-faq-list { margin-top: 2rem; overflow: hidden; border: 1px solid var(--border); border-radius: 1rem; background: var(--bg-card); }
.article-faq-item { border-bottom: 1px solid var(--border); }
.article-faq-item:last-child { border-bottom: 0; }
.article-faq-question { display: flex; cursor: pointer; list-style: none; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.25rem; text-align: left; font-size: 1rem; font-weight: 700; line-height: 1.5; color: var(--text-primary); }
.article-faq-question::-webkit-details-marker { display: none; }
.article-faq-question:hover { color: #ff6b35; background: rgba(255, 107, 53, 0.05); }
.article-faq-chevron { display: inline-flex; height: 2rem; width: 2rem; flex-shrink: 0; align-items: center; justify-content: center; border: 1px solid var(--border); border-radius: 999px; color: #ff6b35; font-size: 1.25rem; line-height: 1; transition: transform 0.2s ease; }
.article-faq-item[open] .article-faq-chevron { transform: rotate(90deg); }
.article-faq-answer { padding: 0 1.25rem 1.25rem; }
.article-faq-answer p { margin: 0; color: var(--text-secondary); font-size: 1rem; line-height: 1.8; }
`;

function renderArticleBlocksHtml(post) {
  // Always prefer content_html (canonical rendered HTML from Neon).
  // Fallback to content only for backward compatibility with legacy generated data.
  const html = post?.contentHtml || post?.content || '';
  const title = String(post?.title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const htmlWithoutDuplicateTitle = String(html || '').replace(/^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i, (match, headingText) => {
    const normalizedHeading = String(headingText || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    return !title || normalizedHeading === title ? '' : match.replace(/^(\s*)<h1\b/i, '$1<h2').replace(/<\/h1>\s*$/i, '</h2>');
  });

  const withPromptBlocks = htmlWithoutDuplicateTitle.replace(/<pre([^>]*)><code([^>]*)>([\s\S]*?)<\/code><\/pre>/gi, (match, preAttrs, codeAttrs, codeHtml) => {
    const plainCode = String(codeHtml || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const isPromptBlock = /\bclass=["'][^"']*\bprompt-block\b/i.test(`${preAttrs} ${codeAttrs}`);
    const label = isPromptBlock || plainCode.length > 120 || /reference image|prompt/i.test(plainCode)
      ? 'Copy Prompt'
      : 'Copy';

    if (isPromptBlock) {
      return `<div class="article-code-shell prompt-code-shell"><h3 class="article-prompt-title">Prompt</h3><pre${preAttrs}><code${codeAttrs}>${codeHtml}</code></pre><button type="button" class="article-copy-button" data-copy-code aria-label="${label}" aria-live="polite">${label}</button></div>`;
    }

    return `<div class="article-code-shell"><button type="button" class="article-copy-button" data-copy-code aria-label="${label}">${label}</button><pre${preAttrs}><code${codeAttrs}>${codeHtml}</code></pre></div>`;
  });

  // Render-time presentation fixes only; wording and prompts are untouched.
  return dropRedundantTableColumns(convertInlineFaqToAccordion(withPromptBlocks));
}

const SinglePostPage = ({ initialPayload = null, slug = '' }) => {
  const [post, setPost] = useState(() => initialPayload?.post || null);
  const [relatedPosts, setRelatedPosts] = useState(() => initialPayload?.relatedPosts || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => (initialPayload ? null : 'Article not found'));
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [freePrompts, setFreePrompts] = useState([]);
  const { copyGate, requestCopy: requestPromptCopy } = useCopyGate();

  useEffect(() => {
    if (!initialPayload?.post) {
      setPost(null);
      setRelatedPosts([]);
      setError('Article not found');
      setLoading(false);
      return;
    }

    setPost({
      ...initialPayload.post,
      contentHtml: initialPayload.post.contentHtml || initialPayload.post.content || '',
      content: initialPayload.post.contentText || initialPayload.post.content || '',
    });
    setRelatedPosts(Array.isArray(initialPayload.relatedPosts) ? initialPayload.relatedPosts.slice(0, 6) : []);
    setError(null);
    setLoading(false);
  }, [initialPayload]);

  useEffect(() => {
    let cancelled = false;
    let idleId;
    let timeoutId;

    async function loadPrompts() {
      try {
        // Related prompts only: the old full-directory fetch shipped all
        // 576 prompts (~160 KB) to the client for a 3-card section. The
        // related endpoint picks 3 server-side (seeded by the post slug)
        // and returns ~2 KB.
        const slug = post?.slug || '';
        if (!slug) return;
        const response = await fetch(
          `/api/prompts/related?slug=${encodeURIComponent(slug)}&limit=3`,
          { cache: 'force-cache' },
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data?.prompts)) {
          setFreePrompts(data.prompts);
        }
      } catch {
        if (!cancelled) {
          setFreePrompts([]);
        }
      }
    }

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(loadPrompts, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(loadPrompts, 1200);
    }

    return () => {
      cancelled = true;
      if (idleId) window.cancelIdleCallback(idleId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [post?.slug]);

  useEffect(() => {
    if (slug) {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0 });
        setShareUrl(window.location.href);
      }
    }
  }, [slug]);

  const handleShare = (platform) => {
    const url = encodeURIComponent(shareUrl);
    const title = encodeURIComponent(post?.title || '');

    const shareUrls = {
      twitter: `https://twitter.com/intent/tweet?text=${title}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };

    if (shareUrls[platform]) {
      const popup = window.open(
        shareUrls[platform],
        '_blank',
        'noopener,noreferrer,width=600,height=400'
      );

      if (popup) {
        popup.opener = null;
      }
    }
  };

  const faqs = useMemo(() => getDisplayFaqs(post), [post]);
  // Use initial payload HTML on server, re-render with fresh HTML on client to avoid hydration mismatch
  const articleHtml = useMemo(() => {
    const html = renderArticleBlocksHtml(post);
    return linkPromptKeywordsHtml(html);
  }, [post]);
  const usesPromptGalleryLayout = useMemo(() => (
    (articleHtml.match(/class=["'][^"']*\bprompt-block\b/gi) || []).length >= 4
    && (articleHtml.match(/<img\b/gi) || []).length >= 4
  ), [articleHtml]);
  const featuredPosts = useMemo(() => relatedPosts.slice(0, 3), [relatedPosts]);
  // Related Read shows the next three related posts, never the sidebar's
  // Featured three, so the two sections never duplicate each other.
  const relatedReadPosts = useMemo(() => relatedPosts.slice(3, 6), [relatedPosts]);
  const suggestedPrompts = useMemo(() => {
    return [...freePrompts]
      .filter((item) => {
        const promptSlug = item?.slug || slugifyPrompt(item?.title);
        return item?.title && item?.image && !isAuditedNoIndexPromptSlug(promptSlug);
      })
      .sort((a, b) => stablePromptScore(post?.slug, a.title) - stablePromptScore(post?.slug, b.title))
      .slice(0, 3);
  }, [freePrompts, post?.slug]);
  const hasInlineFaq = articleHtml.includes('article-faq-list');
  const topicItems = useMemo(() => {
    const source = [post?.category, ...(Array.isArray(post?.tags) ? post.tags : [])]
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    return [...new Set(source)].slice(0, 10);
  }, [post]);

  const articleImage = getBlogPostCoverImage(post);
  const displayDate = formatStableDate(post?.publishDate || post?.date || '2026-03-01');
  const updatedDate = post?.updatedAt && post.updatedAt !== post?.publishDate
    ? formatStableDate(post.updatedAt)
    : '';
  const authorName = post?.author || 'Abdul Qudoos';
  const authorAvatar = post?.authorMeta?.avatar || '/images/founder-aqprompts.webp';
  const authorUrl = post?.authorMeta?.authorUrl || '/author/abdul-qudoos';
  const isPromptShe =
    authorName.trim().toLowerCase() === 'promptshe' ||
    post?.authorMeta?.slug?.replace(/-/g, '').toLowerCase() === 'promptshe';
  const authorBlurb =
    (isPromptShe
      ? 'PromptShe creates practical AI image prompts and guides for creators. Her work turns ideas into clear, adaptable instructions for portraits, celebrations, and social content. She focuses on useful examples and realistic expectations, since AI-generated results can vary.'
      : post?.authorMeta?.bio) ||
    'Abdul Qudoos creates and reviews AQPrompts guides and prompt-library content for creators using AI image tools.';
  const categoryHref = '/blog';
  const topicLinks = useMemo(
    () =>
      topicItems.map((topic) => ({
        label: topic,
        href:
          post?.category && topic === post.category
            ? categoryHref
            : `/blog?search=${encodeURIComponent(topic)}`,
      })),
    [categoryHref, post?.category, topicItems]
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const articleElement = document.querySelector('[data-article-body="true"]');
    let disposed = false;
    let frameId = 0;
    let measureFrameId = 0;
    let articleStart = 0;
    let articleScrollable = 1;

    const updateOnScroll = () => {
      const scrollY = window.scrollY;

      if (articleElement) {
        const progress = Math.min(
          100,
          Math.max(0, ((scrollY - articleStart) / articleScrollable) * 100)
        );

        setReadingProgress(progress);
      }
    };

    const measureLayout = () => {
      if (articleElement) {
        const articleRect = articleElement.getBoundingClientRect();
        articleStart = articleRect.top + window.scrollY - 120;
        articleScrollable = Math.max(
          articleElement.scrollHeight - window.innerHeight * 0.55,
          1
        );
      }

    };

    const scheduleMeasure = () => {
      if (disposed || measureFrameId) return;

      measureFrameId = window.requestAnimationFrame(() => {
        measureFrameId = 0;
        measureLayout();
        updateOnScroll();
      });
    };

    const handleScroll = () => {
      if (frameId) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateOnScroll();
      });
    };

    const articleResizeObserver = articleElement && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleMeasure)
      : null;
    articleResizeObserver?.observe(articleElement);
    scheduleMeasure();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    document.fonts?.ready.then(scheduleMeasure);

    return () => {
      disposed = true;
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', scheduleMeasure);
      articleResizeObserver?.disconnect();
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      if (measureFrameId) {
        window.cancelAnimationFrame(measureFrameId);
      }
    };
  }, [articleHtml]);

  useEffect(() => {
    if (!copied) return undefined;

    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const articleElement = document.querySelector('[data-article-body="true"]');
    if (!articleElement) return undefined;

    const handleCodeCopy = async (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-copy-code]') : null;
      if (!button || !articleElement.contains(button)) return;

      const shell = button.closest('.article-code-shell');
      const codeElement = shell?.querySelector('code');
      const text = codeElement?.textContent?.trim();

      const originalLabel = button.dataset.copyLabel || button.textContent || 'Copy';
      button.dataset.copyLabel = originalLabel;
      if (button.copyFeedbackTimer) window.clearTimeout(button.copyFeedbackTimer);

      try {
        if (!text) {
          throw new Error('The article prompt block is empty.');
        }

        const didCopy = await requestPromptCopy(text);
        if (!didCopy) {
          throw new Error('The article prompt block could not be copied.');
        }

        button.textContent = 'Copied';
        button.setAttribute('aria-label', 'Copied');
        button.classList.add('is-copied');
        button.classList.remove('is-copy-error');
        button.copyFeedbackTimer = window.setTimeout(() => {
          button.textContent = originalLabel;
          button.setAttribute('aria-label', originalLabel);
          button.classList.remove('is-copied');
          button.copyFeedbackTimer = null;
        }, 1600);
      } catch (error) {
        console.error('Unable to copy article code block.', error);
        button.textContent = 'Copy failed';
        button.setAttribute('aria-label', 'Copy failed. Select the prompt text and copy it manually.');
        button.classList.remove('is-copied');
        button.classList.add('is-copy-error');
        button.copyFeedbackTimer = window.setTimeout(() => {
          button.textContent = originalLabel;
          button.setAttribute('aria-label', originalLabel);
          button.classList.remove('is-copy-error');
          button.copyFeedbackTimer = null;
        }, 2400);
      }
    };

    const handleShowFull = (event) => {
      const button = event.target.closest('[data-show-full]');
      if (!button || !articleElement.contains(button)) return;

      const shell = button.closest('.prompt-code-shell');
      if (!shell) return;

      const expanded = shell.classList.toggle('is-expanded');
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? 'Show less' : 'Show full';
    };

    articleElement.addEventListener('click', handleCodeCopy);
    articleElement.addEventListener('click', handleShowFull);

    return () => {
      articleElement.removeEventListener('click', handleCodeCopy);
      articleElement.removeEventListener('click', handleShowFull);
    };
  }, [articleHtml, requestPromptCopy]);

  const handleCopyLink = async () => {
    if (!shareUrl || typeof navigator === 'undefined' || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      console.error('Unable to copy article link.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600">Loading article...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <main id="main-content" className="min-h-screen flex items-center justify-center">
          <div className="container mx-auto px-4 py-20 text-center">
            <div className="max-w-md mx-auto">
              <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">Article Not Found</h1>
              <p className="text-[var(--text-secondary)] mb-6">{error}</p>
              <div className="space-y-3">
                <button 
                  onClick={() => window.location.reload()} 
                  className="w-full bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Try Again
                </button>
                <Link 
                  href="/blog" 
                  className="block w-full bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] px-6 py-3 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  Back to Blog
                </Link>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">Article Not Found</h1>
          <p className="text-slate-600 mb-8">The article you're looking for doesn't exist.</p>
          <Button asChild className="rounded-full">
            <Link href="/blog">
              <ArrowLeft className="mr-2 w-4 h-4" /> Back to Blog
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const canonicalUrl = `https://www.aqprompts.com/blog/${post.slug}`;

  return (
    <ErrorBoundary>

        <div className="min-h-screen text-[var(--text-primary)]">
          <div
            className="fixed inset-x-0 top-0 z-50 h-1 origin-left bg-[#ff6b35]"
            style={{ transform: `scaleX(${readingProgress / 100})` }}
          />

          <Header />
          {copyGate}
          <ErrorBoundary>
            <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
              <Breadcrumb
                items={[
                  { label: 'Home', href: '/' },
                  { label: 'Blog', href: '/blog' },
                  { label: post?.title || 'Article' },
                ]}
              />
            </div>
          </ErrorBoundary>

          <main id="main-content" className="pb-16 sm:pb-24">
            <article className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-12">
              <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-12">
                <div className="min-w-0">
                  <Button
                    asChild
                    variant="ghost"
                    className="mb-5 rounded-full px-0 text-slate-500 hover:bg-transparent hover:text-primary sm:mb-8"
                  >
                  <Link href="/blog">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Blog
                  </Link>
                </Button>

                <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 sm:mb-6 sm:tracking-[0.22em]">
                  <Link href={categoryHref} className="text-primary transition-colors hover:text-[#c2410c]">
                    {post.category || 'Social Media'}
                  </Link>
                  <span className="inline-flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    {post.readingTime || 6} min read
                  </span>
                </div>

                <h1 className="max-w-none text-[clamp(1.75rem,6vw,2.375rem)] font-semibold leading-[1.15] tracking-normal text-[var(--text-primary)] sm:text-[clamp(2rem,4.5vw,2.75rem)] lg:max-w-[24ch]">
                  {post.title}
                </h1>

                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 sm:mt-8">
                  <span className="inline-flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {displayDate}
                  </span>
                  <span>
                    by <Link href={authorUrl} className="font-semibold text-primary hover:underline">{authorName}</Link>
                  </span>
                  {updatedDate ? <span>Updated {updatedDate}</span> : null}
                  <span className="inline-flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {post.readingTime || 6} min read
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:flex sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleShare('twitter')}
                    aria-label="Post this article on X"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:text-slate-300"
                  >
                    <Twitter className="h-3.5 w-3.5" />
                    Post on X
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare('linkedin')}
                    aria-label="Share this article on LinkedIn"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:text-slate-300"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    Share on LinkedIn
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare('facebook')}
                    aria-label="Share this article on Facebook"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:text-slate-300"
                  >
                    <Facebook className="h-3.5 w-3.5" />
                    Share on Facebook
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    aria-label="Copy link to this article"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:text-slate-300"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                  {(faqs.length > 0 || hasInlineFaq) && (
                    <a
                      href="#common-questions"
                      className="col-span-2 inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:text-slate-300 sm:col-span-1"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Jump to FAQ
                    </a>
                  )}
                </div>

                {articleImage ? (
                  <figure className="mt-7 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-sm sm:mt-8">
                    <div className="overflow-hidden">
                      <ResponsiveImage
                        src={articleImage}
                        alt={post.featuredImageAltText || post.coverImageAlt || post.title}
                        className="h-full w-full object-cover"
                        loading="eager"
                        fetchPriority="high"
                        sizes={BLOG_POST_COVER_SIZES}
                        quality={84}
                        preserveAspect
                        responsiveCloudinary
                      />
                    </div>
                  </figure>
                ) : null}

                <style>{POST_PAGE_STYLES}</style>
                <div
                  className="article-prose mt-7 min-w-0 overflow-hidden sm:mt-8"
                  data-article-body="true"
                  data-prompt-gallery={usesPromptGalleryLayout ? 'true' : undefined}
                >
                  <ArticleBody html={articleHtml} promptGallery={usesPromptGalleryLayout} />
                </div>

                <p className="mt-8 text-[13px] text-slate-500 dark:text-slate-400">
                  <Link href="/how-we-review-prompts" className="font-semibold text-primary hover:underline">Learn how we review our guides →</Link>
                </p>

                {suggestedPrompts.length > 0 && (
                  <section className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:mt-12 sm:p-5">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">Try These Free AI Prompts</h2>
                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      {suggestedPrompts.map((promptItem) => {
                        const promptSlug = promptItem.slug || slugifyPrompt(promptItem.title);

                        return (
                          <Link
                            key={promptItem.title}
                            href={`/tools/ai-image-prompts/p/${promptSlug}`}
                            className="group overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] transition-all duration-200 hover:border-primary"
                          >
                            <div className="aspect-[4/5] overflow-hidden">
                              <ResponsiveImage
                                src={promptItem.image}
                                alt={promptItem.title}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                                sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, (max-width: 1536px) 28vw, 382px"
                                quality={70}
                              />
                            </div>
                            <div className="p-3">
                              <h3 className="line-clamp-2 text-sm font-semibold text-[var(--text-primary)]">
                                {promptItem.title}
                              </h3>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                )}
                {faqs.length > 0 && !hasInlineFaq && (
                  <section id="common-questions" className="mt-12 border-t border-[var(--border)] pt-10 sm:mt-16 sm:pt-12">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                      Common Questions
                    </p>
                    <h2 className="mt-3 text-2xl font-black tracking-normal text-[var(--text-primary)] sm:text-3xl">
                      Frequently Asked Questions
                    </h2>

                    <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_18px_60px_rgba(15,23,42,0.07)] dark:bg-[#111118]">
                      {faqs.map((faq, index) => (
                        <details
                          key={`${faq.question}-${index}`}
                          className="group border-b border-[var(--border)] last:border-b-0"
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-left text-base font-black text-[var(--text-primary)] transition hover:bg-primary/5 hover:text-primary sm:px-6 sm:text-lg [&::-webkit-details-marker]:hidden">
                            <span>{faq.question}</span>
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-primary transition-transform group-open:rotate-90 dark:bg-[#0a0a0f]" aria-hidden="true">
                              <ChevronRight className="h-4 w-4" />
                            </span>
                          </summary>
                          <p className="px-5 pb-5 text-base leading-8 text-[var(--text-secondary)] sm:px-6">{faq.answer}</p>
                        </details>
                      ))}
                    </div>
                  </section>
                )}

                {topicLinks.length > 0 && (
                  <div className="mt-10 border-t border-slate-200 pt-8 dark:border-white/10 sm:mt-12">
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">Topics:</p>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
                      {topicLinks.map((topic) => (
                        <Link
                          key={topic.label}
                          href={topic.href}
                          className="text-sm text-primary underline-offset-4 transition hover:underline"
                        >
                          {topic.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-12 lg:mt-14">
                  <Card className="rounded-none border-x-0 border-y border-[var(--border)] bg-transparent shadow-none">
                    <CardContent className="px-0 py-8">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-primary)]">
                          <Image
                            src={authorAvatar}
                            alt={`${authorName}, founder and editor of AQPrompts`}
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        </div>
                        <div>
                          <p className="text-xl font-semibold text-[var(--text-primary)]">
                            <Link href={authorUrl} className="hover:text-primary">{authorName}</Link>
                          </p>
                          <p className="mt-2 max-w-2xl text-base leading-7 text-[var(--text-secondary)] sm:text-lg sm:leading-relaxed">
                            {authorBlurb}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => handleShare('facebook')}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] transition hover:border-primary/40 hover:text-primary"
                          aria-label="Share this article on Facebook"
                        >
                          <Facebook className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShare('linkedin')}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] transition hover:border-primary/40 hover:text-primary"
                          aria-label="Share this article on LinkedIn"
                        >
                          <Linkedin className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShare('twitter')}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] transition hover:border-primary/40 hover:text-primary"
                          aria-label="Share this article on Twitter"
                        >
                          <Twitter className="h-4 w-4" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>

                </div>

                {relatedReadPosts.length > 0 && (
                  <section className="mt-12 lg:mt-14">
                    <h2 className="text-2xl font-bold leading-tight text-[var(--text-primary)] md:text-3xl">
                      Related Read
                    </h2>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {relatedReadPosts.map((relatedPost) => (
                        <Link
                          key={relatedPost.slug}
                          href={`/blog/${relatedPost.slug}`}
                          className="group block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] transition hover:border-primary"
                        >
                          <div className="aspect-video w-full overflow-hidden">
                            <ResponsiveImage
                              src={
                                relatedPost.image ||
                                relatedPost.coverImage ||
                                relatedPost.featuredImage ||
                                '/images/prompts/cinematic-sunset-beach-portrait.webp'
                              }
                              alt={relatedPost.title}
                              rounded={false}
                              className="h-full w-full object-cover object-center transition duration-500 group-hover:scale-[1.02]"
                              loading="lazy"
                              sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 400px"
                            />
                          </div>
                          <div className="p-4">
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                              Related Read
                            </p>
                            <p className="mt-3 line-clamp-3 text-base leading-snug text-slate-950 transition group-hover:text-primary dark:text-white dark:group-hover:text-primary">
                              {relatedPost.title}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

              </div>

              <aside className="hidden lg:block lg:pt-20">
                <div className="space-y-10">
                  {featuredPosts.length > 0 && (
                    <section>
                      <h2 className="text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">Featured</h2>

                      <div className="mt-5 space-y-3">
                        {featuredPosts.map((featuredPost) => (
                          <Link
                            key={featuredPost.slug}
                            href={`/blog/${featuredPost.slug}`}
                            className="group grid grid-cols-[96px_minmax(0,1fr)] gap-3 overflow-hidden bg-[#ff6b35] p-2 text-white transition hover:bg-[#ff6b35]/90"
                          >
                            <div className="relative w-24 aspect-video overflow-hidden">
                              <ResponsiveImage
                                src={
                                  featuredPost.image ||
                                  featuredPost.coverImage ||
                                  featuredPost.featuredImage ||
                                  '/images/prompts/cinematic-sunset-beach-portrait.webp'
                                }
                                alt={featuredPost.title}
                                rounded={false}
                                className="absolute inset-0 h-full w-full object-cover object-center"
                                // Sidebar is below the fold on desktop and
                                // hidden on mobile: never eager-load it (an
                                // eager image gets preloaded on every post
                                // page even though it is never shown on
                                // mobile). 96px display, so 192w covers 2x.
                                loading="lazy"
                                cloudinaryWidth={192}
                                sizes="96px"
                              />
                            </div>
                            <div className="flex items-center">
                              <p className="line-clamp-3 text-sm leading-6 text-white transition group-hover:text-white/90">
                                {featuredPost.title}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </section>
                  )}

                  {topicLinks.length > 0 && (
                    <section className="border-t border-slate-200 pt-8 dark:border-white/10">
                      <h2 className="text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">Blog by Topics</h2>
                      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-3">
                        {topicLinks.map((topic) => (
                          <Link
                            key={topic.label}
                            href={topic.href}
                            className="text-sm text-primary underline-offset-4 transition hover:underline"
                          >
                            {topic.label}
                          </Link>
                        ))}
                      </div>
                      <Link
                        href="/blog"
                        className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-950 transition hover:text-primary dark:text-white dark:hover:text-primary"
                      >
                        See All
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </section>
                  )}

                  <Card className="rounded-none border border-slate-200 bg-[var(--bg-secondary)] shadow-none dark:border-white/10">
                    <CardHeader>
                      <CardTitle className="text-xl text-slate-950 dark:text-white">Need more growth reads?</CardTitle>
                      <CardDescription className="text-slate-600 dark:text-slate-300">
                        Browse practical posts for creators, marketers, and solo teams.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button
                        asChild
                        className="w-full rounded-none bg-primary text-white hover:bg-primary/90"
                      >
                        <Link href="/blog">
                          Explore the blog
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </aside>
            </div>
          </article>

          {/* Newsletter Section */}
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            <NewsletterSignup variant="compact" />
          </div>
        </main>

        <Footer />
      </div>
    </ErrorBoundary>
  );
};

export default SinglePostPage;
