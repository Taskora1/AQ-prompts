'use client';

import { useEffect, useState } from 'react';
import { Bookmark } from 'lucide-react';

import { isFavoritePrompt, toggleFavoritePrompt } from '@/lib/favorites';
import SaveConsentNotice from '@/components/SaveConsentNotice';

// ---------------------------------------------------------------------------
// Engagement stats are gone: the stats API route was removed 2026-11-11
// (user decision — the endpoint is not needed). This bar is now just the
// Save button, which is local-only (favourites in localStorage).
// Engagement tracking (view/copy/like/rate POSTs) is intentionally disabled.
// ---------------------------------------------------------------------------

export default function PromptEngagementBar({
  promptId,
  className = '',
}) {
  const [saved, setSaved] = useState(false);
  const [showSaveConsentNotice, setShowSaveConsentNotice] = useState(false);

  useEffect(() => {
    if (!promptId) return undefined;
    setSaved(isFavoritePrompt(promptId));
    return undefined;
  }, [promptId]);

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
      </div>
      <SaveConsentNotice open={showSaveConsentNotice} onClose={() => setShowSaveConsentNotice(false)} />
    </div>
  );
}
