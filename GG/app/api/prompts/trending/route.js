import { NextResponse } from 'next/server';

import { getKvClient, isKvDisabledError } from '@/lib/kv';
import { isPreviewKvDisabled } from '@/lib/deployment-env';
import {
  getPromptSlugsForStats as getPromptSlugsForTrending,
  getTrendingPromptsByIds,
} from '@/lib/prompts-db';
import { emptyPromptStats, getPromptCreatedAt, getPromptId, getRecentPromptStatsMap, getTrendingScore } from '@/lib/prompt-stats';

const TRENDING_LIMIT = 20;
const CDN_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=3600';

function toPublicStats(stats = {}) {
  return {
    views: stats.views,
    likes: stats.likes,
    copies: stats.copies,
    ratingSum: stats.ratingSum,
    ratingCount: stats.ratingCount,
    avgRating: stats.avgRating,
  };
}

function toPublicTrendingPrompt(prompt) {
  return {
    id: prompt.id,
    slug: prompt.slug,
    title: prompt.title,
    description: String(prompt.intro || prompt.prompt || '').slice(0, 240),
    category: prompt.category || prompt.useCase || '',
    image: prompt.image,
    images: prompt.images,
    createdAt: prompt.createdAt || '',
    stats: toPublicStats(prompt.stats),
  };
}

async function getTrendingPayload() {
  const promptIndex = await getPromptSlugsForTrending();
  const ids = promptIndex.map(getPromptId);
  const statsMap = await getRecentPromptStatsMap(getKvClient(), ids);

  const rankedIds = promptIndex
    .map((prompt) => {
      const id = getPromptId(prompt);
      const stats = statsMap[id] || emptyPromptStats(id);
      const createdAt = getPromptCreatedAt(prompt);
      const score = getTrendingScore(stats, createdAt);
      return {
        id,
        stats,
        score,
        createdAt,
      };
    })
    .sort((a, b) => b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, TRENDING_LIMIT);
  const prompts = await getTrendingPromptsByIds(rankedIds.map((item) => item.id));
  const promptsById = new Map(prompts.map((prompt) => [getPromptId(prompt), prompt]));
  const trending = rankedIds
    .map((ranked) => {
      const prompt = promptsById.get(ranked.id);
      if (!prompt) return null;
      return {
        ...prompt,
        stats: ranked.stats,
        createdAt: ranked.createdAt || prompt.createdAt,
      };
    })
    .filter(Boolean)
    .map(toPublicTrendingPrompt);

  return { success: true, prompts: trending };
}

export async function GET() {
  if (isPreviewKvDisabled()) {
    return NextResponse.json(
      { success: true, prompts: [], unavailable: true, reason: 'kv_disabled' },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=3600, stale-while-revalidate=3600',
          'Vercel-CDN-Cache-Control': CDN_CACHE_CONTROL,
        },
      },
    );
  }

  try {
    const payload = await getTrendingPayload();

    return NextResponse.json(
      { ...payload, updatedAt: new Date().toISOString() },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=3600, stale-while-revalidate=3600',
          'Vercel-CDN-Cache-Control': CDN_CACHE_CONTROL,
        },
      }
    );
  } catch (error) {
    if (isKvDisabledError(error)) {
      return NextResponse.json(
        { success: true, prompts: [], unavailable: true, reason: 'kv_disabled' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json({ error: 'Unable to load trending prompts.' }, { status: 500 });
  }
}
