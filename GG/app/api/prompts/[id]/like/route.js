import { NextResponse } from 'next/server';

import { getKvClient } from '@/lib/kv';
import { isPreviewKvDisabled } from '@/lib/deployment-env';
import { coerceCount, getPromptDailyUniqueKey, getPromptLikeSetKey, getPromptStatKey, getUtcDateKey, incrementPromptDailyStat, normalizePromptId } from '@/lib/prompt-stats';
import { checkPromptActionRateLimit } from '@/lib/rate-limit';
import { rejectPublicWriteWhenAdminOnly } from '@/lib/database-mode';

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

    if (!promptId) {
      return NextResponse.json({ error: 'Prompt id is required.' }, { status: 400 });
    }

    if (!isValidUserId(userId)) {
      return NextResponse.json({ error: 'A valid anonymous userId is required.' }, { status: 400 });
    }

    const kv = getKvClient();
    const rateLimit = await checkPromptActionRateLimit(request, kv, {
      action: 'like',
      promptId,
      windowSeconds: 2,
    });

    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    const likedByKey = getPromptLikeSetKey(promptId);
    const likesKey = getPromptStatKey(promptId, 'likes');
    const alreadyLiked = Boolean(await kv.sismember(likedByKey, userId));

    if (alreadyLiked) {
      await kv.srem(likedByKey, userId);
      const likes = Math.max(0, coerceCount(await kv.decr(likesKey)));
      const dailyLikedByKey = getPromptDailyUniqueKey(promptId, 'likes', getUtcDateKey());
      const likedToday = Boolean(await kv.sismember(dailyLikedByKey, userId));

      if (likedToday) {
        await kv.srem(dailyLikedByKey, userId);
        await incrementPromptDailyStat(kv, promptId, 'likes', -1);
      }

      if (likes === 0) {
        await kv.set(likesKey, 0);
      }

      return NextResponse.json({ id: promptId, liked: false, likes });
    }

    await kv.sadd(likedByKey, userId);
    const likes = await kv.incr(likesKey);
    const dailyLikedByKey = getPromptDailyUniqueKey(promptId, 'likes', getUtcDateKey());
    const firstLikeToday = Boolean(await kv.sadd(dailyLikedByKey, userId));

    await kv.expire(dailyLikedByKey, 10 * 24 * 60 * 60);
    if (firstLikeToday) {
      await incrementPromptDailyStat(kv, promptId, 'likes');
    }

    return NextResponse.json({ id: promptId, liked: true, likes });
  } catch {
    return NextResponse.json({ error: 'Unable to toggle prompt like.' }, { status: 500 });
  }
}
