import crypto from 'node:crypto';

import {
  isDescopeOAuthEnabled,
  getMcpOAuthServerMetadata,
  getMcpResourceMetadataResource,
  InvalidMcpTokenError,
  McpJwksUnavailableError,
  McpOAuthConfigurationError,
  McpOAuthMetadataUnavailableError,
  verifyDescopeIdentityToken,
} from '../../../src/lib/mcp-auth.js';
import {
  isMcpOAuthRefreshEnabled,
  isMcpOAuthClientRegistered,
  McpOAuthBrokerStoreUnavailableError,
  rotateMcpOAuthBrokerRefreshToken,
  storeMcpOAuthBrokerToken,
  storeMcpOAuthBrokerRefreshToken,
} from '../../../src/lib/mcp-oauth-broker-db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLAUDE_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const TOKEN_TYPE = 'Bearer';
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;
const TOKEN_MAX_AGE_SECONDS = 3600;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const CODE_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;
const BROKER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

function oauthError(error, status) {
  return Response.json({ error }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}

function parameter(form, name) {
  const values = form.getAll(name);
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : null;
}

function encodeClientCredential(value) {
  return new URLSearchParams({ credential: value }).toString().slice('credential='.length);
}

async function readProviderResponse(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_RESPONSE_BYTES) return null;
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  let done = false;
  while (!done) {
    const part = await reader.read();
    done = part.done;
    if (done) continue;
    byteLength += part.value.byteLength;
    if (byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

export async function POST(request) {
  if (!isDescopeOAuthEnabled()) return oauthError('unsupported_grant_type', 400);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return oauthError('invalid_request', 400);
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return oauthError('invalid_request', 400);
  }

  let form;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) return oauthError('invalid_request', 400);
    form = new URLSearchParams(body);
  } catch {
    return oauthError('invalid_request', 400);
  }

  const grantType = parameter(form, 'grant_type');
  const clientId = parameter(form, 'client_id');
  const code = parameter(form, 'code');
  const refreshToken = parameter(form, 'refresh_token');
  const redirectUri = parameter(form, 'redirect_uri');
  const codeVerifier = parameter(form, 'code_verifier');
  const suppliedResource = parameter(form, 'resource');
  const descopeClientId = process.env.AQ_MCP_DESCOPE_CLIENT_ID;
  const descopeClientSecret = process.env.AQ_MCP_DESCOPE_CLIENT_SECRET;
  let expectedResource;
  try {
    expectedResource = getMcpResourceMetadataResource();
  } catch (error) {
    if (error instanceof McpOAuthConfigurationError) {
      return oauthError('temporarily_unavailable', 503);
    }
    throw error;
  }

  const resource = suppliedResource
    || (grantType === 'refresh_token' && !form.has('resource') ? expectedResource : null);
  if (!clientId || !resource || resource !== expectedResource) {
    return oauthError('invalid_request', 400);
  }

  if (grantType === 'refresh_token') {
    if (
      !refreshToken
      || !BROKER_TOKEN_PATTERN.test(refreshToken)
      || (form.has('redirect_uri') && redirectUri !== CLAUDE_REDIRECT_URI)
    ) {
      return oauthError('invalid_request', 400);
    }
    try {
      if (!await isMcpOAuthRefreshEnabled(clientId, CLAUDE_REDIRECT_URI)) {
        return oauthError('invalid_grant', 400);
      }
      const accessToken = crypto.randomBytes(32).toString('base64url');
      const replacementRefreshToken = crypto.randomBytes(32).toString('base64url');
      const identity = await rotateMcpOAuthBrokerRefreshToken({
        refreshToken,
        accessToken,
        replacementRefreshToken,
        clientId,
        redirectUri: CLAUDE_REDIRECT_URI,
        resource: expectedResource,
        accessExpiresIn: TOKEN_MAX_AGE_SECONDS,
        refreshExpiresIn: REFRESH_TOKEN_MAX_AGE_SECONDS,
      });
      if (!identity) return oauthError('invalid_grant', 400);
      return Response.json({
        access_token: accessToken,
        token_type: TOKEN_TYPE,
        expires_in: TOKEN_MAX_AGE_SECONDS,
        refresh_token: replacementRefreshToken,
      }, {
        headers: {
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
      });
    } catch (error) {
      if (!(error instanceof McpOAuthBrokerStoreUnavailableError)) throw error;
      console.error('[MCP OAuth] Refresh token rotation failed:', error.code);
      return oauthError('temporarily_unavailable', 503);
    }
  }

  if (
    grantType !== 'authorization_code'
    || !code
    || !redirectUri
    || !codeVerifier
    || !CODE_PATTERN.test(code)
    || !CODE_VERIFIER_PATTERN.test(codeVerifier)
    || redirectUri !== CLAUDE_REDIRECT_URI
    || refreshToken !== null
  ) {
    return oauthError(grantType === 'authorization_code' ? 'invalid_request' : 'unsupported_grant_type', 400);
  }
  try {
    if (!await isMcpOAuthClientRegistered(clientId, redirectUri)) {
      return oauthError('invalid_client', 401);
    }
  } catch (error) {
    if (!(error instanceof McpOAuthBrokerStoreUnavailableError)) throw error;
    return oauthError('temporarily_unavailable', 503);
  }
  let refreshEnabled;
  try {
    refreshEnabled = await isMcpOAuthRefreshEnabled(clientId, redirectUri);
  } catch (error) {
    if (!(error instanceof McpOAuthBrokerStoreUnavailableError)) throw error;
    return oauthError('temporarily_unavailable', 503);
  }
  if (!descopeClientId || !descopeClientSecret) {
    return oauthError('server_error', 503);
  }

  let oauthMetadata;
  try {
    oauthMetadata = await getMcpOAuthServerMetadata();
  } catch (error) {
    if (
      error instanceof McpOAuthConfigurationError
      || error instanceof McpOAuthMetadataUnavailableError
    ) {
      return oauthError('temporarily_unavailable', 503);
    }
    throw error;
  }

  const encodedClientId = encodeClientCredential(descopeClientId);
  const encodedClientSecret = encodeClientCredential(descopeClientSecret);
  const basicCredentials = Buffer.from(`${encodedClientId}:${encodedClientSecret}`).toString('base64');
  const providerRequest = new URLSearchParams({
    grant_type: grantType,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  let providerResponse;
  try {
    providerResponse = await fetch(oauthMetadata.tokenEndpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Basic ${basicCredentials}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: providerRequest,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return oauthError('temporarily_unavailable', 503);
  }

  if (!providerResponse.ok) {
    if (providerResponse.status === 400) return oauthError('invalid_grant', 400);
    console.error('[MCP OAuth] Descope token exchange failed:', providerResponse.status);
    return oauthError('temporarily_unavailable', 503);
  }
  let providerTokens;
  try {
    providerTokens = await readProviderResponse(providerResponse);
  } catch {
    return oauthError('temporarily_unavailable', 503);
  }
  if (
    !providerTokens
    || typeof providerTokens.id_token !== 'string'
    || typeof providerTokens.access_token !== 'string'
    || !Number.isSafeInteger(providerTokens.expires_in)
    || providerTokens.expires_in <= 0
  ) {
    return oauthError('invalid_grant', 400);
  }

  let identity;
  try {
    identity = await verifyDescopeIdentityToken(providerTokens.id_token);
  } catch (error) {
    if (
      error instanceof McpOAuthConfigurationError
      || error instanceof McpJwksUnavailableError
      || error instanceof McpOAuthMetadataUnavailableError
    ) {
      return oauthError('temporarily_unavailable', 503);
    }
    if (!(error instanceof InvalidMcpTokenError)) throw error;
    return oauthError('invalid_grant', 400);
  }

  const accessToken = crypto.randomBytes(32).toString('base64url');
  const issuedRefreshToken = refreshEnabled
    ? crypto.randomBytes(32).toString('base64url')
    : null;
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Math.floor(Math.min(
    providerTokens.expires_in,
    identity.exp - now,
    TOKEN_MAX_AGE_SECONDS,
  ));
  if (expiresIn < 1) return oauthError('invalid_grant', 400);
  try {
    await storeMcpOAuthBrokerToken({
      accessToken,
      subject: identity.sub,
      clientId,
      resource: getMcpResourceMetadataResource(),
      expiresIn,
    });
    if (issuedRefreshToken) {
      await storeMcpOAuthBrokerRefreshToken({
        refreshToken: issuedRefreshToken,
        subject: identity.sub,
        clientId,
        resource: getMcpResourceMetadataResource(),
        expiresIn: REFRESH_TOKEN_MAX_AGE_SECONDS,
      });
    }
  } catch (error) {
    console.error('[MCP OAuth] Broker token persistence failed:', error?.code || error?.name || 'unknown');
    return oauthError('server_error', 503);
  }

  return Response.json({
    access_token: accessToken,
    token_type: TOKEN_TYPE,
    expires_in: expiresIn,
    ...(issuedRefreshToken ? { refresh_token: issuedRefreshToken } : {}),
  }, {
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}
