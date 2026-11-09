import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

const DAILY_ACTION_LIMIT = 200;
const DAILY_WINDOW_SECONDS = 24 * 60 * 60;

function hashKeyPart(value = '') {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

export function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const firstForwardedIp = forwardedFor?.split(',')[0]?.trim();

  return firstForwardedIp || realIp?.trim() || 'unknown';
}

export function rateLimitResponse(message = 'Please slow down and try again shortly.') {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        'Retry-After': '10',
      },
    }
  );
}

export async function checkPromptActionRateLimit(request, kv, { action, promptId, windowSeconds }) {
  try {
    const ip = getClientIp(request);
    const ipHash = hashKeyPart(ip);
    const promptHash = hashKeyPart(promptId);
    const dailyKey = `rate:prompt-actions:daily:${ipHash}`;
    const actionKey = `rate:prompt-actions:${action}:${ipHash}:${promptHash}`;
    const dailyCount = await kv.incr(dailyKey);

    if (dailyCount === 1) {
      await kv.expire(dailyKey, DAILY_WINDOW_SECONDS);
    }

    if (dailyCount > DAILY_ACTION_LIMIT) {
      return {
        allowed: false,
        response: rateLimitResponse('Daily action limit reached. Please try again tomorrow.'),
      };
    }

    const reserved = await kv.set(actionKey, '1', {
      ex: windowSeconds,
      nx: true,
    });

    if (!reserved) {
      return {
        allowed: false,
        response: rateLimitResponse('Please slow down. Too many requests for this prompt.'),
      };
    }

    return { allowed: true };
  } catch {
    console.warn('Prompt action rate limit check failed; allowing request.');
    return { allowed: true, failedOpen: true };
  }
}
