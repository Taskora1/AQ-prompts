import { NextResponse } from 'next/server';

import { getKvClient, isKvDisabledError } from '@/lib/kv';
import { isPreviewKvDisabled } from '@/lib/deployment-env';
import { getPromptSlugsForStats } from '@/lib/prompts-db';
import { getPromptStatsMap } from '@/lib/prompt-stats';

const CDN_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=3600';
const CACHE_CONTROL = 'public, max-age=60, s-maxage=3600, stale-while-revalidate=3600';

function toPublicStatsMap(stats = {}) {
  return Object.fromEntries(
    Object.entries(stats).map(([id, values]) => [
      id,
      {
        views: values.views,
        likes: values.likes,
        copies: values.copies,
        ratingSum: values.ratingSum,
        ratingCount: values.ratingCount,
        avgRating: values.avgRating,
      },
    ]),
  );
}

export async function GET() {
  if (isPreviewKvDisabled()) {
    return NextResponse.json(
      { success: true, stats: {}, unavailable: true, reason: 'kv_disabled' },
      {
        headers: {
          'Cache-Control': CACHE_CONTROL,
          'Vercel-CDN-Cache-Control': CDN_CACHE_CONTROL,
        },
      },
    );
  }

  try {
    // Use slugs-only query (~99% smaller than full query)
    // Only need slug/id to look up stats from KV
    const slugs = await getPromptSlugsForStats();
    const ids = slugs.map((s) => s.slug);
    const stats = toPublicStatsMap(await getPromptStatsMap(getKvClient(), ids));

    return NextResponse.json(
      { success: true, stats },
      {
        headers: {
          'Cache-Control': CACHE_CONTROL,
          'Vercel-CDN-Cache-Control': CDN_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    if (isKvDisabledError(error)) {
      return NextResponse.json(
        { success: true, stats: {}, unavailable: true, reason: 'kv_disabled' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json({ error: 'Unable to load prompt stats.' }, { status: 500 });
  }
}
