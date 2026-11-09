'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, TrendingUp } from 'lucide-react';

import PromptCard from '@/components/ui/PromptCard';

export default function TrendingPromptsClient() {
  const [prompts, setPrompts] = useState([]);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/prompts/trending', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load trending prompts.');
        return payload;
      })
      .then((payload) => {
        if (!cancelled) {
          const nextPrompts = (payload.prompts || []).slice(0, 12);
          setPrompts(nextPrompts);
          setUnavailable(Boolean(payload.unavailable));
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError.message || 'Unable to load trending prompts.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 text-sm font-semibold text-[var(--text-secondary)]">
        <LoaderCircle className="h-4 w-4 animate-spin text-[#c2410c]" />
        Loading popular prompts
      </div>
    );
  }

  if (error && !unavailable) {
    return (
      <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm leading-6 text-red-600 dark:text-red-300">
        <p className="font-semibold">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError('');
            setLoading(true);
            fetch('/api/prompts/trending', { headers: { Accept: 'application/json' } })
              .then(async (response) => {
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Unable to load trending prompts.');
                setPrompts((payload.prompts || []).slice(0, 12));
              })
              .catch((e) => setError(e.message || 'Unable to load trending prompts.'))
              .finally(() => setLoading(false));
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {prompts.map((prompt, index) => (
        <div key={prompt.slug || prompt.id} className="relative">
          <div className={`absolute left-3 top-3 z-10 inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-black shadow-lg backdrop-blur ${
            index < 3
              ? 'bg-[#ff6b35] text-white shadow-[0_8px_20px_rgba(255,107,53,0.35)]'
              : 'bg-[#111118]/85 text-white'
          }`}>
            #{index + 1}
          </div>
          <PromptCard
            title={prompt.title || ''}
            description={prompt.description || ''}
            category={prompt.category || prompt.useCase || ''}
            platform={prompt.platform || ''}
            image={prompt.image || ''}
            images={prompt.images || []}
            slug={prompt.slug || prompt.id || ''}
            promptText={prompt.prompt || ''}
            initialStats={prompt.stats || {}}
            priority={index === 0}
          />
        </div>
      ))}
      {prompts.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center sm:col-span-2 lg:col-span-3">
          <TrendingUp className="mx-auto h-6 w-6 text-[#c2410c]" />
          <p className="mt-3 font-semibold text-[var(--text-primary)]">
            {unavailable ? 'Trending is unavailable in this Preview.' : 'No trending data yet'}
          </p>
          {!unavailable ? (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Views, likes, and copies will shape this page as visitors use prompts.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
