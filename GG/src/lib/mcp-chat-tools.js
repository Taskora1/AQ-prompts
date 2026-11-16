// MCP tools for the admin agent chat panel.
//
// Muse AI never clicks the admin UI — it reads and sends chat messages only
// through these two tools. Authorization is exactly like the existing draft
// tools: the caller must be an OAuth subject explicitly linked to an Admin
// or Super Admin account in /admin/users (mcp_oauth_authorizations), and the
// link must not be revoked. The sender of every message is the linked admin
// user id, resolved server-side from the verified subject — never from the
// tool input — so no agent can impersonate another agent or the user.
import { getPgPool } from './db.js';
import {
  AgentMessageValidationError,
  createAgentMessage,
  DEFAULT_MESSAGE_PAGE_SIZE,
  listAgentMessages as listMessages,
  MAX_MESSAGE_PAGE_SIZE,
  normalizeMessageBody,
} from './agent-messages-db.js';
import { McpAuthorizationError } from './mcp-oauth-db.js';

export class McpChatToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'McpChatToolError';
  }
}

function ensureOAuth(authentication) {
  if (authentication?.type !== 'oauth') {
    throw new McpAuthorizationError('OAuth authentication is required for chat tools.');
  }
}

// Resolve the verified OAuth subject to its linked admin account. This runs
// the same join as lockMcpOAuthAuthorization (subject + client, not revoked,
// linked admin account with an admin role) and returns the admin id and
// email, so the query is both the authorization check and the sender
// resolution in one statement.
async function getMcpAdminUser(authentication) {
  const result = await getPgPool().query(
    `
      SELECT
        admin_user.id AS "adminUserId",
        admin_user.email AS "email"
      FROM mcp_oauth_authorizations AS authz
      JOIN users admin_user
        ON admin_user.id = authz.admin_user_id
        AND admin_user.role IN ('admin', 'super_admin')
      WHERE authz.subject = $1
        AND authz.client_id = $2
        AND authz.revoked_at IS NULL
      LIMIT 1
    `,
    [authentication.subject, authentication.clientId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new McpAuthorizationError(
      'MCP user is not linked to an admin account. Link the OAuth subject to an admin account in /admin/users first.',
    );
  }
  return { adminUserId: Number(row.adminUserId), email: row.email };
}

function normalizeLimit(value) {
  if (value == null) return DEFAULT_MESSAGE_PAGE_SIZE;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_MESSAGE_PAGE_SIZE) {
    throw new McpChatToolError(`limit must be between 1 and ${MAX_MESSAGE_PAGE_SIZE}.`);
  }
  return value;
}

function normalizeBeforeId(value) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new McpChatToolError('beforeId must be a positive integer.');
  }
  return value;
}

export async function listAgentMessages(input, authentication = null) {
  ensureOAuth(authentication);
  const limit = normalizeLimit(input.limit);
  const beforeId = normalizeBeforeId(input.beforeId);
  const adminUser = await getMcpAdminUser(authentication);
  const result = await listMessages({
    page: 1,
    pageSize: limit,
    viewerAdminId: adminUser.adminUserId,
    beforeId,
  });
  return {
    messages: result.messages,
    total: result.total,
    oldestId: result.messages.length > 0
      ? result.messages[result.messages.length - 1].id
      : null,
  };
}

export async function sendAgentMessage(input, authentication = null) {
  ensureOAuth(authentication);
  let body;
  try {
    body = normalizeMessageBody(input.body);
  } catch (error) {
    if (error instanceof AgentMessageValidationError) {
      throw new McpChatToolError(error.message);
    }
    throw error;
  }
  const adminUser = await getMcpAdminUser(authentication);
  const message = await createAgentMessage({
    senderAdminId: adminUser.adminUserId,
    body,
  });
  return { message };
}
