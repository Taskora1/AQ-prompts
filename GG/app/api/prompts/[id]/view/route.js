import { NextResponse } from 'next/server';

import { getKvClient } from '@/lib/kv';
import { isPreviewKvDisabled } from '@/lib/deployment-env';
import { getPromptStatKey, incrementPromptDailyStat, markPromptDailyUnique, normalizePromptId } from '@/lib/prompt-stats';
import { checkPromptActionRateLimit } from '@/lib/rate-limit';
import { rejectPublicWriteWhenAdminOnly } from '@/lib/database-mode';

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

    if (userId.length < 12 || userId.length > 120) {
      return NextResponse.json({ error: 'A valid anonymous userId is required.' }, { status: 400 });
    }

    const kv = getKvClient();
    const rateLimit = await checkPromptActionRateLimit(request, kv, {
      action: 'view',
      promptId,
      windowSeconds: 10,
    });

    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    const counted = await markPromptDailyUnique(kv, promptId, 'views', userId);
    const views = counted
      ? await kv.incr(getPromptStatKey(promptId, 'views'))
      : Number((await kv.get(getPromptStatKey(promptId, 'views'))) || 0);

    if (counted) {
      await incrementPromptDailyStat(kv, promptId, 'views');
    }

    return NextResponse.json({ id: promptId, views, counted });
  } catch {
    return NextResponse.json({ error: 'Unable to track prompt view.' }, { status: 500 });
  }
}
