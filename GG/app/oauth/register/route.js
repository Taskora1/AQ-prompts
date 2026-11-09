import crypto from 'node:crypto';

import { isDescopeOAuthEnabled } from '../../../src/lib/mcp-auth.js';
import { registerMcpOAuthClient } from '../../../src/lib/mcp-oauth-broker-db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLAUDE_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const MAX_CLIENT_NAME_LENGTH = 128;

function errorResponse(error, status) {
  return Response.json({ error }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}

async function parseRegistrationRequest(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return { input: null, reasonCode: 'content_type_invalid' };
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return { input: null, reasonCode: 'request_too_large' };
  }
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) {
    return { input: null, reasonCode: 'request_too_large' };
  }
  try {
    const input = JSON.parse(body);
    return input && typeof input === 'object' && !Array.isArray(input)
      ? { input, reasonCode: null }
      : { input: null, reasonCode: 'metadata_invalid' };
  } catch {
    return { input: null, reasonCode: 'json_invalid' };
  }
}

function registrationError(input) {
  if (!input || !Array.isArray(input.redirect_uris) || input.redirect_uris.length !== 1) {
    return 'redirect_uris_invalid';
  }
  if (input.redirect_uris[0] !== CLAUDE_REDIRECT_URI) return 'redirect_uri_unsupported';
  if (input.grant_types !== undefined) {
    const supportedGrantTypes = new Set(['authorization_code', 'refresh_token']);
    if (
      !Array.isArray(input.grant_types)
      || input.grant_types.length === 0
      || input.grant_types.length > supportedGrantTypes.size
      || new Set(input.grant_types).size !== input.grant_types.length
      || !input.grant_types.includes('authorization_code')
      || input.grant_types.some((grantType) => !supportedGrantTypes.has(grantType))
    ) {
      return 'grant_types_unsupported';
    }
  }
  if (
    input.response_types !== undefined
    && (!Array.isArray(input.response_types)
      || input.response_types.length !== 1
      || input.response_types[0] !== 'code')
  ) {
    return 'response_types_unsupported';
  }
  if (
    input.token_endpoint_auth_method !== undefined
    && input.token_endpoint_auth_method !== 'none'
  ) {
    return 'token_auth_method_unsupported';
  }
  if (
    input.client_name !== undefined
    && (typeof input.client_name !== 'string'
      || input.client_name.trim().length === 0
      || input.client_name.length > MAX_CLIENT_NAME_LENGTH)
  ) {
    return 'client_name_invalid';
  }
  return null;
}

export async function POST(request) {
  if (!isDescopeOAuthEnabled()) return errorResponse('Not found.', 404);

  let parsed;
  try {
    parsed = await parseRegistrationRequest(request);
  } catch {
    console.warn('[MCP OAuth] Client registration rejected: request_read_failed');
    return errorResponse('invalid_client_metadata', 400);
  }
  const reasonCode = parsed.reasonCode || registrationError(parsed.input);
  if (reasonCode) {
    console.warn(`[MCP OAuth] Client registration rejected: ${reasonCode}`);
    return errorResponse('invalid_client_metadata', 400);
  }
  const { input } = parsed;

  const clientId = `aqmc_${crypto.randomBytes(24).toString('base64url')}`;
  const redirectUri = input.redirect_uris[0];
  const grantTypes = input.grant_types || ['authorization_code'];
  try {
    await registerMcpOAuthClient({
      clientId,
      clientName: input.client_name?.trim(),
      redirectUri,
      refreshEnabled: grantTypes.includes('refresh_token'),
    });
  } catch (error) {
    console.error('[MCP OAuth] Client registration failed:', error?.code || error?.name || 'unknown');
    return errorResponse('server_error', 503);
  }

  return Response.json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: [redirectUri],
    grant_types: grantTypes,
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    ...(input.client_name ? { client_name: input.client_name.trim() } : {}),
  }, {
    status: 201,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}
