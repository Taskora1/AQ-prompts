'use client';

import { useEffect, useState } from 'react';
import { Bookmark, Eye, Heart } from 'lucide-react';

import { isFavoritePrompt, toggleFavoritePrompt } from '@/lib/favorites';
import SaveConsentNotice from '@/components/SaveConsentNotice';
import { formatCompactCount } from '@/lib/prompt-card';

// Engagement (views/likes) — counts live on the prompts row (view_count /
// like_count), so the numbers below arrive with the prompt and cost zero
// extra reads. Views: EVERY detail-page visit counts (owner rule 2026-11-16)
// — the POST fires on every mount, no session dedupe. Likes: one per
// browser, guarded by localStorage here; the server counts what it receives.

const LIKE_STORAGE_PREFIX = 'aqprompts-liked-';

function likeStorageKey(promptDbId) {
  return `${LIKE_STORAGE_PREFIX}${promptDbId}`;
}

function hasLikedPrompt(promptDbId) {
  if (!promptDbId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(likeStorageKey(promptDbId)) === '1';
  } catch {
    return false;
  }
}

export default function PromptEngagementBar({
  promptId,
  promptDbId = null,
  initialViewCount = 0,
  initialLikeCount = 0,
  className = '',
}) {
  const [saved, setSaved] = useState(false);
  const [showSaveConsentNotice, setShowSaveConsentNotice] = useState(false);
  const [viewCount, setViewCount] = useState(Math.max(0, Number(initialViewCount) || 0));
  const [likeCount, setLikeCount] = useState(Math.max(0, Number(initialLikeCount) || 0));
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    if (!promptId) return undefined;
    setSaved(isFavoritePrompt(promptId));
    return undefined;
  }, [promptId]);

  // One view per detail-page visit: the same user opening the page twice
  // counts twice (owner rule). Fire-and-forget — a failed POST never
  // breaks the page.
  useEffect(() => {
    if (!promptDbId || !Number.isSafeInteger(Number(promptDbId))) return undefined;
    let cancelled = false;
    fetch(`/api/prompts/${promptDbId}/view`, { method: 'POST' })
      .then(async (response) => {
        if (cancelled || !response.ok) return;
        const data = await response.json().catch(() => null);
        if (data && Number.isSafeInteger(data.viewCount)) setViewCount(data.viewCount);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [promptDbId]);

  useEffect(() => {
    setLiked(hasLikedPrompt(promptDbId));
  }, [promptDbId]);

  function handleSave(event) {
    event?.preventDefault();
    event?.stopPropagation();

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

  async function handleLike(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (liked || liking || !promptDbId) return;
    setLiking(true);
    try {
      const response = await fetch(`/api/prompts/${promptDbId}/like`, { method: 'POST' });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (data && Number.isSafeInteger(data.likeCount)) setLikeCount(data.likeCount);
      setLiked(true);
      try {
        window.localStorage.setItem(likeStorageKey(promptDbId), '1');
      } catch {
        // Private mode: the like still counted, it just is not remembered.
      }
    } catch {
      // Liking is best-effort; a failed POST leaves the button unliked.
    } finally {
      setLiking(false);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          aria-pressed={saved}
          aria-label={saved ? 'Remove saved prompt' : 'Save prompt'}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb]/60 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#6b7280] transition-all duration-200 hover:border-[#ff6b35]/60 hover:text-[#c2410c] hover:bg-[#fff4ef]/60 hover:shadow-[0_2px_8px_rgba(255,107,53,0.08)] dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-[#ff6b35]/40 dark:hover:bg-[#ff6b35]/10 dark:hover:text-[#c2410c]"
        >
          <Bookmark className={`h-3.5 w-3.5 transition-all duration-200 ${saved ? 'fill-[#ff6b35] text-[#c2410c] scale-110' : ''}`} aria-hidden="true" />
          <span>{saved ? 'Saved' : 'Save'}</span>
        </button>
        <button
          type="button"
          onClick={handleLike}
          disabled={liking || !promptDbId}
          aria-pressed={liked}
          aria-label={liked ? 'You liked this prompt' : 'Like this prompt'}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb]/60 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#6b7280] transition-all duration-200 hover:border-[#ff6b35]/60 hover:text-[#c2410c] hover:bg-[#fff4ef]/60 hover:shadow-[0_2px_8px_rgba(255,107,53,0.08)] disabled:opacity-60 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-[#ff6b35]/40 dark:hover:bg-[#ff6b35]/10 dark:hover:text-[#c2410c]"
        >
          <Heart className={`h-3.5 w-3.5 transition-all duration-200 ${liked ? 'fill-[#ff6b35] text-[#c2410c] scale-110' : ''}`} aria-hidden="true" />
          <span>{liked ? 'Liked' : 'Like'}</span>
        </button>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
        <span className="inline-flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {formatCompactCount(viewCount)} {viewCount === 1 ? 'view' : 'views'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5" aria-hidden="true" />
          {formatCompactCount(likeCount)} {likeCount === 1 ? 'like' : 'likes'}
        </span>
      </p>
      <SaveConsentNotice open={showSaveConsentNotice} onClose={() => setShowSaveConsentNotice(false)} />
    </div>
  );
}
