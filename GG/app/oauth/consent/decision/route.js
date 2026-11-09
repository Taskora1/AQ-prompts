import { NextResponse } from 'next/server';

import { decideOAuthConsent } from '@/lib/oauth-consent';
import { createSupabaseAuthServerClient } from '@/lib/supabase-auth-server';

export const runtime = 'nodejs';

function hasSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin consent decisions are not accepted.' }, { status: 403 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid consent submission.' }, { status: 400 });
  }

  const authorizationId = formData.get('authorization_id');
  const decision = formData.get('decision');
  let supabase;
  try {
    supabase = await createSupabaseAuthServerClient();
  } catch (error) {
    if (error?.name === 'SupabaseAuthConfigurationError') {
      return NextResponse.json({ error: 'Supabase authentication is not configured.' }, { status: 503 });
    }
    throw error;
  }

  const result = await decideOAuthConsent(supabase, authorizationId, decision);
  if (result.status === 'unauthenticated') {
    return NextResponse.json({ error: 'A Supabase Auth session is required.' }, { status: 401 });
  }
  if (result.status === 'invalid_request') {
    return NextResponse.json({ error: 'This authorization request is missing, expired, or invalid.' }, { status: 400 });
  }
  if (result.status !== 'redirect') {
    return NextResponse.json({ error: 'Supabase returned an invalid authorization redirect.' }, { status: 502 });
  }

  const response = NextResponse.redirect(result.redirectUrl, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
