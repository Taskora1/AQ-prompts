'use client';

import { useEffect, useState } from 'react';
import { Bookmark, Copy, Eye } from 'lucide-react';

import { isFavoritePrompt, toggleFavoritePrompt } from '@/lib/favorites';

const EMPTY_STATS = { views: 0, likes: 0, copies: 0, ratingSum: 0, ratingCount: 0, avgRating: 0 };

function formatCount(value) {
  const number = Number(value || 0);

  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}m`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}k`;
  return String(number);
}

async function loadStats() {
  if (!window.__aqPromptsStatsPromise) {
    window.__aqPromptsStatsPromise = fetch('/api/prompts/stats', {
      headers: { Accept: 'application/json' },
    }).then(async (response) => {
      if (!response.ok) throw new Error('Unable to load prompt stats.');
      return response.json();
    });
  }

  return window.__aqPromptsStatsPromise;
}

// ---------------------------------------------------------------------------
// Engagement tracking (view/copy/like/rate POSTs) is intentionally disabled.
// These helpers are kept as no-ops so existing imports keep working without
// issuing any network request. Re-enable by restoring the fetch bodies.
// ---------------------------------------------------------------------------

export async function trackPromptCopy() {
  // Engagement tracking disabled — no POST to /api/prompts/[id]/copy.
  return null;
}

async function trackView() {
  // Engagement tracking disabled — no POST to /api/prompts/[id]/view and no
  // sessionStorage marker is created.
  return null;
}

export default function PromptEngagementBar({
  promptId,
  compact = false,
  trackPromptView = true,
  showRating = true,
  initialStats = null,
  className = '',
}) {
  const [stats, setStats] = useState(initialStats || EMPTY_STATS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!promptId) return undefined;

    let cancelled = false;

    setSaved(isFavoritePrompt(promptId));

    if (initialStats) {
      setStats(initialStats);
    } else {
      loadStats()
        .then((payload) => {
          if (!cancelled) {
            setStats(payload.stats?.[promptId] || EMPTY_STATS);
          }
        })
        .catch(() => {});
    }

    function handleCopyEvent(event) {
      if (event.detail?.promptId === promptId && event.detail?.copies !== undefined) {
        setStats((current) => ({ ...current, copies: event.detail.copies }));
      }
    }

    window.addEventListener('aqprompts:copy', handleCopyEvent);

    return () => {
      cancelled = true;
      window.removeEventListener('aqprompts:copy', handleCopyEvent);
    };
  }, [initialStats, promptId]);

  function handleSave(event) {
    event?.preventDefault();
    event?.stopPropagation();

    const result = toggleFavoritePrompt(promptId);
    setSaved(result.favorite);
  }

  const itemClass = compact
    ? 'inline-flex items-center gap-1 text-[11px] font-semibold text-[#6b7280] dark:text-[#9ca3af]'
    : 'inline-flex items-center gap-1.5 text-xs font-semibold text-[#6b7280] dark:text-[#9ca3af]';
  const viewCount = Number(stats.views || 0);
  const copyCount = Number(stats.copies || 0);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {viewCount > 0 ? (
          <span className={itemClass} aria-label={`${viewCount} views`}>
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{formatCount(viewCount)} views</span>
          </span>
        ) : null}
        {copyCount > 0 ? (
          <span className={itemClass} aria-label={`${copyCount} copies`} title="Prompt copy count">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{formatCount(copyCount)} copies</span>
          </span>
        ) : null}
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
      </div>
    </div>
  );
}
