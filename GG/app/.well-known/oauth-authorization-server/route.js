import {
  getMcpAuthorizationServerMetadata,
  isDescopeOAuthEnabled,
  McpOAuthConfigurationError,
} from '../../../src/lib/mcp-auth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  if (!isDescopeOAuthEnabled()) {
    return Response.json({ error: 'Not found.' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    return Response.json(getMcpAuthorizationServerMetadata(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (!(error instanceof McpOAuthConfigurationError)) throw error;
    return Response.json({ error: 'MCP OAuth metadata is not configured.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
