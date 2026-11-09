import { NextResponse } from 'next/server';

import { toPromptCardItem } from '@/lib/prompt-card';
import { PROMPT_CATEGORIES } from '@/lib/prompt-constants';
import { getRandomSlimPrompts, getSlimPromptsPage } from '@/lib/prompts';

// Reads query params, so the handler must stay dynamic. Caching is handled by
// CDN headers (cache key includes the full URL incl. query params).
export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 36;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const requestedPageSize = Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE;
    const pageSize = Math.min(Math.max(1, requestedPageSize), MAX_PAGE_SIZE);
    const category = String(searchParams.get('category') || '').trim() || null;
    const search = String(searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort') === 'random' ? 'random' : 'latest';
    const seedParam = searchParams.get('seed');
    const requestedSeed = seedParam === null ? Number.NaN : Number(seedParam);
    const randomSeed = Number.isSafeInteger(requestedSeed) ? requestedSeed : null;

    // random=1: server picks one random prompt (used by the "Surprise me" button
    // without shipping the full dataset to the client). Not CDN-cached so each
    // click gets a genuinely different pick.
    if (searchParams.get('random')) {
      const [randomPrompt] = await getRandomSlimPrompts(1);
      return NextResponse.json(
        {
          success: true,
          page: 1,
          pageSize: 1,
          totalCount: randomPrompt ? 1 : 0,
          hasMore: false,
          prompts: randomPrompt ? [toPromptCardItem(randomPrompt)] : [],
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const categoryConfig = category
      ? PROMPT_CATEGORIES[category]
        || Object.values(PROMPT_CATEGORIES).find((item) => item.slug === category)
      : null;
    const legacyCategorySlugs = { men: 'boys', women: 'girls' };
    const categorySlugs = categoryConfig
      ? [...new Set([categoryConfig.slug, legacyCategorySlugs[categoryConfig.slug]].filter(Boolean))]
      : [];
    const offset = (page - 1) * pageSize;
    const { prompts, totalCount } = await getSlimPromptsPage({
      categorySlugs,
      search,
      limit: pageSize,
      offset,
      sort,
      randomSeed,
    });
    const pageItems = prompts.map(toPromptCardItem);

    return NextResponse.json(
      {
        success: true,
        page,
        pageSize,
        totalCount,
        hasMore: offset + pageSize < totalCount,
        prompts: pageItems,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=86400, stale-while-revalidate=86400',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
        },
      },
    );
  } catch {
    return NextResponse.json({ error: 'Unable to load prompts.' }, { status: 500 });
  }
}
