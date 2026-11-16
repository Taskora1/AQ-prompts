import { NextResponse } from 'next/server';

import {
  incrementPromptLikeCount,
  PromptEngagementValidationError,
} from '@/lib/prompt-engagement-db';

// One like per browser — the client guards with localStorage and never
// posts twice from the same browser. The server counts what it receives.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { id } = await params;
  try {
    const likeCount = await incrementPromptLikeCount(id);
    if (likeCount === null) {
      return NextResponse.json({ error: 'Prompt not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, likeCount });
  } catch (error) {
    if (error instanceof PromptEngagementValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Prompt like increment failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'Unable to record the like.' }, { status: 500 });
  }
}
