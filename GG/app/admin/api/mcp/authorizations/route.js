import { NextResponse } from 'next/server';

import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import {
  grantMcpOAuthAuthorization,
  listMcpOAuthAuthorizations,
  revokeMcpOAuthAuthorization,
  setMcpOAuthCapabilities,
} from '@/lib/mcp-oauth-db';
import {
  isMcpOAuthClientRegistered,
  listRecentUnlinkedMcpOAuthSubjects,
  listMcpOAuthClients,
  deleteMcpOAuthBrokerTokensForSubject,
  McpOAuthBrokerStoreUnavailableError,
} from '@/lib/mcp-oauth-broker-db';
import { getMcpResourceMetadataResource, isDescopeOAuthEnabled } from '@/lib/mcp-auth';

function requireSuperAdmin(user) {
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isSuperAdmin(user)) {
    return NextResponse.json({ error: 'Only a Super Admin can manage MCP access.' }, { status: 403 });
  }
  return null;
}

async function clientIds() {
  if (isDescopeOAuthEnabled()) {
    const clients = await listMcpOAuthClients();
    return { clients, clientIds: clients.map(({ clientId }) => clientId) };
  }
  const clientId = process.env.AQ_MCP_OAUTH_CLIENT_ID;
  return {
    clients: clientId ? [{ clientId, clientName: 'Configured OAuth client' }] : [],
    clientIds: clientId ? [clientId] : [],
  };
}

function validSubject(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 255
    && value.trim() === value
    && ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    });
}

export async function GET() {
  const admin = await getCurrentAdminUser();
  const denied = requireSuperAdmin(admin);
  if (denied) return denied;

  try {
    const clients = await clientIds();
    const authorizations = (
      await Promise.all(clients.clientIds.map((clientId) => listMcpOAuthAuthorizations(clientId)))
    ).flat();
    const recentSubjects = isDescopeOAuthEnabled()
      ? await listRecentUnlinkedMcpOAuthSubjects(getMcpResourceMetadataResource())
      : [];
    return NextResponse.json(
      { clients: clients.clients, authorizations, recentSubjects },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Admin MCP authorization listing failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'MCP authorizations could not be loaded.' }, { status: 503 });
  }
}

export async function POST(request) {
  const admin = await getCurrentAdminUser();
  const denied = requireSuperAdmin(admin);
  if (denied) return denied;

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const clientId = typeof input?.clientId === 'string'
    ? input.clientId
    : isDescopeOAuthEnabled()
      ? ''
      : process.env.AQ_MCP_OAUTH_CLIENT_ID || '';
  const validBase = input
    && typeof input === 'object'
    && !Array.isArray(input)
    && ['authorize', 'revoke', 'set_capabilities'].includes(input.action)
    && validSubject(input.subject)
    && clientId.length > 0
    && clientId.length <= 128;
  const validKeys = validBase && Object.keys(input).every((key) => (
    key === 'action'
    || key === 'subject'
    || key === 'clientId'
    || (input.action === 'authorize' && key === 'adminUserId')
    || (input.action === 'set_capabilities' && key === 'capabilities')
  ));
  const validAdminUserId = input?.action === 'authorize'
    && Number.isSafeInteger(input.adminUserId)
    && input.adminUserId > 0;
  const validCapabilities = input?.action === 'set_capabilities'
    && input.capabilities
    && typeof input.capabilities === 'object'
    && !Array.isArray(input.capabilities)
    && Object.keys(input.capabilities).length > 0
    && Object.entries(input.capabilities).every(([key, value]) => (
      ['publish', 'uploadImages', 'publishBlog'].includes(key)
      && typeof value === 'boolean'
    ));
  if (
    !validBase
    || !validKeys
    || (input.action === 'authorize' && !validAdminUserId)
    || (input.action === 'set_capabilities' && !validCapabilities)
  ) {
    return NextResponse.json({
      error: 'Provide a valid action and OAuth subject linked to an admin account; capability values must be booleans.',
    }, { status: 400 });
  }

  try {
    if (isDescopeOAuthEnabled()) {
      if (!await isMcpOAuthClientRegistered(clientId, 'https://claude.ai/api/mcp/auth_callback')) {
        return NextResponse.json({ error: 'The MCP OAuth client is not registered.' }, { status: 404 });
      }
    } else if (clientId !== process.env.AQ_MCP_OAUTH_CLIENT_ID) {
      return NextResponse.json({ error: 'The MCP OAuth client is not approved.' }, { status: 400 });
    }
  } catch (error) {
    if (!(error instanceof McpOAuthBrokerStoreUnavailableError)) throw error;
    return NextResponse.json({ error: 'MCP OAuth client registry is unavailable.' }, { status: 503 });
  }

  try {
    if (input.action === 'authorize') {
      const authorization = await grantMcpOAuthAuthorization(
        input.subject,
        clientId,
        input.adminUserId,
        admin.id,
      );
      if (!authorization) {
        return NextResponse.json(
          { error: 'Select an existing Admin or Super Admin account.' },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, authorization }, { status: 201 });
    }
    if (input.action === 'set_capabilities') {
      const authorization = await setMcpOAuthCapabilities(
        input.subject,
        clientId,
        {
          ...(Object.hasOwn(input.capabilities, 'publish')
            ? { canPublish: input.capabilities.publish } : {}),
          ...(Object.hasOwn(input.capabilities, 'uploadImages')
            ? { canUploadImages: input.capabilities.uploadImages } : {}),
          ...(Object.hasOwn(input.capabilities, 'publishBlog')
            ? { canPublishBlog: input.capabilities.publishBlog } : {}),
        },
        admin.id,
      );
      if (!authorization) {
        return NextResponse.json({ error: 'Active MCP authorization not found.' }, { status: 404 });
      }
      return NextResponse.json({ success: true, authorization });
    }
    const authorization = await revokeMcpOAuthAuthorization(input.subject, clientId);
    if (!authorization) {
      return NextResponse.json({ error: 'Active MCP authorization not found.' }, { status: 404 });
    }
    // A revoked subject keeps no usable session: delete their broker access
    // and refresh tokens too. Best-effort — the revocation itself already
    // succeeded, so a store failure here must not undo it.
    try {
      await deleteMcpOAuthBrokerTokensForSubject(input.subject, clientId);
    } catch (error) {
      console.error('Admin MCP revoke could not delete broker tokens:', error?.code || error?.name || 'unknown');
    }
    return NextResponse.json({ success: true, authorization });
  } catch (error) {
    console.error('Admin MCP authorization update failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'MCP authorization could not be updated.' }, { status: 503 });
  }
}
