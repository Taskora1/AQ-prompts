'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { hasConsent } from '@/lib/consent';

const LAST_VISIT_KEY = 'aqprompts_last_visit';
const SEEN_PROMPTS_KEY = 'aqprompts_seen_prompt_ids';

function getPromptId(prompt) {
  return String(prompt?.slug || prompt?.id || prompt?.title || '').trim();
}

function getPromptTimestamp(prompt) {
  const rawDate = String(prompt?.createdAt || prompt?.date || prompt?.updatedAt || '').trim();
  if (!rawDate) return 0;

  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? `${rawDate}T23:59:59.999Z` : rawDate;
  const timestamp = Date.parse(normalizedDate);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatNewCount(count) {
  return count > 50 ? '50+' : String(count);
}

function readSeenPromptIds() {
  if (!hasConsent('preferences')) return new Set();

  try {
    const ids = JSON.parse(window.localStorage.getItem(SEEN_PROMPTS_KEY) || '[]');
    return Array.isArray(ids) ? new Set(ids.map(String).filter(Boolean)) : new Set();
  } catch {
    return new Set();
  }
}

export default function NewSinceLastVisitBanner({ prompts = [] }) {
  const [newCount, setNewCount] = useState(0);
  const [visible, setVisible] = useState(false);

  const promptMeta = useMemo(
    () => prompts.map((prompt) => ({ id: getPromptId(prompt), timestamp: getPromptTimestamp(prompt) })).filter((prompt) => prompt.id),
    [prompts]
  );

  const currentPromptIds = useMemo(() => promptMeta.map((prompt) => prompt.id), [promptMeta]);

  useEffect(() => {
    if (currentPromptIds.length === 0 || !hasConsent('preferences')) return;

    const now = Date.now();
    const seenPromptIds = readSeenPromptIds();
    const hasSeenPromptHistory = seenPromptIds.size > 0;

    if (hasSeenPromptHistory) {
      const nextNewCount = currentPromptIds.filter((id) => !seenPromptIds.has(id)).length;

      if (nextNewCount > 0) {
        setNewCount(nextNewCount);
        setVisible(true);
        return;
      }

      window.localStorage.setItem(LAST_VISIT_KEY, String(now));
      window.localStorage.setItem(SEEN_PROMPTS_KEY, JSON.stringify(currentPromptIds));
      return;
    }

    const lastVisit = Number(window.localStorage.getItem(LAST_VISIT_KEY) || 0);

    if (lastVisit) {
      const nextNewCount = promptMeta.filter((prompt) => prompt.timestamp > lastVisit).length;

      if (nextNewCount > 0) {
        setNewCount(nextNewCount);
        setVisible(true);
        return;
      }
    }

    window.localStorage.setItem(LAST_VISIT_KEY, String(now));
    window.localStorage.setItem(SEEN_PROMPTS_KEY, JSON.stringify(currentPromptIds));
  }, [currentPromptIds, promptMeta]);

  function markSeen() {
    window.localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
    window.localStorage.setItem(SEEN_PROMPTS_KEY, JSON.stringify(currentPromptIds));
    setVisible(false);
  }

  function handleSeeNew() {
    document.getElementById('newly-added-prompts')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    markSeen();
  }

  if (!visible || newCount <= 0) return null;

  return (
    <section className="border-b border-[#ff6b35]/20 bg-[#fff4ef] px-4 py-3 dark:border-[#ff6b35]/25 dark:bg-[#1b1514]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-sm font-bold leading-6 text-slate-900 dark:text-white">
          {formatNewCount(newCount)} new prompts added since your last visit!
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSeeNew}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#ff6b35] px-4 text-xs font-black text-white transition hover:bg-[#ff6b35]/90"
          >
            See what&apos;s new
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={markSeen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ff6b35]/25 bg-white/70 text-slate-600 transition hover:border-[#ff6b35] hover:text-[#c2410c] dark:bg-black/20 dark:text-slate-300"
            aria-label="Dismiss new prompts banner"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
