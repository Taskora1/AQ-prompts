import crypto from 'node:crypto';

import { NextResponse } from 'next/server';

import { createSignedInSession } from '@/lib/auth';
import { consumeLoginToken } from '@/lib/auth-store';
import { isIntegrationEnabled } from '@/lib/deployment-env';
import { rejectPublicWriteWhenAdminOnly } from '@/lib/database-mode';

export const runtime = 'nodejs';

function redirectToSignIn(request, error) {
  const url = new URL('/account/sign-in', request.url);
  url.searchParams.set('error', error);
  return NextResponse.redirect(url, 303);
}

export async function GET(request) {
  const readOnlyResponse = rejectPublicWriteWhenAdminOnly();
  if (readOnlyResponse) return readOnlyResponse;

  if (!isIntegrationEnabled('email')) {
    return redirectToSignIn(request, 'unavailable');
  }

  const token = request.nextUrl.searchParams.get('token');

  if (!token || token.length > 256) {
    return redirectToSignIn(request, 'invalid');
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const email = await consumeLoginToken(tokenHash);

    if (!email) {
      return redirectToSignIn(request, 'expired');
    }

    await createSignedInSession(email);
    return NextResponse.redirect(new URL('/account', request.url), 303);
  } catch {
    return redirectToSignIn(request, 'unavailable');
  }
}
