import {
  McpOAuthBrokerStoreUnavailableError,
  revokeMcpOAuthBrokerTokens,
} from '../../../src/lib/mcp-oauth-broker-db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const TOKEN_HINTS = new Set(['access_token', 'refresh_token']);

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

export async function POST(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return oauthError('invalid_request', 400);
  }

  let form;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) {
      return oauthError('invalid_request', 400);
    }
    form = new URLSearchParams(body);
  } catch {
    return oauthError('invalid_request', 400);
  }

  const token = parameter(form, 'token');
  const tokenTypeHint = parameter(form, 'token_type_hint');
  if (
    !token
    || (tokenTypeHint !== null && !TOKEN_HINTS.has(tokenTypeHint))
  ) {
    return oauthError('invalid_request', 400);
  }

  try {
    // RFC 7009: an unknown or already-revoked token is still a successful
    // revocation (HTTP 200) so the response never leaks whether a token
    // existed. The hint is advisory only; both stores are checked.
    await revokeMcpOAuthBrokerTokens(token);
  } catch (error) {
    if (!(error instanceof McpOAuthBrokerStoreUnavailableError)) throw error;
    return oauthError('temporarily_unavailable', 503);
  }

  return new Response(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}
