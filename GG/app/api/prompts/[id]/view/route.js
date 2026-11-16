import { NextResponse } from 'next/server';

import {
  incrementPromptViewCount,
  PromptEngagementValidationError,
} from '@/lib/prompt-engagement-db';

// Every detail-page visit counts as one view — no session or browser dedupe
// (owner rule 2026-11-16). Fire-and-forget from the detail page; a failed
// increment must never break the page, so the client ignores errors.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { id } = await params;
  try {
    const viewCount = await incrementPromptViewCount(id);
    if (viewCount === null) {
      return NextResponse.json({ error: 'Prompt not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, viewCount });
  } catch (error) {
    if (error instanceof PromptEngagementValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Prompt view increment failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'Unable to record the view.' }, { status: 500 });
  }
}
