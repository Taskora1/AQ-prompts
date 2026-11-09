'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bookmark } from 'lucide-react';

import PromptCard from '@/components/ui/PromptCard';
import { FAVORITES_CHANGED_EVENT, getFavoritePromptIds } from '@/lib/favorites';

export default function FavoritesPromptsClient({ prompts = [] }) {
  const [mounted, setMounted] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState([]);

  useEffect(() => {
    function syncFavorites() {
      setFavoriteIds(getFavoritePromptIds());
    }

    setMounted(true);
    syncFavorites();
    window.addEventListener(FAVORITES_CHANGED_EVENT, syncFavorites);
    window.addEventListener('storage', syncFavorites);

    return () => {
      window.removeEventListener(FAVORITES_CHANGED_EVENT, syncFavorites);
      window.removeEventListener('storage', syncFavorites);
    };
  }, []);

  const favoritePrompts = useMemo(() => {
    const promptById = new Map(prompts.map((prompt) => [prompt.slug, prompt]));
    return favoriteIds.map((id) => promptById.get(id)).filter(Boolean);
  }, [favoriteIds, prompts]);

  if (!mounted) {
    return (
      <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm font-semibold text-[var(--text-secondary)]">
        Loading saved prompts
      </div>
    );
  }

  if (favoritePrompts.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#ff6b3520] text-[#c2410c]">
          <Bookmark className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-black text-[var(--text-primary)]">No saved prompts yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
          Browse the prompt library and save your favorite ideas for quick access later.
        </p>
        <Link
          href="/tools/ai-image-prompts"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#ff6b35] px-5 text-sm font-black text-white transition hover:bg-[#ff6b35]/90"
        >
          Browse Prompts
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {favoritePrompts.map((prompt, index) => (
        <PromptCard
          key={prompt.slug}
          title={prompt.title || ''}
          description={prompt.intro || prompt.prompt || ''}
          category={prompt.category || prompt.useCase || ''}
          platform={prompt.platform || ''}
          image={prompt.image || ''}
          images={prompt.images || []}
          slug={prompt.slug || ''}
          promptText={prompt.prompt || ''}
          priority={index === 0}
        />
      ))}
    </div>
  );
}
