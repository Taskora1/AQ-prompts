import { NextResponse } from 'next/server';

import {
  getPromptEngagementCounts,
  PromptEngagementValidationError,
} from '@/lib/prompt-engagement-db';

// Live view/like counts for one prompt, read from D1 on every request.
// The detail page is statically prerendered at build time (from Neon), so
// the counts baked into the HTML are build-time values; the client
// re-reads them here on mount so a like survives a reload. Not cached:
// counts must be live.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const counts = await getPromptEngagementCounts(id);
    if (!counts) {
      return NextResponse.json({ error: 'Prompt not found.' }, { status: 404 });
    }
    return NextResponse.json(
      { success: true, ...counts },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof PromptEngagementValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Prompt engagement counts failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'Unable to load engagement counts.' }, { status: 500 });
  }
}
