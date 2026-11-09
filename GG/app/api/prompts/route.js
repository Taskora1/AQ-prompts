import { NextResponse } from 'next/server';

import { getPublicPromptDirectoryPayload } from '@/lib/prompts-db';

// This endpoint reads the database at request time. Prerendering it during
// `next build` makes a temporary database/DNS outage fail the whole build.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function toPublicPromptDirectoryItem(prompt) {
  return {
    id: prompt.id,
    title: prompt.title,
    slug: prompt.slug,
    image: prompt.image,
  };
}

export async function GET() {
  try {
    const payload = await getPublicPromptDirectoryPayload();
    const publicPayload = {
      success: true,
      updatedAt: payload.updatedAt,
      prompts: (payload.prompts || []).map(toPublicPromptDirectoryItem),
    };

    return NextResponse.json(publicPayload, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=86400, stale-while-revalidate=86400',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load prompts.' }, { status: 500 });
  }
}
