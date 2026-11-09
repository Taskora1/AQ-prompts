'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Share2,
  Sparkles,
  Tag,
} from 'lucide-react';
import { useCopyGate } from '@/components/CopyGate';
import AdsterraNativeBanner from '@/components/AdsterraNativeBanner';
import PromptEngagementBar from '@/components/prompts/PromptEngagementBar';
import { isSupportedAspectRatio, withAspectRatio } from '@/lib/prompt-ratio';

const ratios = ['4:5', '1:1', '9:16', '16:9'];
const PROMPT_DOWNLOAD_AD_URL =
  'https://www.profitableratecpmnetwork.com/pmt5e56gz?key=c433458f9dd94e39887fc85f64194aa2';

const ratioIcons = {
  '4:5': (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="1" width="10" height="12.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  '1:1': (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  '9:16': (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4" y="0.5" width="8" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  '16:9': (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="0.5" y="3.5" width="15" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

function promptHtmlToText(value = '') {
  return String(value)
    .replace(/<\s*(br|\/div|\/p|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildBenefitIndicators(promptText, tags) {
  const source = (promptText + ' ' + (tags || []).join(' ')).toLowerCase();
  const benefits = [];
  if (/face|identity|portrait|recogniz/.test(source)) benefits.push('Identity preservation');
  if (/photo|realistic|hyper|detailed/.test(source)) benefits.push('Photorealistic output');
  if (/cinematic|lighting|dramatic|editorial/.test(source)) benefits.push('Editorial lighting');
  if (/instagram|reel|story|social/.test(source)) benefits.push('Social-ready format');
  if (/professional|linkedin|corporate|business/.test(source)) benefits.push('Professional quality');
  if (/bokeh|background|blur|depth/.test(source)) benefits.push('Depth of field');
  if (benefits.length === 0) benefits.push('Ready to use');
  return benefits.slice(0, 4);
}

export default function PromptDetailExperience({
  children,
  promptText = '',
  promptId = '',
  reviewPromptId = null,
  tags = [],
  title = '',
  description = '',
  category = '',
  categoryUrl = '',
  allCategories = [],
  useCase = '',
  uniqueFeature = '',
  defaultAspectRatio = '4:5',
  recommendedAspectRatio = '',
  aspectRatioReason = '',
  imageUrl = '',
  shareUrl = '',
  hasCustomHowToSteps = false,
}) {
  const [selectedRatio, setSelectedRatio] = useState(
    isSupportedAspectRatio(defaultAspectRatio) || '4:5'
  );
  const normalizedRecommendedAspectRatio = isSupportedAspectRatio(recommendedAspectRatio);
  const [copiedTags, setCopiedTags] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [hasPassedPreview, setHasPassedPreview] = useState(false);
  const [isPrimaryCopyVisible, setIsPrimaryCopyVisible] = useState(true);
  const previewRef = useRef(null);
  const primaryCopyButtonRef = useRef(null);
  const promptRef = useRef(null);
  const [needsExpansion, setNeedsExpansion] = useState(false);

  // Rating flow is intentionally disabled — no rating card, no /rate POST.
  const { copied: copiedPrompt, copyGate, requestCopy } = useCopyGate({
    successDuration: 2200,
    promptId: reviewPromptId,
  });

  const plainPrompt = useMemo(() => promptHtmlToText(promptText), [promptText]);
  const displayPrompt = useMemo(
    () => withAspectRatio(plainPrompt, selectedRatio),
    [plainPrompt, selectedRatio]
  );
  const promptWordCount = plainPrompt ? plainPrompt.split(/\s+/).filter(Boolean).length : 0;

  useEffect(() => {
    const previewElement = previewRef.current;
    const copyButton = primaryCopyButtonRef.current;
    if (!previewElement || !copyButton || typeof IntersectionObserver === 'undefined') return undefined;

    let previewIsAboveViewport = false;
    let copyButtonIsVisible = true;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === previewElement) {
          previewIsAboveViewport = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
          setHasPassedPreview(previewIsAboveViewport);
        } else if (entry.target === copyButton) {
          copyButtonIsVisible = entry.isIntersecting;
          setIsPrimaryCopyVisible(copyButtonIsVisible);
        }
      }
    });

    observer.observe(previewElement);
    observer.observe(copyButton);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const promptElement = promptRef.current;
    if (!promptElement) return undefined;

    const updateExpansionState = () => {
      setNeedsExpansion(promptElement.scrollHeight > 180);
    };

    if (typeof ResizeObserver === 'undefined') {
      updateExpansionState();
      return undefined;
    }

    const resizeObserver = new ResizeObserver(updateExpansionState);
    resizeObserver.observe(promptElement);

    return () => resizeObserver.disconnect();
  }, [displayPrompt, expanded]);

  const copyPrompt = useCallback(async () => {
    await requestCopy(displayPrompt);
  }, [requestCopy, displayPrompt]);

  const sharePrompt = useCallback(async () => {
    const url = shareUrl || (typeof window !== 'undefined' ? window.location.href : '');
    if (!url) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: title || 'AQPrompts prompt',
          url,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 1800);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') console.error('Unable to share prompt.', error);
    }
  }, [shareUrl, title]);

  async function copyTags() {
    try {
      const tagText = tags.map((tagItem) => `#${String(tagItem).replace(/\s+/g, '')}`).join(' ');
      await navigator.clipboard.writeText(tagText);
      setCopiedTags(true);
      window.setTimeout(() => setCopiedTags(false), 1800);
    } catch (error) {
      console.error('Unable to copy prompt tags.', error);
    }
  }

  const benefits = useMemo(() => buildBenefitIndicators(plainPrompt, tags), [plainPrompt, tags]);
  return (
    <>
      {copyGate}
      <section className="mx-auto max-w-7xl px-4 pt-4 pb-3 sm:px-6 lg:px-8 lg:pt-6">
        <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.12)] ring-1 ring-white dark:border-white/[0.1] dark:bg-[#0c0f15] dark:shadow-[0_32px_100px_rgba(0,0,0,0.48)] dark:ring-white/[0.04]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-300 via-[#ff6b35] to-amber-300" aria-hidden="true" />
          <div className="grid gap-4 p-3 sm:gap-5 sm:p-5 lg:grid-cols-[minmax(0,0.48fr)_minmax(0,0.52fr)] lg:gap-8 lg:p-6">
            <div ref={previewRef} className="min-w-0 rounded-[22px] border border-white/[0.12] bg-[#10151d] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.22)] sm:p-2.5">
              {children}
              <AdsterraNativeBanner className="prompt-detail-adsterra-native-slot" />
            </div>

            <div className="min-w-0 flex flex-col justify-center py-3 sm:px-2 lg:px-4 lg:py-7">
              <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/[0.08] dark:text-orange-200">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Ready-to-use image prompt
              </div>
              <h1 className="max-w-2xl text-[1.85rem] font-black leading-[1.04] tracking-[-0.045em] text-slate-950 dark:text-white sm:text-[2.35rem] lg:text-[2.8rem]">
                {title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                {category ? (
                  <Link href={categoryUrl || '/tools/ai-image-prompts'} className="font-bold text-orange-700 transition hover:text-orange-600 dark:text-orange-300 dark:hover:text-orange-200">
                    {category}
                  </Link>
                ) : null}
                {useCase && useCase !== category ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{useCase}</span>
                  </>
                ) : null}
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm dark:border-white/[0.09] dark:bg-white/[0.035] sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300">
                    Aspect Ratio
                  </p>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-orange-200">Choose a format</span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {ratios.map((ratio) => {
                    const isSelected = selectedRatio === ratio;
                    return (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setSelectedRatio(ratio)}
                        aria-pressed={isSelected}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] font-semibold transition-all ${
                          isSelected
                            ? 'border-orange-500 bg-orange-500 text-white shadow-[0_8px_18px_rgba(255,107,53,0.28)]'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-white/[0.1] dark:bg-[#111720] dark:text-[#cbd3df] dark:hover:border-[#ff6b35]/50 dark:hover:bg-[#171e29] dark:hover:text-white'
                        }`}
                      >
                        <span aria-hidden="true" className={isSelected ? 'text-white' : 'text-[#8b939d]'}>{ratioIcons[ratio]}</span>
                        <span>{ratio}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {normalizedRecommendedAspectRatio ? (
                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-600 dark:text-[#b7bec8]">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#ff6b35]/10 text-[#ff8a5e]">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                  <span>
                    Recommended: <span className="font-semibold text-slate-950 dark:text-white">{normalizedRecommendedAspectRatio}</span>
                    {aspectRatioReason ? ` · ${aspectRatioReason}` : ''}
                  </span>
                </div>
              ) : null}

              <button
                type="button"
                ref={primaryCopyButtonRef}
                onClick={copyPrompt}
                className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#ff7848] to-[#ff632d] px-5 text-[15px] font-black text-white shadow-[0_14px_30px_rgba(255,107,53,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:from-[#f56838] hover:to-[#e85d28] hover:shadow-[0_18px_34px_rgba(255,107,53,0.34)] focus:outline-none focus:ring-2 focus:ring-[#ff915e] focus:ring-offset-2 focus:ring-offset-white active:translate-y-px dark:focus:ring-offset-[#0b0d12]"
              >
                {copiedPrompt ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                {copiedPrompt ? 'Copied!' : 'Copy Full Prompt'}
              </button>

              <p className="mt-4 max-w-xl text-[13px] leading-6 text-slate-600 dark:text-[#e0e0e0] sm:text-sm" dangerouslySetInnerHTML={{ __html: description }} />

              {allCategories.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {allCategories.slice(0, 4).map((cat, index) => (
                    <Link
                      key={cat}
                      href={index === 0 ? (categoryUrl || '/tools/ai-image-prompts') : '/tools/ai-image-prompts'}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-700 dark:border-white/15 dark:bg-white/[0.05] dark:text-[#e0e0e0] dark:hover:border-[#ff6b35]/50 dark:hover:text-white"
                    >
                      {cat}
                    </Link>
                  ))}
                </div>
              ) : null}

              {benefits.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {benefits.map((benefit) => (
                    <span
                      key={benefit}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm dark:border-white/[0.1] dark:bg-white/[0.035] dark:text-[#d4dae3]"
                    >
                      <Check className="h-3 w-3 text-[#ff8a5e]" aria-hidden="true" />
                      {benefit}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <a
                  href={imageUrl || '#'}
                  download={title ? `${title.replace(/\s+/g, '-').toLowerCase()}.jpg` : undefined}
                  onClick={() => {
                    if (imageUrl) {
                      window.setTimeout(() => {
                        window.location.assign(PROMPT_DOWNLOAD_AD_URL);
                      }, 500);
                    }
                  }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-white/[0.11] dark:bg-white/[0.035] dark:text-[#dfe5ed] dark:hover:border-[#ff6b35]/50 dark:hover:bg-[#ff6b35]/[0.08] dark:hover:text-white"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={sharePrompt}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-white/[0.11] dark:bg-white/[0.035] dark:text-[#dfe5ed] dark:hover:border-[#ff6b35]/50 dark:hover:bg-[#ff6b35]/[0.08] dark:hover:text-white"
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  {shareCopied ? 'Link copied' : 'Share'}
                </button>
              </div>

              <div className="mt-4">
                <PromptEngagementBar promptId={promptId} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
        <div className="rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#0b0d12] dark:shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:p-5">
          <details className="group relative" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 pr-32 text-base font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] dark:text-white sm:text-lg [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-[10px] font-extrabold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">The prompt</span>
                <span className="mt-1 block">Ready to copy and create</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <button
              type="button"
              onClick={copyPrompt}
              className="absolute top-0 right-0 inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-orange-300 hover:text-orange-700 dark:border-white/10 dark:bg-[#10151d] dark:text-[#dfe5ed] dark:hover:border-[#ff6b35]/50 dark:hover:text-white"
            >
              {copiedPrompt ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copiedPrompt ? 'Copied' : 'Copy prompt'}
            </button>
            <div className="pt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Personalize the ratio above, then copy your prompt.</span>
                <span className="shrink-0 font-semibold">{promptWordCount.toLocaleString()} words</span>
              </div>
              <div
                ref={promptRef}
                className={`overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left font-mono text-[12px] leading-[1.8] text-slate-700 shadow-inner sm:p-6 sm:text-[13px] dark:border-white/10 dark:bg-[#11161d] dark:text-[#e5edf6] [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#ff6b35]/60 [&::-webkit-scrollbar-track]:bg-white/[0.03] ${
                  expanded ? 'max-h-none' : 'max-h-[360px] sm:max-h-[500px]'
                }`}
              >
                {displayPrompt}
              </div>

              {needsExpansion ? (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-700 dark:border-white/10 dark:bg-[#10151d] dark:text-[#d4dae3] dark:hover:border-[#ff6b35]/40 dark:hover:text-white"
                >
                  {expanded ? (
                    <><ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />Show less</>
                  ) : (
                    <><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />Show full prompt</>
                  )}
                </button>
              ) : null}

              {tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copyTags}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-700 dark:border-white/10 dark:bg-[#10151d] dark:text-[#dfe5ed] dark:hover:border-[#ff6b35]/40 dark:hover:text-white"
                  >
                    {copiedTags ? <Check className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
                    {copiedTags ? 'Tags copied' : 'Copy tags'}
                  </button>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      </section>

      {!hasCustomHowToSteps ? (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-8">
          <div className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.07)] dark:border-white/[0.08] dark:bg-[#111118] sm:p-1">
            <div className="grid md:grid-cols-[minmax(13rem,0.35fr)_minmax(0,0.65fr)]">
              <div className="bg-[linear-gradient(145deg,#fff7f2,#fff)] p-6 dark:bg-[linear-gradient(145deg,rgba(255,107,53,0.09),rgba(17,17,24,0.65))] sm:p-8">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">Simple workflow</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">How to use this prompt</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">A few quick steps to get a result that feels like yours.</p>
              </div>
              <ol className="space-y-3 p-6 sm:p-8">
                {[
                  'Copy the prompt using the button above.',
                  'Open the AI tool that works best for your prompt.',
                  'If supported, upload your reference photo before pasting the prompt.',
                  'Select the recommended aspect ratio before generating.',
                  'Adjust details like clothing, background, or lighting to personalize the result.',
                ].map((step, index) => (
                  <li key={step} className="flex items-start gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-xs font-extrabold text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-200">{index + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      ) : null}

      {hasPassedPreview && !isPrimaryCopyVisible ? (
        <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_28px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#111118]/95 md:inset-x-auto md:right-6 md:bottom-6 md:w-auto md:rounded-2xl md:border md:p-2">
          <button
            type="button"
            onClick={copyPrompt}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff7848] to-[#ff632d] px-5 text-sm font-black text-white shadow-[0_8px_20px_rgba(255,107,53,0.25)] transition hover:from-[#f56838] hover:to-[#e85d28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff915e] focus-visible:ring-offset-2 md:w-auto"
          >
            {copiedPrompt ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
            {copiedPrompt ? 'Copied!' : 'Copy Full Prompt'}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function PromptVariationCard({ variation, promptId }) {
  const { copied, copyGate, requestCopy } = useCopyGate({ successDuration: 2200, promptId });

  return (
    <article className="group rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_18px_45px_rgba(15,23,42,0.09)] dark:border-white/[0.08] dark:bg-[#111118] dark:hover:border-orange-500/25 sm:p-6">
      {copyGate}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-black text-slate-950 dark:text-white">{variation.label}</h3>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 transition group-hover:bg-orange-500 group-hover:text-white dark:bg-orange-500/10 dark:text-orange-300">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600 dark:text-[#d1d5db]">{variation.text}</p>
      <button
        type="button"
        onClick={() => requestCopy(variation.text)}
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-xs font-extrabold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff915e]"
      >
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copied ? 'Copied!' : 'Copy this variation'}
      </button>
    </article>
  );
}
