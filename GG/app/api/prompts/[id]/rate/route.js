import { NextResponse } from 'next/server';

import { getKvClient } from '@/lib/kv';
import { isPreviewKvDisabled } from '@/lib/deployment-env';
import {
  coerceCount,
  getPromptRatingCountKey,
  getPromptRatingSumKey,
  getPromptRatingUserVotesKey,
  getUtcDateKey,
  incrementPromptDailyStat,
  normalizePromptId,
} from '@/lib/prompt-stats';
import { checkPromptActionRateLimit } from '@/lib/rate-limit';
import { rejectPublicWriteWhenAdminOnly } from '@/lib/database-mode';

function normalizeRating(value) {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

function isValidUserId(userId) {
  return typeof userId === 'string' && userId.trim().length >= 12 && userId.trim().length <= 120;
}

export async function POST(request, { params }) {
  if (isPreviewKvDisabled()) {
    return NextResponse.json(
      { error: 'Prompt engagement is unavailable in this Preview.', code: 'KV_DISABLED' },
      { status: 503 },
    );
  }
  const readOnlyResponse = rejectPublicWriteWhenAdminOnly();
  if (readOnlyResponse) return readOnlyResponse;

  try {
    const { id } = await params;
    const promptId = normalizePromptId(id);
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId || '').trim();
    const rating = normalizeRating(body.rating);

    if (!promptId) {
      return NextResponse.json({ error: 'Prompt id is required.' }, { status: 400 });
    }

    if (!isValidUserId(userId)) {
      return NextResponse.json({ error: 'A valid anonymous userId is required.' }, { status: 400 });
    }

    if (!rating) {
      return NextResponse.json({ error: 'Rating must be an integer between 1 and 5.' }, { status: 400 });
    }

    const kv = getKvClient();
    const rateLimit = await checkPromptActionRateLimit(request, kv, {
      action: 'rate',
      promptId,
      windowSeconds: 2,
    });

    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    const sumKey = getPromptRatingSumKey(promptId);
    const countKey = getPromptRatingCountKey(promptId);
    const userVotesKey = getPromptRatingUserVotesKey(promptId);
    const previousRating = normalizeRating(await kv.hget(userVotesKey, userId));

    if (previousRating) {
      await kv.incrby(sumKey, rating - previousRating);
    } else {
      await kv.incrby(sumKey, rating);
      await kv.incr(countKey);
    }

    await kv.hset(userVotesKey, { [userId]: rating });

    const dailyVotesKey = `${getPromptRatingUserVotesKey(promptId)}:${getUtcDateKey()}`;
    const previousDailyRating = normalizeRating(await kv.hget(dailyVotesKey, userId));

    if (previousDailyRating) {
      await incrementPromptDailyStat(kv, promptId, 'ratingSum', rating - previousDailyRating);
    } else {
      await incrementPromptDailyStat(kv, promptId, 'ratingSum', rating);
      await incrementPromptDailyStat(kv, promptId, 'ratingCount');
    }
    await kv.hset(dailyVotesKey, { [userId]: rating });
    await kv.expire(dailyVotesKey, 10 * 24 * 60 * 60);

    const [ratingSumValue, ratingCountValue] = await kv.mget(sumKey, countKey);
    const ratingSum = coerceCount(ratingSumValue);
    const ratingCount = coerceCount(ratingCountValue);
    const avgRating = ratingCount > 0 ? ratingSum / ratingCount : 0;

    return NextResponse.json({
      id: promptId,
      rating,
      avgRating,
      averageRating: avgRating,
      ratingCount,
      ratingSum,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to rate prompt.' }, { status: 500 });
  }
}
