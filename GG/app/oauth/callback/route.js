import { NextResponse } from 'next/server';

import { isValidAuthorizationId } from '@/lib/oauth-consent';
import { completeSupabaseOAuthSignIn } from '@/lib/supabase-oauth-sign-in';
import { createSupabaseAuthServerClient } from '@/lib/supabase-auth-server';

export const runtime = 'nodejs';

function signInPage(request, error) {
  const url = new URL('/oauth/sign-in', request.url);
  const authorizationId = request.nextUrl.searchParams.get('authorization_id');
  if (isValidAuthorizationId(authorizationId)) {
    url.searchParams.set('authorization_id', authorizationId);
  }
  url.searchParams.set('error', error);
  const response = NextResponse.redirect(url, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(request) {
  const code = request.nextUrl.searchParams.get('code');
  const authorizationId = request.nextUrl.searchParams.get('authorization_id');
  if (request.nextUrl.searchParams.has('error') || !code) {
    return signInPage(request, 'invalid');
  }

  let supabase;
  try {
    supabase = await createSupabaseAuthServerClient();
  } catch (error) {
    if (error?.name === 'SupabaseAuthConfigurationError') {
      return signInPage(request, 'unavailable');
    }
    throw error;
  }

  const result = await completeSupabaseOAuthSignIn(supabase, { code, authorizationId });
  if (result.status !== 'complete') return signInPage(request, 'invalid');

  const response = NextResponse.redirect(new URL(result.path, request.url), 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
