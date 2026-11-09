import {
  getMcpOAuthServerMetadata,
  getMcpProtectedResourceMetadata,
  isDescopeOAuthEnabled,
  isDescopePreviewOAuthEnabled,
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
const OMIT_RESOURCE_DIAGNOSTIC_FLAG = 'AQ_MCP_OAUTH_PREVIEW_OMIT_RESOURCE_DIAGNOSTIC';
const MAX_STATE_LENGTH = 1024;
const MAX_SCOPE_LENGTH = 1024;
const OPTIONAL_PARAMETERS = ['scope', 'prompt', 'login_hint', 'nonce'];
const DESCOPE_IDENTITY_SCOPES = new Set(['profile', 'email']);
const SAFE_DISCOVERY_FAILURE_REASONS = new Set([
  'oauth_configuration_invalid',
  'resource_uri_invalid',
  'issuer_configuration_invalid',
  'jwks_configuration_invalid',
  'signing_algorithm_unsupported',
  'client_id_configuration_missing',
  'discovery_url_invalid',
  'discovery_metadata_unavailable',
  'discovery_fetch_failed',
  'discovery_fetch_timeout',
  'discovery_http_error',
  'discovery_response_too_large',
  'discovery_response_body_missing',
  'discovery_response_read_failed',
  'discovery_json_invalid',
  'discovery_document_invalid',
  'discovery_issuer_mismatch',
  'discovery_authorization_endpoint_mismatch',
  'discovery_token_endpoint_mismatch',
  'discovery_authorization_code_unsupported',
  'discovery_pkce_s256_unsupported',
  'discovery_jwks_uri_invalid',
  'discovery_jwks_uri_mismatch',
]);

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

function getSupabaseAuthorizationEndpoint(issuer) {
  const issuerUrl = new URL(issuer);
  if (
    issuerUrl.protocol !== 'https:'
    || issuerUrl.username
    || issuerUrl.password
    || issuerUrl.search
    || issuerUrl.hash
  ) {
    throw new McpOAuthConfigurationError('The OAuth issuer URL is invalid.');
  }
  issuerUrl.pathname = `${issuerUrl.pathname.replace(/\/+$/, '')}/oauth/authorize`;
  return issuerUrl;
}

export async function GET(request) {
  let metadata;
  try {
    metadata = getMcpProtectedResourceMetadata();
  } catch (error) {
    if (!(error instanceof McpOAuthConfigurationError)) throw error;
    return errorResponse('MCP OAuth is not configured.', 503);
  }

  const expectedClientId = process.env.AQ_MCP_OAUTH_CLIENT_ID;
  const requestUrl = new URL(request.url);
  const responseType = getSingleParameter(requestUrl.searchParams, 'response_type');
  const clientId = getSingleParameter(requestUrl.searchParams, 'client_id');
  const redirectUri = getSingleParameter(requestUrl.searchParams, 'redirect_uri');
  const codeChallenge = getSingleParameter(requestUrl.searchParams, 'code_challenge');
  const codeChallengeMethod = getSingleParameter(requestUrl.searchParams, 'code_challenge_method');
  const state = getSingleParameter(requestUrl.searchParams, 'state');
  const useDescope = isDescopeOAuthEnabled();
  const requestedResource = requestUrl.searchParams.has('resource')
    ? getSingleParameter(requestUrl.searchParams, 'resource')
    : metadata.resource;

  if (
    responseType !== 'code'
    || (!useDescope && (!expectedClientId || clientId !== expectedClientId))
    || redirectUri !== CLAUDE_REDIRECT_URI
    || !isValidCodeChallenge(codeChallenge)
    || codeChallengeMethod !== 'S256'
    || !isValidState(state)
    || requestedResource !== metadata.resource
  ) {
    return errorResponse('Invalid MCP OAuth authorization request.', 400);
  }

  if (useDescope) {
    try {
      if (!await isMcpOAuthClientRegistered(clientId, redirectUri)) {
        return errorResponse('Invalid MCP OAuth authorization client.', 400);
      }
    } catch (error) {
      if (!(error instanceof McpOAuthBrokerStoreUnavailableError)) throw error;
      return errorResponse('MCP OAuth registration service is unavailable.', 503);
    }
  }

  let authorizationEndpoint;
  let authorizationClientId = clientId;
  if (useDescope) {
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
        if (process.env.VERCEL_ENV === 'preview' && isDescopePreviewOAuthEnabled()) {
          const reason = SAFE_DISCOVERY_FAILURE_REASONS.has(error.reasonCode)
            ? error.reasonCode
            : 'unclassified_discovery_failure';
          console.error('[MCP OAuth] Preview Descope discovery failure:', reason);
        }
        return errorResponse('MCP OAuth discovery is unavailable.', 503);
      }
      throw error;
    }
  } else {
    authorizationEndpoint = getSupabaseAuthorizationEndpoint(metadata.authorization_servers[0]);
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
  const omitResourceForPreviewDiagnostic = process.env.VERCEL_ENV === 'preview'
    && !useDescope
    && process.env[OMIT_RESOURCE_DIAGNOSTIC_FLAG] === 'true';
  if (!useDescope && !omitResourceForPreviewDiagnostic) {
    forwarded.set('resource', requestedResource);
  } else {
    forwarded.delete('resource');
  }
  for (const parameter of OPTIONAL_PARAMETERS) {
    const value = getSingleParameter(requestUrl.searchParams, parameter);
    if (value !== null && (!useDescope || parameter !== 'nonce')) {
      forwarded.set(parameter, value);
    }
  }
  if (useDescope) {
    const requestedScopes = forwarded.get('scope')?.split(/\s+/).filter(
      (scope) => DESCOPE_IDENTITY_SCOPES.has(scope),
    ) || [];
    forwarded.set('scope', ['openid', ...new Set(requestedScopes)].join(' '));
  }

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
