import { isValidAuthorizationId } from './oauth-consent.js';

const MAX_EMAIL_LENGTH = 320;
const MAX_CODE_LENGTH = 4096;

export function isValidOAuthSignInEmail(value) {
  return typeof value === 'string'
    && value.length <= MAX_EMAIL_LENGTH
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function createOAuthCallbackUrl(siteUrl, authorizationId) {
  if (!isValidAuthorizationId(authorizationId)) return null;

  let callback;
  try {
    callback = new URL('/oauth/callback', siteUrl);
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(callback.protocol) || callback.username || callback.password) {
    return null;
  }
  callback.searchParams.set('authorization_id', authorizationId);
  return callback.toString();
}

export async function requestSupabaseOAuthSignIn(supabase, {
  email,
  authorizationId,
  callbackUrl,
}) {
  if (!isValidOAuthSignInEmail(email) || !isValidAuthorizationId(authorizationId)) {
    return { status: 'invalid_request' };
  }

  let parsedCallback;
  try {
    parsedCallback = new URL(callbackUrl);
  } catch {
    return { status: 'invalid_request' };
  }
  if (!['https:', 'http:'].includes(parsedCallback.protocol)
    || parsedCallback.pathname !== '/oauth/callback'
    || parsedCallback.searchParams.get('authorization_id') !== authorizationId) {
    return { status: 'invalid_request' };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: parsedCallback.toString(),
        shouldCreateUser: false,
      },
    });
    if (error) return { status: 'unavailable', errorCode: error.code || error.name || 'supabase_error' };
  } catch (error) {
    return {
      status: 'unavailable',
      errorCode: error?.code || error?.name || 'network_error',
    };
  }
  return { status: 'sent' };
}

export async function completeSupabaseOAuthSignIn(supabase, {
  code,
  authorizationId,
}) {
  if (typeof code !== 'string' || !code || code.length > MAX_CODE_LENGTH
    || !isValidAuthorizationId(authorizationId)) {
    return { status: 'invalid_request' };
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return { status: 'invalid_callback' };

  const { data, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof data?.claims?.sub !== 'string' || !data.claims.sub) {
    return { status: 'invalid_callback' };
  }

  const consentUrl = new URL('/oauth/consent', 'https://aqprompts.invalid');
  consentUrl.searchParams.set('authorization_id', authorizationId);
  return { status: 'complete', path: `${consentUrl.pathname}${consentUrl.search}` };
}
