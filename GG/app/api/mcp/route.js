import {
  authenticateMcpRequest,
  getMcpOAuthChallenge,
  getMcpOAuthClaimsDiagnostic,
  InvalidMcpTokenError,
  McpJwksUnavailableError,
  McpOAuthConfigurationError,
} from '../../../src/lib/mcp-auth.js';
import { hasMcpOAuthAuthorization } from '../../../src/lib/mcp-oauth-db.js';
import { handleMcpProtocolRequest } from '../../../src/lib/mcp-server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLAIMS_DIAGNOSTIC_FLAG = 'AQ_MCP_OAUTH_CLAIMS_DIAGNOSTIC';
const CLAIMS_DIAGNOSTIC_HEADER = 'x-aq-mcp-oauth-claims-diagnostic';

function jsonResponse(body, status, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

async function handleClaimsDiagnostic(request) {
  if (
    process.env.VERCEL_ENV !== 'preview'
    || process.env[CLAIMS_DIAGNOSTIC_FLAG] !== 'true'
  ) {
    return jsonResponse({ error: 'Not found.' }, 404);
  }

  try {
    const claims = await getMcpOAuthClaimsDiagnostic(request);
    return jsonResponse(claims, 403, { 'Referrer-Policy': 'no-referrer' });
  } catch (error) {
    if (error instanceof InvalidMcpTokenError) {
      return jsonResponse({ error: 'Invalid diagnostic token.' }, 401);
    }
    if (
      error instanceof McpOAuthConfigurationError
      || error instanceof McpJwksUnavailableError
    ) {
      return jsonResponse({ error: 'MCP OAuth diagnostic is unavailable.' }, 503);
    }
    return jsonResponse({ error: 'MCP OAuth diagnostic is unavailable.' }, 503);
  }
}

async function handleRequest(request) {
  if (request.headers.get(CLAIMS_DIAGNOSTIC_HEADER) === 'true') {
    return handleClaimsDiagnostic(request);
  }

  const authentication = await authenticateMcpRequest(request);
  if (!authentication.ok) {
    if (authentication.status === 401) {
      return jsonResponse(
        { error: 'Unauthorized.' },
        401,
        { 'WWW-Authenticate': getMcpOAuthChallenge() },
      );
    }
    return jsonResponse({ error: 'MCP OAuth authentication is unavailable.' }, 503);
  }

  if (authentication.authentication.type === 'oauth') {
    try {
      if (!await hasMcpOAuthAuthorization(authentication.authentication)) {
        return jsonResponse({ error: 'MCP user is not authorized.' }, 403);
      }
    } catch (error) {
      console.error('[MCP] OAuth authorization lookup failed:', error?.code || error?.name || 'unknown');
      return jsonResponse({ error: 'MCP OAuth authorization is unavailable.' }, 503);
    }
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { error: 'Only POST is supported for the stateless MCP endpoint.' },
      405,
      { Allow: 'POST' },
    );
  }

  try {
    const response = await handleMcpProtocolRequest(request, authentication.authentication);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    console.error('[MCP] Protocol request failed.');
    return jsonResponse({ error: 'MCP request failed.' }, 500);
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
