const MAX_AUTHORIZATION_ID_LENGTH = 4096;

export function isValidAuthorizationId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_AUTHORIZATION_ID_LENGTH
    && value.trim() === value
    && ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    });
}

async function hasSupabaseSession(supabase) {
  const { data, error } = await supabase.auth.getClaims();
  return !error && typeof data?.claims?.sub === 'string' && data.claims.sub.length > 0;
}

function getAuthorizationRedirectUrl(data) {
  if (typeof data?.redirect_url !== 'string') return null;
  try {
    const url = new URL(data.redirect_url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function loadOAuthConsent(supabase, authorizationId) {
  if (!isValidAuthorizationId(authorizationId)) return { status: 'invalid_request' };
  if (!await hasSupabaseSession(supabase)) return { status: 'unauthenticated' };

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return { status: 'invalid_request' };

  if (!('authorization_id' in data)) {
    const redirectUrl = getAuthorizationRedirectUrl(data);
    return redirectUrl ? { status: 'redirect', redirectUrl } : { status: 'invalid_request' };
  }

  if (data.authorization_id !== authorizationId || !data.client || typeof data.client !== 'object') {
    return { status: 'invalid_request' };
  }

  return {
    status: 'consent',
    clientName: typeof data.client.name === 'string' && data.client.name.trim()
      ? data.client.name.trim()
      : 'Unnamed application',
    clientId: typeof data.client.id === 'string' ? data.client.id : null,
    clientUri: typeof data.client.uri === 'string' ? data.client.uri : null,
    redirectUri: typeof data.redirect_uri === 'string' ? data.redirect_uri : null,
    scopes: typeof data.scope === 'string' ? data.scope.trim().split(/\s+/).filter(Boolean) : [],
  };
}

export async function decideOAuthConsent(supabase, authorizationId, decision) {
  if (!isValidAuthorizationId(authorizationId) || !['approve', 'deny'].includes(decision)) {
    return { status: 'invalid_request' };
  }
  if (!await hasSupabaseSession(supabase)) return { status: 'unauthenticated' };

  const { data: details, error: detailsError } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (detailsError || !details) return { status: 'invalid_request' };

  if (!('authorization_id' in details)) {
    const redirectUrl = getAuthorizationRedirectUrl(details);
    return redirectUrl ? { status: 'redirect', redirectUrl } : { status: 'invalid_request' };
  }
  if (details.authorization_id !== authorizationId) return { status: 'invalid_request' };

  const method = decision === 'approve'
    ? supabase.auth.oauth.approveAuthorization
    : supabase.auth.oauth.denyAuthorization;
  const { data, error } = await method.call(
    supabase.auth.oauth,
    authorizationId,
    { skipBrowserRedirect: true },
  );
  if (error || !data) return { status: 'invalid_request' };

  const redirectUrl = getAuthorizationRedirectUrl(data);
  return redirectUrl ? { status: 'redirect', redirectUrl } : { status: 'invalid_response' };
}
