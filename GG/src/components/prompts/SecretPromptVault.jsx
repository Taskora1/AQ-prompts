'use client';

import Link from 'next/link';
import { LockKeyhole, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import PromptCard from '@/components/ui/PromptCard';

const STORAGE_KEY = 'aqprompts_daily_secret_v1';
const REQUIRED_PROMPTS = 4;

function localDay() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hasDailyUnlock() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    return stored?.day === localDay()
      && Array.isArray(stored.slugs)
      && new Set(stored.slugs.filter(Boolean)).size >= REQUIRED_PROMPTS;
  } catch {
    return false;
  }
}

function trackVaultView(unlocked) {
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: unlocked ? 'aq_vault_page_viewed_unlocked' : 'aq_vault_page_viewed_locked' });
  }
}

export default function SecretPromptVault({ prompts = [] }) {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const currentUnlock = hasDailyUnlock();
    setUnlocked(currentUnlock);
    trackVaultView(currentUnlock);
  }, []);

  if (!unlocked) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="rounded-[28px] border border-[#ff6b35]/30 bg-[linear-gradient(135deg,#fff8f3,#fff1e9)] p-6 text-center shadow-sm dark:border-[#ff6b35]/25 dark:bg-[linear-gradient(135deg,#1c1411,#151116)] sm:p-10">
          <LockKeyhole className="mx-auto h-10 w-10 text-[#c2410c]" aria-hidden="true" />
          <h1 className="mt-4 text-3xl font-black text-[#111118] dark:text-white sm:text-4xl">Secret Prompt Vault</h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#6b7280] dark:text-[#cbd5e1]">
            Complete today&apos;s discovery challenge to unlock 32 exclusive prompts.
          </p>
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4" aria-hidden="true">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="aspect-[4/5] rounded-2xl border border-white/60 bg-[#d8c2b8] shadow-inner blur-md dark:border-white/10 dark:bg-[#3a2925]" />
            ))}
          </div>
          <Link
            href="/tools/ai-image-prompts"
            className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ff6b35] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#d4520a]"
          >
            Start Discovery Challenge
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mb-8 rounded-[28px] border border-[#ff6b35]/30 bg-[linear-gradient(135deg,#fff8f3,#fff1e9)] p-6 dark:border-[#ff6b35]/25 dark:bg-[linear-gradient(135deg,#1c1411,#151116)] sm:p-8">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#c2410c]">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Daily Secret Prompt
        </p>
        <h1 className="mt-3 text-3xl font-black text-[#111118] dark:text-white sm:text-4xl">🎉 Secret Prompt Vault — Unlocked!</h1>
        <p className="mt-3 text-base leading-7 text-[#6b7280] dark:text-[#cbd5e1]">Here are your 32 exclusive prompts for today.</p>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {prompts.map((prompt, index) => (
          <div key={prompt.slug} onClick={() => trackVaultClick(prompt.slug)}>
            <PromptCard
              title={prompt.title || ''}
              description={prompt.intro || ''}
              category={prompt.category || prompt.useCase || ''}
              platform={prompt.platform || ''}
              image={prompt.image || ''}
              images={prompt.images || []}
              slug={prompt.slug || ''}
              promptText={prompt.prompt || ''}
              priority={index < 4}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function trackVaultClick(slug) {
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: 'aq_vault_prompt_clicked', prompt_slug: slug });
  }
}
