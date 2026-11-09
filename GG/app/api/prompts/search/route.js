import { NextResponse } from 'next/server';

import { toPromptCardItem } from '@/lib/prompt-card';
import { getSlimPromptsPage } from '@/lib/prompts';

// Reads query params, so the handler must stay dynamic. Caching is handled by
// CDN headers (cache key includes the full URL incl. query params).
export const dynamic = 'force-dynamic';

const MAX_RESULTS = 18; // matches the previous client-side cap

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = String(searchParams.get('q') || '').trim();
    if (!search) {
      return NextResponse.json({ success: true, results: [] });
    }

    const { prompts } = await getSlimPromptsPage({
      search,
      limit: MAX_RESULTS,
    });
    const results = prompts
      .map(toPromptCardItem);

    return NextResponse.json(
      { success: true, results },
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
