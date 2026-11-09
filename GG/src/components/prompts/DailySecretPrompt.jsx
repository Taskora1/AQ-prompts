'use client';

import Link from 'next/link';
import { Check, Copy, LockKeyhole, Share2, Sparkles, Unlock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'aqprompts_daily_secret_v1';
const REQUIRED_PROMPTS = 4;

function localDay() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function readProgress() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!value || value.day !== localDay() || !Array.isArray(value.slugs)) return [];
    return [...new Set(value.slugs.filter(Boolean))];
  } catch {
    return [];
  }
}

function saveProgress(slugs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: localDay(), slugs }));
  } catch {
    // Private browsing and storage-quota failures must not break the page.
  }
}

function trackEvent(name, detail = {}) {
  if (typeof window === 'undefined') return;
  if (window.dataLayer && Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: `aq_${name}`, ...detail });
  }
}

async function copyLink(url) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const input = document.createElement('textarea');
  input.value = url;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export default function DailySecretPrompt({
  promptSlug = '',
  secretPrompt = null,
  discoveryPrompts = [],
}) {
  const [visited, setVisited] = useState([]);
  const [unlocked, setUnlocked] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    function refreshProgress() {
      const current = readProgress();
      if (promptSlug && !current.includes(promptSlug)) {
        current.push(promptSlug);
        saveProgress(current);
        trackEvent('discovery_prompt_view', { prompt_slug: promptSlug });
      }
      setVisited(current);
      setUnlocked(current.length >= REQUIRED_PROMPTS);
    }

    refreshProgress();
    const intervalId = window.setInterval(refreshProgress, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [promptSlug]);

  const canUnlock = visited.length >= REQUIRED_PROMPTS;
  const secretUrl = secretPrompt?.slug ? `/tools/ai-image-prompts/p/${secretPrompt.slug}` : '';
  const nextPrompt = discoveryPrompts.find((item) => item?.slug && !visited.includes(item.slug));
  const progressLabel = useMemo(
    () => {
      const count = Math.min(visited.length, REQUIRED_PROMPTS);
      if (count >= REQUIRED_PROMPTS) return `Nice! You discovered ${REQUIRED_PROMPTS} prompts today.`;
      if (count === REQUIRED_PROMPTS - 1) return `Just 1 more prompt to unlock today's Secret Prompt!`;
      if (count === 0) return `Discover ${REQUIRED_PROMPTS} prompts to unlock today's Secret Prompt.`;
      return `${count}/${REQUIRED_PROMPTS} discovered`;
    },
    [visited.length],
  );

  if (!secretPrompt?.slug) return null;

  async function handleShare() {
    const url = `${window.location.origin}${secretUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'AQPrompts Daily Secret Prompt', url });
      } else {
        await copyLink(url);
        setShared(true);
        window.setTimeout(() => setShared(false), 1800);
      }
      trackEvent('secret_prompt_shared');
    } catch {
      // Sharing can be cancelled by the visitor.
    }
  }

  function unlockPrompt() {
    setUnlocked(true);
    trackEvent('secret_prompt_unlocked');
  }

  return (
    <section
      aria-labelledby="daily-secret-prompt-title"
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10 lg:px-8"
    >
      <div className="overflow-hidden rounded-2xl border border-[#ff6b35]/30 bg-[linear-gradient(135deg,#fff8f3,#fff1e9)] p-5 shadow-sm dark:border-[#ff6b35]/25 dark:bg-[linear-gradient(135deg,#1c1411,#151116)] sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#c2410c]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Daily Secret Prompt
            </p>
            <h2 id="daily-secret-prompt-title" className="mt-2 text-xl font-black text-[#111118] dark:text-white">
              {unlocked ? secretPrompt.title || 'Your secret prompt is ready' : 'Unlock a prompt picked just for today'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6b7280] dark:text-[#9ca3af]">
              {unlocked ? (
                <>
                  Here's your bonus prompt. Your unlock resets tomorrow.{' '}
                  <Link href="/secret-prompts" className="font-bold text-[#c2410c] hover:underline dark:text-[#ff9f74]">
                    Open the Secret Prompt Vault
                  </Link>
                </>
              ) : progressLabel}
            </p>
          </div>
          {unlocked ? (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Link
                href={secretUrl}
                onClick={() => trackEvent('secret_prompt_view', { prompt_slug: secretPrompt.slug })}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ff6b35] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d4520a]"
              >
                <Unlock className="h-4 w-4" aria-hidden="true" />
                View Secret Prompt
              </Link>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#ff6b35]/40 bg-white px-4 py-3 text-sm font-bold text-[#c2410c] transition hover:bg-[#fff4ef] dark:bg-white/[0.04] dark:text-[#ff9f74]"
              >
                {shared ? <Check className="h-4 w-4" /> : typeof navigator !== 'undefined' && navigator.share ? <Share2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {shared ? 'Link copied' : typeof navigator !== 'undefined' && navigator.share ? 'Share' : 'Copy Link'}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {nextPrompt ? (
                <Link
                  href={`/tools/ai-image-prompts/p/${nextPrompt.slug}`}
                  onClick={() => trackEvent('continue_exploring_clicked', { prompt_slug: nextPrompt.slug })}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#ff6b35]/40 bg-white px-4 py-3 text-sm font-bold text-[#c2410c] transition hover:bg-[#fff4ef] dark:bg-white/[0.04] dark:text-[#ff9f74]"
                >
                  Continue Exploring
                </Link>
              ) : null}
              <button
                type="button"
                disabled={!canUnlock}
                onClick={unlockPrompt}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ff6b35] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d4520a] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                {canUnlock ? 'Unlock Secret Prompt' : 'Keep exploring'}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
