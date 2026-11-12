'use client';

import Link from 'next/link';
import { Bookmark, Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getCloudinaryResponsiveImage, optimizeCloudinaryUrl } from '@/lib/cloudinary-optimize';
import { FAVORITES_CHANGED_EVENT, isFavoritePrompt, toggleFavoritePrompt } from '@/lib/favorites';
import SaveConsentNotice from '@/components/SaveConsentNotice';
import { getPromptThumbnailPath, getPromptThumbnailSrcSet } from '@/lib/prompt-images';
import { getPromptUrl } from '@/lib/prompt-constants';
import { useCopyGate } from '@/components/CopyGate';

export default function PromptFeedCard({
  promptId,
  title,
  image,
  imageAlt = '',
  slug,
  href,
  subtitle,
  promptText = '',
  showSave = false,
  mobileTitleBelow = false,
  uniformAspectRatio = false,
  wideOnMobile = false,
  // First card on listing pages passes priority so the LCP image is fetched
  // eagerly instead of lazily (library LCP was 4.1s with a 2,830ms load delay).
  priority = false,
  sizes = '(max-width: 767px) calc(50vw - 14px), (max-width: 1023px) calc(33.333vw - 24px), (max-width: 1279px) calc(25vw - 28px), 292px',
}) {
  const promptUrl = href || getPromptUrl({ slug, title });
  const [saved, setSaved] = useState(false);
  const [showSaveConsentNotice, setShowSaveConsentNotice] = useState(false);
  const thumbnail = getPromptThumbnailPath(image);
  const responsiveImage = getCloudinaryResponsiveImage(thumbnail, {
    widths: [160, 200, 240, 320, 360, 480, 640, 720, 800, 960, 1080],
    quality: 'auto',
  });
  // Local thumbs have no Cloudinary srcSet, so fall back to the generated
  // 360w/640w pair (see getPromptThumbnailSrcSet). The `sizes` prop already
  // describes the card width, so the browser picks the small file at low
  // DPR instead of always downloading the 640px thumb.
  const localSrcSet = getPromptThumbnailSrcSet(thumbnail);
  const { copied, copyGate, requestCopy } = useCopyGate({ promptId });

  async function handleCopy(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!promptText) return;
    try {
      await requestCopy(promptText);
    } catch {
      // CopyGate handles visible subscribe/copy errors.
    }
  }

  useEffect(() => {
    if (!showSave || !promptId) return undefined;

    const syncSavedState = () => setSaved(isFavoritePrompt(promptId));
    syncSavedState();
    window.addEventListener(FAVORITES_CHANGED_EVENT, syncSavedState);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, syncSavedState);
  }, [promptId, showSave]);

  function handleSave(event) {
    event.preventDefault();
    event.stopPropagation();
    const result = toggleFavoritePrompt(promptId);
    if (!result.persisted && result.favorite) {
      // No "preferences" consent, so nothing was stored: do not show the
      // button as Saved, and explain why instead of failing silently.
      setSaved(false);
      setShowSaveConsentNotice(true);
      return;
    }
    setSaved(result.favorite);
  }

  return (
    <article className={`prompt-feed-card group relative w-full overflow-hidden rounded-xl border border-transparent bg-white shadow-sm transition-[border-color,box-shadow] hover:border-[#ff6b35]/30 hover:shadow-lg sm:rounded-2xl dark:border-white/10 dark:bg-[#171820] dark:hover:border-[#ff6b35]/40 ${
      uniformAspectRatio ? `block ${wideOnMobile ? 'col-span-2 sm:col-span-1' : ''}` : 'mb-2 inline-block break-inside-avoid sm:mb-3'
    }`}>
      <Link
        href={promptUrl}
        className="block overflow-hidden rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff9a73]"
      >
        <span className={`relative block overflow-hidden ${
          uniformAspectRatio ? (wideOnMobile ? 'aspect-[16/7] sm:aspect-[4/5]' : 'aspect-[4/5]') : ''
        }`}>
          <img
            src={optimizeCloudinaryUrl(thumbnail, { width: 360, quality: 'auto' })}
            srcSet={responsiveImage?.srcSet || localSrcSet}
            alt={imageAlt || title}
            sizes={sizes}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding="async"
            style={uniformAspectRatio ? undefined : { aspectRatio: 'auto 4 / 5' }}
            className={`block w-full transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transform-none ${
              uniformAspectRatio ? 'absolute inset-0 h-full object-cover' : 'h-auto'
            }`}
          />
          <span
            className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-100 ${mobileTitleBelow ? 'hidden sm:block' : ''}`}
            aria-hidden="true"
          />
          <span className={`pointer-events-none absolute inset-x-0 bottom-0 p-2.5 text-left sm:p-3.5 ${mobileTitleBelow ? 'hidden sm:block' : 'block'}`}>
            <span
              className="block text-xs font-bold leading-snug text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.8)] sm:text-sm"
              style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}
            >
              {title}
            </span>
            {subtitle ? (
              <span className="mt-1 block text-[10px] font-semibold text-white/90 [text-shadow:0_1px_5px_rgba(0,0,0,0.8)] sm:text-xs">
                {subtitle}
              </span>
            ) : null}
          </span>
        </span>
        {mobileTitleBelow ? (
          <span className="block bg-white p-2.5 text-left text-slate-950 dark:bg-[#171820] dark:text-white sm:hidden">
            <span
              className="block text-xs font-bold leading-snug"
              style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}
            >
              {title}
            </span>
            {subtitle ? <span className="mt-1 block text-[10px] font-semibold text-slate-600 dark:text-slate-300">{subtitle}</span> : null}
          </span>
        ) : null}
      </Link>
      {showSave && promptId ? (
        <button
          type="button"
          onClick={handleSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${title} from saved prompts` : `Save ${title}`}
          className="absolute right-2 top-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/95 text-slate-700 shadow-md transition hover:scale-105 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9a73] dark:border-white/20 dark:bg-[#20212b]/95 dark:text-white"
        >
          <Bookmark className={`h-5 w-5 ${saved ? 'fill-[#ff6b35] text-[#c2410c]' : ''}`} aria-hidden="true" />
        </button>
      ) : null}
      {promptText ? (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Prompt copied' : `Copy ${title} prompt`}
          title={copied ? 'Copied!' : 'Copy prompt'}
          className={`absolute left-2 top-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-md transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9a73] ${
            copied
              ? 'border-emerald-500/40 bg-emerald-500 text-white'
              : 'border-white/70 bg-[#ff6b35] text-white hover:bg-[#e85d28] dark:border-white/20'
          }`}
        >
          {copied ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
        </button>
      ) : null}
      {copyGate}
      <SaveConsentNotice open={showSaveConsentNotice} onClose={() => setShowSaveConsentNotice(false)} />
    </article>
  );
}
