import {
  getMcpOAuthServerMetadata,
  getMcpProtectedResourceMetadata,
  isDescopeOAuthEnabled,
  McpOAuthConfigurationError,
  McpOAuthMetadataUnavailableError,
} from '../../src/lib/mcp-auth.js';
import {
  isMcpOAuthClientRegistered,
  McpOAuthBrokerStoreUnavailableError,
} from '../../src/lib/mcp-oauth-broker-db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLAUDE_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const MAX_STATE_LENGTH = 1024;
const MAX_SCOPE_LENGTH = 1024;
const OPTIONAL_PARAMETERS = ['scope', 'prompt', 'login_hint', 'nonce'];
const DESCOPE_IDENTITY_SCOPES = new Set(['profile', 'email']);

function errorResponse(message, status) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}

function getSingleParameter(searchParams, name) {
  const values = searchParams.getAll(name);
  return values.length === 1 ? values[0] : null;
}

function isValidState(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_STATE_LENGTH
    && ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    });
}

function isValidCodeChallenge(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export async function GET(request) {
  let metadata;
  try {
    metadata = getMcpProtectedResourceMetadata();
  } catch (error) {
    if (!(error instanceof McpOAuthConfigurationError)) throw error;
    return errorResponse('MCP OAuth is not configured.', 503);
  }

  const requestUrl = new URL(request.url);
  const responseType = getSingleParameter(requestUrl.searchParams, 'response_type');
  const clientId = getSingleParameter(requestUrl.searchParams, 'client_id');
  const redirectUri = getSingleParameter(requestUrl.searchParams, 'redirect_uri');
  const codeChallenge = getSingleParameter(requestUrl.searchParams, 'code_challenge');
  const codeChallengeMethod = getSingleParameter(requestUrl.searchParams, 'code_challenge_method');
  const state = getSingleParameter(requestUrl.searchParams, 'state');
  const requestedResource = requestUrl.searchParams.has('resource')
    ? getSingleParameter(requestUrl.searchParams, 'resource')
    : metadata.resource;

  if (
    responseType !== 'code'
    || redirectUri !== CLAUDE_REDIRECT_URI
    || !isValidCodeChallenge(codeChallenge)
    || codeChallengeMethod !== 'S256'
    || !isValidState(state)
    || requestedResource !== metadata.resource
  ) {
    return errorResponse('Invalid MCP OAuth authorization request.', 400);
  }

  // Descope is the only supported OAuth path. The legacy Supabase
  // email-OTP sign-in/consent flow was removed: it could never complete a
  // token exchange, so /authorize must not redirect to it.
  if (!isDescopeOAuthEnabled()) {
    return errorResponse('MCP OAuth is not configured.', 503);
  }

  try {
    if (!await isMcpOAuthClientRegistered(clientId, redirectUri)) {
      return errorResponse('Invalid MCP OAuth authorization client.', 400);
    }
  } catch (error) {
    if (!(error instanceof McpOAuthBrokerStoreUnavailableError)) throw error;
    return errorResponse('MCP OAuth registration service is unavailable.', 503);
  }

  let authorizationEndpoint;
  let authorizationClientId;
  try {
    const oauthMetadata = await getMcpOAuthServerMetadata();
    authorizationEndpoint = new URL(oauthMetadata.authorizationEndpoint);
    authorizationClientId = process.env.AQ_MCP_DESCOPE_CLIENT_ID;
    if (!authorizationClientId) {
      throw new McpOAuthConfigurationError(
        'The Descope OAuth application client ID must be configured.',
        'descope_client_id_configuration_missing',
      );
    }
  } catch (error) {
    if (
      error instanceof McpOAuthConfigurationError
      || error instanceof McpOAuthMetadataUnavailableError
    ) {
      return errorResponse('MCP OAuth discovery is unavailable.', 503);
    }
    throw error;
  }

  for (const parameter of OPTIONAL_PARAMETERS) {
    if (requestUrl.searchParams.getAll(parameter).length > 1) {
      return errorResponse('Invalid MCP OAuth authorization request.', 400);
    }
    const value = getSingleParameter(requestUrl.searchParams, parameter);
    if (
      value !== null
      && (value.length > MAX_SCOPE_LENGTH || [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code < 0x20 || code === 0x7f;
      }))
    ) {
      return errorResponse('Invalid MCP OAuth authorization request.', 400);
    }
  }

  const authorizationUrl = authorizationEndpoint;
  const forwarded = authorizationUrl.searchParams;
  forwarded.set('response_type', responseType);
  forwarded.set('client_id', authorizationClientId);
  forwarded.set('redirect_uri', redirectUri);
  forwarded.set('code_challenge', codeChallenge);
  forwarded.set('code_challenge_method', codeChallengeMethod);
  forwarded.set('state', state);
  // The MCP resource is an internal audience check and is never forwarded
  // to Descope.
  forwarded.delete('resource');
  for (const parameter of OPTIONAL_PARAMETERS) {
    const value = getSingleParameter(requestUrl.searchParams, parameter);
    if (value !== null && parameter !== 'nonce') {
      forwarded.set(parameter, value);
    }
  }
  const requestedScopes = forwarded.get('scope')?.split(/\s+/).filter(
    (scope) => DESCOPE_IDENTITY_SCOPES.has(scope),
  ) || [];
  forwarded.set('scope', ['openid', ...new Set(requestedScopes)].join(' '));

  authorizationUrl.search = forwarded.toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
