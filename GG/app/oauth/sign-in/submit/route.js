import { NextResponse } from 'next/server';

import { isValidAuthorizationId } from '@/lib/oauth-consent';
import { createOAuthCallbackUrl, requestSupabaseOAuthSignIn } from '@/lib/supabase-oauth-sign-in';
import { createSupabaseAuthServerClient } from '@/lib/supabase-auth-server';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function getSiteUrl(request) {
  if (process.env.VERCEL_ENV !== 'production') return new URL(request.url).origin;

  const configuredUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredUrl) return null;
  try {
    const siteUrl = new URL(configuredUrl);
    return siteUrl.protocol === 'https:' ? siteUrl.origin : null;
  } catch {
    return null;
  }
}

function signInPage(request, authorizationId, error) {
  const url = new URL('/oauth/sign-in', request.url);
  if (isValidAuthorizationId(authorizationId)) {
    url.searchParams.set('authorization_id', authorizationId);
  }
  url.searchParams.set('error', error);
  const response = NextResponse.redirect(url, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function POST(request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin sign-in requests are not accepted.' }, { status: 403 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid sign-in submission.' }, { status: 400 });
  }

  const email = formData.get('email');
  const authorizationId = formData.get('authorization_id');
  const siteUrl = getSiteUrl(request);
  const callbackUrl = siteUrl && createOAuthCallbackUrl(siteUrl, authorizationId);
  if (!callbackUrl) return signInPage(request, authorizationId, 'invalid');

  let supabase;
  try {
    supabase = await createSupabaseAuthServerClient();
  } catch (error) {
    if (error?.name === 'SupabaseAuthConfigurationError') {
      return signInPage(request, authorizationId, 'unavailable');
    }
    throw error;
  }

  const result = await requestSupabaseOAuthSignIn(supabase, {
    email,
    authorizationId,
    callbackUrl,
  });
  if (result.status === 'unavailable') {
    console.error('Supabase OAuth email sign-in failed:', result.errorCode || 'unknown');
  }
  return signInPage(
    request,
    authorizationId,
    result.status === 'invalid_request' ? 'invalid' : 'sent',
  );
}
