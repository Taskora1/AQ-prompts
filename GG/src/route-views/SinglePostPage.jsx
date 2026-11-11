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

  return htmlWithoutDuplicateTitle.replace(/<pre([^>]*)><code([^>]*)>([\s\S]*?)<\/code><\/pre>/gi, (match, preAttrs, codeAttrs, codeHtml) => {
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
    setRelatedPosts(Array.isArray(initialPayload.relatedPosts) ? initialPayload.relatedPosts.slice(0, 3) : []);
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
  const suggestedPrompts = useMemo(() => {
    return [...freePrompts]
      .filter((item) => {
        const promptSlug = item?.slug || slugifyPrompt(item?.title);
        return item?.title && item?.image && !isAuditedNoIndexPromptSlug(promptSlug);
      })
      .sort((a, b) => stablePromptScore(post?.slug, a.title) - stablePromptScore(post?.slug, b.title))
      .slice(0, 3);
  }, [freePrompts, post?.slug]);
  const previousPost = featuredPosts[0] || null;
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
              <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16">
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

                <h1 className="max-w-none text-[clamp(2.15rem,10vw,3rem)] font-semibold leading-[1.08] tracking-normal text-[var(--text-primary)] sm:text-[clamp(2.75rem,6vw,4.25rem)] lg:max-w-[16ch]">
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
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:text-slate-300"
                  >
                    <Twitter className="h-3.5 w-3.5" />
                    Post
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare('linkedin')}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:text-slate-300"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare('facebook')}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:text-slate-300"
                  >
                    <Facebook className="h-3.5 w-3.5" />
                    Share It
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:text-slate-300"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                  {faqs.length > 0 && (
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
                {faqs.length > 0 && (
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

                <div className="mt-12 grid gap-8 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_280px]">
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
                          <p className={`mt-2 max-w-2xl text-base leading-7 text-[var(--text-secondary)] sm:text-lg sm:leading-relaxed ${isPromptShe ? 'line-clamp-5' : ''}`}>
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

                  {previousPost && (
                    <div>
                      <h2 className="mb-4 text-2xl font-bold leading-tight text-[var(--text-primary)] md:text-3xl">
                        Related Read
                      </h2>
                      <Link
                        href={`/blog/${previousPost.slug}`}
                        className="group block overflow-hidden border border-[var(--border)] bg-[var(--bg-card)] transition hover:border-[var(--border)]"
                      >
                        <div className="aspect-video w-full overflow-hidden flex items-center justify-center">
                          <ResponsiveImage
                            src={
                              previousPost.image ||
                              previousPost.coverImage ||
                              previousPost.featuredImage ||
                              '/images/prompts/cinematic-sunset-beach-portrait.webp'
                            }
                            alt={previousPost.title}
                            rounded={false}
                            className="h-full w-full object-cover object-center transition duration-500 group-hover:scale-[1.02]"
                            loading="lazy"
                            sizes="280px"
                          />
                        </div>
                        <div className="p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                            Related Read
                          </p>
                          <p className="mt-3 text-lg leading-snug text-slate-950 transition group-hover:text-primary dark:text-white dark:group-hover:text-primary">
                            {previousPost.title}
                          </p>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>

              </div>

              <aside className="hidden lg:block lg:pt-20">
                <div className="space-y-10 lg:sticky lg:top-24">
                  {featuredPosts.length > 0 && (
                    <section>
                      <h2 className="text-4xl tracking-[-0.05em] text-slate-950 dark:text-white">Featured</h2>

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
                                loading="lazy"
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
                      <h2 className="text-4xl tracking-[-0.05em] text-slate-950 dark:text-white">Blog by Topics</h2>
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
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <NewsletterSignup variant="compact" />
          </div>
        </main>

        <Footer />
      </div>
    </ErrorBoundary>
  );
};

export default SinglePostPage;
