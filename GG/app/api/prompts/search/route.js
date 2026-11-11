import { NextResponse } from 'next/server';

import { toPromptCardItem } from '@/lib/prompt-card';
import { getSlimPromptsPage } from '@/lib/prompts';

// Reads query params, so the handler must stay dynamic. Caching is handled by
// CDN headers (cache key includes the full URL incl. query params).
export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 18; // matches the previous client-side cap
const MAX_PAGE_SIZE = 36; // same cap as the prompts/page route

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = String(searchParams.get('q') || '').trim();
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const requestedPageSize = Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE;
    const pageSize = Math.min(Math.max(1, requestedPageSize), MAX_PAGE_SIZE);
    if (!search) {
      return NextResponse.json({
        success: true,
        results: [],
        page,
        pageSize,
        totalCount: 0,
        hasMore: false,
      });
    }

    const offset = (page - 1) * pageSize;
    const { prompts, totalCount } = await getSlimPromptsPage({
      search,
      limit: pageSize,
      offset,
    });
    const results = prompts
      .map(toPromptCardItem);

    return NextResponse.json(
      {
        success: true,
        results,
        page,
        pageSize,
        totalCount,
        hasMore: offset + pageSize < totalCount,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=86400, stale-while-revalidate=86400',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
        },
      },
    );
  } catch {
    return NextResponse.json({ error: 'Unable to search prompts.' }, { status: 500 });
  }
}
