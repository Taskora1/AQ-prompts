import { NextResponse } from 'next/server';

import { getClientIp } from '@/lib/rate-limit';
import { hashReviewIp, normalizeReviewSocialUrl, submitSiteReview } from '@/lib/site-reviews-db';
import { countReviewWords, MIN_REVIEW_WORDS } from '@/lib/review-validation';

export const runtime = 'nodejs';

export async function POST(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Please provide valid review details.' }, { status: 400 });
  }

  if (typeof input?.website === 'string' && input.website.trim()) {
    return NextResponse.json({ success: true });
  }

  const source = input?.source === 'copy-gate' ? 'copy-gate' : 'website';
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  let socialUrl = typeof input?.socialUrl === 'string' ? input.socialUrl.trim() : '';
  const text = typeof input?.text === 'string' ? input.text.trim() : '';
  const rating = Number(input?.rating);
  const promptId = Number(input?.promptId);

  if (name.length > 100 || socialUrl.length > 2048 || text.length > 2000) {
    return NextResponse.json({ error: 'Please keep your name under 100 characters, social link under 2,048 characters, and feedback under 2,000 characters.' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
  }
  if (!socialUrl) {
    return NextResponse.json({ error: 'Please enter your social profile link.' }, { status: 400 });
  }
  try {
    socialUrl = normalizeReviewSocialUrl(socialUrl);
  } catch {
    return NextResponse.json({ error: 'Social profile links must use HTTPS.' }, { status: 400 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Choose a rating from 1 to 5 stars.' }, { status: 400 });
  }
  if (countReviewWords(text) < MIN_REVIEW_WORDS) {
    return NextResponse.json(
      { error: `Feedback must be at least ${MIN_REVIEW_WORDS} words.` },
      { status: 400 },
    );
  }
  if (source === 'copy-gate' && (!Number.isSafeInteger(promptId) || promptId < 1)) {
    return NextResponse.json({ error: 'This prompt could not be identified. Please reload and try again.' }, { status: 400 });
  }

  try {
    const result = await submitSiteReview({
      name,
      socialUrl,
      rating,
      text,
      source,
      promptId: source === 'copy-gate' ? promptId : null,
      ipHash: hashReviewIp(getClientIp(request)),
      userAgent: String(request.headers.get('user-agent') || '').slice(0, 500),
    });
    if (result.duplicate) {
      return NextResponse.json(
        { error: 'This social profile already has a pending or approved review.' },
        { status: 409 },
      );
    }
    if (result.limited) {
      return NextResponse.json(
        { error: 'You have reached the feedback limit. Please try again in about an hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }
    return NextResponse.json({ success: true, message: 'Thank you, your review will appear after approval.' }, { status: 201 });
  } catch (error) {
    console.error('Review submission failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'Your feedback could not be submitted right now. Please try again later.' }, { status: 503 });
  }
}
