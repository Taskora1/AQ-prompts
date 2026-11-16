import { NextResponse } from 'next/server';

import { getClientIp } from '@/lib/rate-limit';
import { hashReviewIp } from '@/lib/site-reviews-db';
import {
  getPromptFeedbackSummary,
  submitPromptFeedback,
  validatePromptFeedbackInput,
  PromptEngagementValidationError,
} from '@/lib/prompt-engagement-db';

// Per-prompt feedback: star rating (required) + short comment (optional),
// anonymous, no login. Rows live in public.site_reviews with
// source = 'prompt' and status = 'pending', so they go through the same
// moderation queue as normal reviews and only show on the /feedback
// listing (and in the detail-page average + count) after an admin
// approves them. GET returns the live average + count for the detail page.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const summary = await getPromptFeedbackSummary(id);
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    if (error instanceof PromptEngagementValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Prompt feedback summary failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'Unable to load feedback.' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { id } = await params;
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Please provide valid feedback details.' }, { status: 400 });
  }

  // Honeypot (same convention as /api/reviews): bots fill it, humans never see it.
  if (typeof input?.website === 'string' && input.website.trim()) {
    return NextResponse.json({ success: true });
  }

  try {
    const { comment } = validatePromptFeedbackInput({
      rating: input?.rating,
      comment: input?.comment,
    });
    let ipHash;
    try {
      ipHash = hashReviewIp(getClientIp(request));
    } catch {
      // AUTH_SECRET missing (local dev): the insert still needs a value.
      // Rate limiting degrades to one shared bucket in that case.
      ipHash = 'unknown';
    }
    const result = await submitPromptFeedback({
      promptId: id,
      rating: input?.rating,
      comment,
      ipHash,
      userAgent: String(request.headers.get('user-agent') || '').slice(0, 500),
    });
    if (result.limited) {
      return NextResponse.json(
        { error: 'You have reached the feedback limit. Please try again in about an hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }
    const summary = await getPromptFeedbackSummary(id);
    return NextResponse.json({ success: true, ...summary }, { status: 201 });
  } catch (error) {
    if (error instanceof PromptEngagementValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Prompt feedback submission failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'Feedback could not be submitted. Please try again.' }, { status: 500 });
  }
}
