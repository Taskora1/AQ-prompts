import crypto from 'node:crypto';

import { getPgPool } from './db.js';

const MAX_BROKER_TOKEN_LENGTH = 256;

export class McpOAuthBrokerTokenInvalidError extends Error {
  constructor(reasonCode = 'jwt_invalid') {
    super('Invalid MCP OAuth broker token.');
    this.name = 'McpOAuthBrokerTokenInvalidError';
    this.reasonCode = reasonCode;
  }
}

export class McpOAuthBrokerStoreUnavailableError extends Error {
  constructor() {
    super('The MCP OAuth broker token store is unavailable.');
    this.name = 'McpOAuthBrokerStoreUnavailableError';
    this.code = 'MCP_OAUTH_BROKER_STORE_UNAVAILABLE';
  }
}

function validateOAuthClientMetadata({ clientId, clientName, redirectUri, refreshEnabled }) {
  if (
    typeof clientId !== 'string'
    || !/^aqmc_[A-Za-z0-9_-]{32,64}$/.test(clientId)
    || typeof redirectUri !== 'string'
    || redirectUri !== 'https://claude.ai/api/mcp/auth_callback'
    || typeof refreshEnabled !== 'boolean'
    || (clientName !== undefined
      && (typeof clientName !== 'string' || clientName.length > 128))
  ) {
    throw new TypeError('MCP OAuth client registration data is invalid.');
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function registerMcpOAuthClient({
  clientId,
  clientName,
  redirectUri,
  refreshEnabled = false,
}) {
  validateOAuthClientMetadata({ clientId, clientName, redirectUri, refreshEnabled });
  try {
    await getPgPool().query(
      `
        INSERT INTO mcp_oauth_clients (
          client_id, client_name, redirect_uri, refresh_enabled
        )
        VALUES ($1, $2, $3, $4)
      `,
      [clientId, clientName || null, redirectUri, refreshEnabled],
    );
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
}

export async function isMcpOAuthRefreshEnabled(clientId, redirectUri) {
  if (typeof clientId !== 'string' || clientId.length > 128) return false;
  try {
    const result = await getPgPool().query(
      `
        SELECT client_id
        FROM mcp_oauth_clients
        WHERE client_id = $1
          AND redirect_uri = $2
          AND refresh_enabled = TRUE
        LIMIT 1
      `,
      [clientId, redirectUri],
    );
    return result.rowCount === 1;
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
}

export async function isMcpOAuthClientRegistered(clientId, redirectUri) {
  if (typeof clientId !== 'string' || clientId.length > 128) return false;
  try {
    const result = await getPgPool().query(
      `
        SELECT client_id
        FROM mcp_oauth_clients
        WHERE client_id = $1
          AND redirect_uri = $2
        LIMIT 1
      `,
      [clientId, redirectUri],
    );
    return result.rowCount === 1;
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
}

export async function listMcpOAuthClients() {
  try {
    const result = await getPgPool().query(
      `
        SELECT client_id AS "clientId",
               client_name AS "clientName",
               created_at::text AS "registeredAt"
        FROM mcp_oauth_clients
        ORDER BY created_at DESC
      `,
    );
    return result.rows;
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
}

export async function listRecentUnlinkedMcpOAuthSubjects(resource) {
  if (typeof resource !== 'string' || resource.length === 0 || resource.length > 2048) {
    throw new TypeError('MCP OAuth subject lookup resource is invalid.');
  }
  try {
    const result = await getPgPool().query(
      `
        WITH recent_subjects AS (
          SELECT token.subject,
                 token.client_id,
                 client.client_name,
                 token.created_at,
                 ROW_NUMBER() OVER (
                   PARTITION BY token.subject, token.client_id
                   ORDER BY token.created_at DESC
                 ) AS subject_rank
          FROM mcp_oauth_broker_tokens token
          JOIN mcp_oauth_clients client
            ON client.client_id = token.client_id
          WHERE token.resource = $1
            AND token.created_at >= NOW() - INTERVAL '24 hours'
        )
        SELECT recent.subject,
               recent.client_id AS "clientId",
               recent.client_name AS "clientName",
               recent.created_at::text AS "lastAuthenticatedAt"
        FROM recent_subjects recent
        WHERE recent.subject_rank = 1
          AND NOT EXISTS (
            SELECT 1
            FROM mcp_oauth_authorizations authz
            JOIN users admin_user
              ON admin_user.id = authz.admin_user_id
             AND admin_user.role IN ('admin', 'super_admin')
            WHERE authz.subject = recent.subject
              AND authz.client_id = recent.client_id
              AND authz.revoked_at IS NULL
          )
        ORDER BY recent.created_at DESC
        LIMIT 100
      `,
      [resource],
    );
    return result.rows;
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
}

export async function storeMcpOAuthBrokerToken({
  accessToken,
  subject,
  clientId,
  resource,
  expiresIn,
}) {
  if (
    typeof accessToken !== 'string'
    || accessToken.length < 32
    || accessToken.length > MAX_BROKER_TOKEN_LENGTH
    || typeof subject !== 'string'
    || subject.length === 0
    || typeof clientId !== 'string'
    || clientId.length === 0
    || typeof resource !== 'string'
    || !Number.isSafeInteger(expiresIn)
    || expiresIn < 1
  ) {
    throw new TypeError('MCP OAuth broker token data is invalid.');
  }

  try {
    await getPgPool().query(
      `
        WITH expired_tokens AS (
          DELETE FROM mcp_oauth_broker_tokens
          WHERE expires_at < NOW() - INTERVAL '1 day'
          RETURNING token_hash
        )
        INSERT INTO mcp_oauth_broker_tokens (
          token_hash, subject, client_id, resource, expires_at
        )
        VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 second'))
      `,
      [hashToken(accessToken), subject, clientId, resource, expiresIn],
    );
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
}

export async function storeMcpOAuthBrokerRefreshToken({
  refreshToken,
  subject,
  clientId,
  resource,
  expiresIn,
}) {
  if (
    typeof refreshToken !== 'string'
    || refreshToken.length < 32
    || refreshToken.length > MAX_BROKER_TOKEN_LENGTH
    || typeof subject !== 'string'
    || subject.length === 0
    || typeof clientId !== 'string'
    || clientId.length === 0
    || typeof resource !== 'string'
    || !Number.isSafeInteger(expiresIn)
    || expiresIn < 1
  ) {
    throw new TypeError('MCP OAuth broker refresh token data is invalid.');
  }

  try {
    await getPgPool().query(
      `
        INSERT INTO mcp_oauth_broker_refresh_tokens (
          token_hash, subject, client_id, resource, expires_at
        )
        VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 second'))
      `,
      [hashToken(refreshToken), subject, clientId, resource, expiresIn],
    );
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
}

export async function rotateMcpOAuthBrokerRefreshToken({
  refreshToken,
  accessToken,
  replacementRefreshToken,
  clientId,
  redirectUri,
  resource,
  accessExpiresIn,
  refreshExpiresIn,
}) {
  if (
    typeof refreshToken !== 'string'
    || refreshToken.length < 32
    || refreshToken.length > MAX_BROKER_TOKEN_LENGTH
    || typeof accessToken !== 'string'
    || accessToken.length < 32
    || accessToken.length > MAX_BROKER_TOKEN_LENGTH
    || typeof replacementRefreshToken !== 'string'
    || replacementRefreshToken.length < 32
    || replacementRefreshToken.length > MAX_BROKER_TOKEN_LENGTH
    || typeof clientId !== 'string'
    || clientId.length === 0
    || redirectUri !== 'https://claude.ai/api/mcp/auth_callback'
    || typeof resource !== 'string'
    || !Number.isSafeInteger(accessExpiresIn)
    || accessExpiresIn < 1
    || !Number.isSafeInteger(refreshExpiresIn)
    || refreshExpiresIn < 1
  ) {
    throw new TypeError('MCP OAuth refresh rotation data is invalid.');
  }

  try {
    const result = await getPgPool().query(
      `
        WITH consumed AS (
          DELETE FROM mcp_oauth_broker_refresh_tokens token
          USING mcp_oauth_clients client
          WHERE token.token_hash = $1
            AND token.client_id = $2
            AND token.resource = $6
            AND token.expires_at > NOW()
            AND client.client_id = token.client_id
            AND client.redirect_uri = $3
            AND client.refresh_enabled = TRUE
            AND NOT EXISTS (
              SELECT 1
              FROM mcp_oauth_authorizations authz
              WHERE authz.subject = token.subject
                AND authz.client_id = token.client_id
                AND authz.revoked_at IS NOT NULL
            )
          RETURNING token.subject, token.client_id, token.resource
        ),
        inserted_access AS (
          INSERT INTO mcp_oauth_broker_tokens (
            token_hash, subject, client_id, resource, expires_at
          )
          SELECT $4, subject, client_id, resource,
                 NOW() + ($7 * INTERVAL '1 second')
          FROM consumed
          RETURNING token_hash
        ),
        inserted_refresh AS (
          INSERT INTO mcp_oauth_broker_refresh_tokens (
            token_hash, subject, client_id, resource, expires_at
          )
          SELECT $5, subject, client_id, resource,
                 NOW() + ($8 * INTERVAL '1 second')
          FROM consumed
          RETURNING token_hash
        )
        SELECT consumed.subject,
               consumed.client_id AS "clientId",
               consumed.resource
        FROM consumed
        WHERE EXISTS (SELECT 1 FROM inserted_access)
          AND EXISTS (SELECT 1 FROM inserted_refresh)
      `,
      [
        hashToken(refreshToken),
        clientId,
        redirectUri,
        hashToken(accessToken),
        hashToken(replacementRefreshToken),
        resource,
        accessExpiresIn,
        refreshExpiresIn,
      ],
    );
    return result.rows[0] || null;
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
}

export async function lookupMcpOAuthBrokerToken(accessToken) {
  if (
    typeof accessToken !== 'string'
    || accessToken.length < 32
    || accessToken.length > MAX_BROKER_TOKEN_LENGTH
  ) {
    throw new McpOAuthBrokerTokenInvalidError('bearer_missing_or_invalid');
  }

  let result;
  try {
    result = await getPgPool().query(
      `
        SELECT token.subject, token.client_id AS "clientId", token.resource
        FROM mcp_oauth_broker_tokens token
        JOIN mcp_oauth_clients client ON client.client_id = token.client_id
        WHERE token.token_hash = $1
          AND token.expires_at > NOW()
        LIMIT 1
      `,
      [hashToken(accessToken)],
    );
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
  if (result.rowCount !== 1) {
    throw new McpOAuthBrokerTokenInvalidError('jwt_invalid');
  }

  const row = result.rows[0];
  const { getMcpResourceMetadataResource } = await import('./mcp-auth.js');
  if (row.resource !== getMcpResourceMetadataResource()) {
    throw new McpOAuthBrokerTokenInvalidError('audience_mismatch');
  }
  return {
    type: 'oauth',
    subject: row.subject,
    clientId: row.clientId,
  };
}

// RFC 7009 token revocation: delete a presented token (access or refresh)
// from both broker stores by its hash. Returns true when a row was deleted.
// Callers must still return HTTP 200 for unknown tokens so revocation does
// not leak whether a token existed.
export async function revokeMcpOAuthBrokerTokens(token) {
  if (
    typeof token !== 'string'
    || token.length < 32
    || token.length > MAX_BROKER_TOKEN_LENGTH
  ) {
    return false;
  }
  const tokenHash = hashToken(token);
  try {
    const [access, refresh] = await Promise.all([
      getPgPool().query(
        'DELETE FROM mcp_oauth_broker_tokens WHERE token_hash = $1',
        [tokenHash],
      ),
      getPgPool().query(
        'DELETE FROM mcp_oauth_broker_refresh_tokens WHERE token_hash = $1',
        [tokenHash],
      ),
    ]);
    return (access.rowCount || 0) + (refresh.rowCount || 0) > 0;
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
}

// Delete every broker token (access + refresh) held by one OAuth subject for
// one client. Used when a Super Admin revokes the subject's authorization,
// so a revoked subject keeps no usable or refreshable session.
export async function deleteMcpOAuthBrokerTokensForSubject(subject, clientId) {
  if (
    typeof subject !== 'string'
    || subject.length === 0
    || typeof clientId !== 'string'
    || clientId.length === 0
  ) {
    throw new TypeError('MCP OAuth broker token subject data is invalid.');
  }
  try {
    const [access, refresh] = await Promise.all([
      getPgPool().query(
        'DELETE FROM mcp_oauth_broker_tokens WHERE subject = $1 AND client_id = $2',
        [subject, clientId],
      ),
      getPgPool().query(
        'DELETE FROM mcp_oauth_broker_refresh_tokens WHERE subject = $1 AND client_id = $2',
        [subject, clientId],
      ),
    ]);
    return (access.rowCount || 0) + (refresh.rowCount || 0);
  } catch {
    throw new McpOAuthBrokerStoreUnavailableError();
  }
}
