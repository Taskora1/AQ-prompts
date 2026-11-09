'use client';

import { useMemo, useState } from 'react';
import { Link as LinkIcon, Plus, Sparkles, X } from 'lucide-react';

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function computeSimilarity(current, candidate) {
  let score = 0;

  // Same primary category = +30
  if (current.primaryCategoryId && current.primaryCategoryId === candidate.primaryCategoryId) {
    score += 30;
  }

  // Shared categories = +15 each
  const currentCats = new Set(toArray(current.categoryIds));
  const candidateCats = new Set(toArray(candidate.categoryIds));
  for (const cat of currentCats) {
    if (candidateCats.has(cat)) score += 15;
  }

  // Shared tags = +10 each
  const currentTags = new Set(toArray(current.tags).map((t) => String(t || '').toLowerCase()));
  const candidateTags = new Set(toArray(candidate.tags).map((t) => String(t || '').toLowerCase()));
  for (const tag of currentTags) {
    if (candidateTags.has(tag)) score += 10;
  }

  // Same use case = +20
  if (current.useCase && current.useCase === candidate.useCase) {
    score += 20;
  }

  // Title word overlap = +5 per shared word (max 25)
  const currentWords = new Set((current.title || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const candidateWords = new Set((candidate.title || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  let sharedWords = 0;
  for (const word of currentWords) {
    if (candidateWords.has(word)) sharedWords++;
  }
  score += Math.min(25, sharedWords * 5);

  return score;
}

export default function InternalLinkSuggestions({
  currentPrompt = {},
  allPrompts = [],
  selectedIds = [],
  onSelect,
  onRemove,
  maxSuggestions = 8,
}) {
  const [showAll, setShowAll] = useState(false);

  const suggestions = useMemo(() => {
    const currentId = currentPrompt.id;
    const selectedSet = new Set(selectedIds);

    return allPrompts
      .filter((p) => p.id !== currentId && !selectedSet.has(p.id) && p.status === 'published')
      .map((p) => ({
        ...p,
        similarity: computeSimilarity(currentPrompt, p),
      }))
      .filter((p) => p.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, showAll ? 20 : maxSuggestions);
  }, [currentPrompt, allPrompts, selectedIds, maxSuggestions, showAll]);

  if (suggestions.length === 0) {
    return (
      <div className="rounded border border-dashed border-[#c3c4c7] bg-white p-4 text-center">
        <Sparkles size={20} className="mx-auto mb-2 text-[#8c8f94]" />
        <p className="text-sm text-[#646970]">
          No more suggestions. All related prompts are already linked.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-[#c2410c]" />
        <p className="text-xs font-semibold text-[#646970]">
          Auto-detected related prompts (ranked by relevance)
        </p>
      </div>

      <div className="space-y-2">
        {suggestions.map((prompt) => {
          const matchPct = Math.min(100, Math.round((prompt.similarity / 80) * 100));
          const matchColor =
            matchPct >= 60 ? 'text-green-700 bg-green-100' :
            matchPct >= 30 ? 'text-amber-700 bg-amber-100' :
            'text-[#646970] bg-[#f0f0f1]';

          return (
            <div
              key={prompt.id}
              className="flex items-center gap-3 rounded border border-[#dcdcde] bg-white px-3 py-2.5 transition hover:border-[#2271b1]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#1d2327]">
                  {prompt.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {prompt.category && (
                    <span className="rounded bg-[#f0f0f1] px-1.5 py-0.5 text-[10px] font-semibold text-[#646970]">
                      {prompt.category}
                    </span>
                  )}
                  {(prompt.tags || []).slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded bg-[#f0f0f1] px-1.5 py-0.5 text-[10px] text-[#8c8f94]">
                      {tag}
                    </span>
                  ))}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${matchColor}`}>
                    {matchPct}% match
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelect(prompt.id)}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-[#2271b1] px-2.5 text-xs font-semibold text-[#2271b1] transition hover:bg-[#f0f6fc]"
              >
                <Plus size={12} />
                Link
              </button>
            </div>
          );
        })}
      </div>

      {!showAll && suggestions.length >= maxSuggestions && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full rounded border border-dashed border-[#c3c4c7] py-2 text-xs font-semibold text-[#646970] transition hover:border-[#2271b1] hover:text-[#2271b1]"
        >
          Show more suggestions
        </button>
      )}
    </div>
  );
}