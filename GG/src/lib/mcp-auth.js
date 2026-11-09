import crypto from 'node:crypto';

const ISSUER_ENV = 'AQ_MCP_OAUTH_ISSUER';
const JWKS_URL_ENV = 'AQ_MCP_OAUTH_JWKS_URL';
const SIGNING_ALGORITHM_ENV = 'AQ_MCP_OAUTH_SIGNING_ALGORITHM';
const CLIENT_ID_ENV = 'AQ_MCP_OAUTH_CLIENT_ID';
const DESCOPE_CLIENT_ID_ENV = 'AQ_MCP_DESCOPE_CLIENT_ID';
const RESOURCE_URI_ENV = 'AQ_MCP_RESOURCE_URI';
const OAUTH_PROVIDER_ENV = 'AQ_MCP_OAUTH_PROVIDER';
const OAUTH_DISCOVERY_URL_ENV = 'AQ_MCP_OAUTH_DISCOVERY_URL';
const DESCOPE_AUTHORIZATION_ENDPOINT = 'https://api.descope.com/oauth2/v1/apps/authorize';
const DESCOPE_TOKEN_ENDPOINT = 'https://api.descope.com/oauth2/v1/apps/token';
const MAX_TOKEN_LENGTH = 16 * 1024;
const MAX_JWKS_LENGTH = 64 * 1024;
const MAX_DISCOVERY_LENGTH = 64 * 1024;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MCP_RESOURCE = 'https://www.aqprompts.com/api/mcp';
const ALLOWED_ALGORITHMS = new Set(['RS256', 'ES256']);
const jwksCache = new Map();
const jwksRequests = new Map();
const discoveryCache = new Map();
const discoveryRequests = new Map();

export class InvalidMcpTokenError extends Error {
  constructor(reasonCode = 'jwt_invalid') {
    super('Invalid MCP access token.');
    this.name = 'InvalidMcpTokenError';
    this.reasonCode = reasonCode;
  }
}

export class McpOAuthConfigurationError extends Error {
  constructor(message, reasonCode = 'oauth_configuration_invalid') {
    super(message);
    this.name = 'McpOAuthConfigurationError';
    this.reasonCode = reasonCode;
  }
}

export class McpJwksUnavailableError extends Error {
  constructor(reasonCode = 'jwks_unavailable') {
    super('The MCP OAuth signing keys could not be retrieved.');
    this.name = 'McpJwksUnavailableError';
    this.reasonCode = reasonCode;
  }
}

export class McpOAuthMetadataUnavailableError extends Error {
  constructor(reasonCode = 'discovery_metadata_unavailable') {
    super('The MCP OAuth discovery metadata could not be retrieved.');
    this.name = 'McpOAuthMetadataUnavailableError';
    this.reasonCode = reasonCode;
  }
}

export function isDescopeOAuthEnabled() {
  return ['preview', 'production'].includes(process.env.VERCEL_ENV)
    && process.env[OAUTH_PROVIDER_ENV] === 'descope';
}

export function isDescopePreviewOAuthEnabled() {
  return process.env.VERCEL_ENV === 'preview' && isDescopeOAuthEnabled();
}

function isHttpsUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function isSafeHttpsEndpoint(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

function getMcpResourceConfiguration() {
  const resource = process.env[RESOURCE_URI_ENV] || DEFAULT_MCP_RESOURCE;
  let url;
  try {
    url = new URL(resource);
  } catch {
    throw new McpOAuthConfigurationError(
      'The MCP resource URI must be a canonical HTTPS URL.',
      'resource_uri_invalid',
    );
  }

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/api/mcp'
    || url.search
    || url.hash
  ) {
    throw new McpOAuthConfigurationError(
      'The MCP resource URI must be a canonical HTTPS URL ending in /api/mcp.',
      'resource_uri_invalid',
    );
  }

  return {
    resource: url.toString(),
    protectedResourceMetadataUrl: new URL(
      '/.well-known/oauth-protected-resource/api/mcp',
      url.origin,
    ).toString(),
  };
}

function getOAuthConfiguration() {
  const issuer = process.env[ISSUER_ENV];
  const jwksUrl = process.env[JWKS_URL_ENV];
  const signingAlgorithm = process.env[SIGNING_ALGORITHM_ENV];
  const clientId = process.env[CLIENT_ID_ENV];
  const descopeClientId = process.env[DESCOPE_CLIENT_ID_ENV];

  if (!isHttpsUrl(issuer)) {
    throw new McpOAuthConfigurationError(
      'MCP OAuth issuer, JWKS URL, and a supported signing algorithm must be configured.',
      'issuer_configuration_invalid',
    );
  }
  if (!isHttpsUrl(jwksUrl)) {
    throw new McpOAuthConfigurationError(
      'MCP OAuth issuer, JWKS URL, and a supported signing algorithm must be configured.',
      'jwks_configuration_invalid',
    );
  }
  if (!ALLOWED_ALGORITHMS.has(signingAlgorithm)) {
    throw new McpOAuthConfigurationError(
      'MCP OAuth issuer, JWKS URL, and a supported signing algorithm must be configured.',
      'signing_algorithm_unsupported',
    );
  }
  if (!clientId && !isDescopeOAuthEnabled()) {
    throw new McpOAuthConfigurationError(
      'MCP OAuth issuer, JWKS URL, and a supported signing algorithm must be configured.',
      'client_id_configuration_missing',
    );
  }
  if (isDescopeOAuthEnabled() && !descopeClientId) {
    throw new McpOAuthConfigurationError(
      'The Descope OAuth application client ID must be configured.',
      'descope_client_id_configuration_missing',
    );
  }

  return {
    issuer,
    jwksUrl,
    signingAlgorithm,
    clientId,
    descopeClientId,
    ...getMcpResourceConfiguration(),
  };
}

async function downloadOAuthDiscovery(discoveryUrl, expectedIssuer, expectedJwksUrl) {
  let response;
  try {
    response = await fetch(discoveryUrl, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    const reasonCode = error?.name === 'TimeoutError'
      ? 'discovery_fetch_timeout'
      : 'discovery_fetch_failed';
    throw new McpOAuthMetadataUnavailableError(reasonCode);
  }

  if (!response.ok) throw new McpOAuthMetadataUnavailableError('discovery_http_error');
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_DISCOVERY_LENGTH) {
    throw new McpOAuthMetadataUnavailableError('discovery_response_too_large');
  }

  let text;
  try {
    if (!response.body) {
      throw new McpOAuthMetadataUnavailableError('discovery_response_body_missing');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let byteLength = 0;
    let done = false;
    while (!done) {
      const next = await reader.read();
      done = next.done;
      if (done) continue;
      byteLength += next.value.byteLength;
      if (byteLength > MAX_DISCOVERY_LENGTH) {
        await reader.cancel();
        throw new McpOAuthMetadataUnavailableError('discovery_response_too_large');
      }
      chunks.push(next.value);
    }
    text = new TextDecoder().decode(Buffer.concat(chunks));
  } catch (error) {
    if (error instanceof McpOAuthMetadataUnavailableError) throw error;
    throw new McpOAuthMetadataUnavailableError('discovery_response_read_failed');
  }

  let metadata;
  try {
    metadata = JSON.parse(text);
  } catch {
    throw new McpOAuthMetadataUnavailableError('discovery_json_invalid');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new McpOAuthMetadataUnavailableError('discovery_document_invalid');
  }
  if (metadata.issuer !== expectedIssuer) {
    throw new McpOAuthMetadataUnavailableError('discovery_issuer_mismatch');
  }
  if (
    !isSafeHttpsEndpoint(metadata.authorization_endpoint)
    || new URL(metadata.authorization_endpoint).toString() !== DESCOPE_AUTHORIZATION_ENDPOINT
  ) {
    throw new McpOAuthMetadataUnavailableError('discovery_authorization_endpoint_mismatch');
  }
  if (
    !isSafeHttpsEndpoint(metadata.token_endpoint)
    || new URL(metadata.token_endpoint).toString() !== DESCOPE_TOKEN_ENDPOINT
  ) {
    throw new McpOAuthMetadataUnavailableError('discovery_token_endpoint_mismatch');
  }
  if (!Array.isArray(metadata.response_types_supported)
    || !metadata.response_types_supported.includes('code')) {
    throw new McpOAuthMetadataUnavailableError('discovery_authorization_code_unsupported');
  }
  if (
    !Array.isArray(metadata.code_challenge_methods_supported)
    || !metadata.code_challenge_methods_supported.includes('S256')
  ) {
    throw new McpOAuthMetadataUnavailableError('discovery_pkce_s256_unsupported');
  }
  if (!isHttpsUrl(metadata.jwks_uri)) {
    throw new McpOAuthMetadataUnavailableError('discovery_jwks_uri_invalid');
  }
  if (new URL(metadata.jwks_uri).toString() !== new URL(expectedJwksUrl).toString()) {
    throw new McpOAuthMetadataUnavailableError('discovery_jwks_uri_mismatch');
  }

  return {
    issuer: metadata.issuer,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    jwksUrl: metadata.jwks_uri,
  };
}

async function getOAuthDiscovery(discoveryUrl, issuer, jwksUrl, { refresh = false } = {}) {
  const cacheKey = `${discoveryUrl}\n${issuer}\n${jwksUrl}`;
  const cached = discoveryCache.get(cacheKey);
  if (!refresh && cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.metadata;
  }

  if (discoveryRequests.has(cacheKey)) return discoveryRequests.get(cacheKey);
  const request = downloadOAuthDiscovery(discoveryUrl, issuer, jwksUrl)
    .then((metadata) => {
      discoveryCache.set(cacheKey, { metadata, fetchedAt: Date.now() });
      return metadata;
    })
    .finally(() => {
      discoveryRequests.delete(cacheKey);
    });
  discoveryRequests.set(cacheKey, request);
  return request;
}

export async function getMcpOAuthServerMetadata() {
  const { issuer, jwksUrl } = getOAuthConfiguration();
  const discoveryUrl = process.env[OAUTH_DISCOVERY_URL_ENV];
  if (!isHttpsUrl(discoveryUrl)) {
    throw new McpOAuthConfigurationError(
      'The MCP OAuth discovery URL must be configured as an HTTPS URL.',
      'discovery_url_invalid',
    );
  }
  return getOAuthDiscovery(discoveryUrl, issuer, jwksUrl);
}

function parseBearerToken(request) {
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match || match[1].length > MAX_TOKEN_LENGTH) return null;
  return match[1];
}

function decodeJwtPart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) {
    throw new InvalidMcpTokenError('jwt_encoding_invalid');
  }
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidMcpTokenError('jwt_encoding_invalid');
  }
}

function validateJwk(jwk, alg, kid) {
  if (
    !jwk
    || typeof jwk !== 'object'
    || jwk.kid !== kid
    || (jwk.use !== undefined && jwk.use !== 'sig')
    || (jwk.alg !== undefined && jwk.alg !== alg)
    || (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes('verify')))
    || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some((name) => name in jwk)
  ) {
    throw new InvalidMcpTokenError('jwks_key_invalid');
  }

  if (alg === 'RS256') {
    if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') {
      throw new InvalidMcpTokenError('jwks_key_invalid');
    }
    if (Buffer.from(jwk.n, 'base64url').length < 256) {
      throw new InvalidMcpTokenError('jwks_key_invalid');
    }
  } else if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
    throw new InvalidMcpTokenError('jwks_key_invalid');
  }

  try {
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    throw new InvalidMcpTokenError('jwks_key_invalid');
  }
}

async function downloadJwks(jwksUrl) {
  let response;
  try {
    response = await fetch(jwksUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new McpJwksUnavailableError();
  }

  if (!response.ok) throw new McpJwksUnavailableError();
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_JWKS_LENGTH) {
    throw new McpJwksUnavailableError();
  }

  let text;
  try {
    if (!response.body) throw new McpJwksUnavailableError();
    const reader = response.body.getReader();
    const chunks = [];
    let byteLength = 0;
    let done = false;
    while (!done) {
      const next = await reader.read();
      done = next.done;
      if (done) continue;
      const { value } = next;
      byteLength += value.byteLength;
      if (byteLength > MAX_JWKS_LENGTH) {
        await reader.cancel();
        throw new McpJwksUnavailableError();
      }
      chunks.push(value);
    }
    text = new TextDecoder().decode(Buffer.concat(chunks));
  } catch (error) {
    if (error instanceof McpJwksUnavailableError) throw error;
    throw new McpJwksUnavailableError();
  }

  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new McpJwksUnavailableError();
  }
  if (!document || !Array.isArray(document.keys)) throw new McpJwksUnavailableError();

  const entry = { keys: document.keys, fetchedAt: Date.now() };
  jwksCache.set(jwksUrl, entry);
  return entry.keys;
}

async function getJwks(jwksUrl, { refresh = false } = {}) {
  const cached = jwksCache.get(jwksUrl);
  if (!refresh && cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys;
  }

  if (jwksRequests.has(jwksUrl)) return jwksRequests.get(jwksUrl);

  const request = downloadJwks(jwksUrl).finally(() => {
    jwksRequests.delete(jwksUrl);
  });
  jwksRequests.set(jwksUrl, request);
  return request;
}

async function getVerificationKey(jwksUrl, alg, kid) {
  let keys = await getJwks(jwksUrl);
  let matchingKeys = keys.filter((key) => key?.kid === kid);

  if (matchingKeys.length === 0) {
    keys = await getJwks(jwksUrl, { refresh: true });
    matchingKeys = keys.filter((key) => key?.kid === kid);
  }
  if (matchingKeys.length !== 1) {
    throw new InvalidMcpTokenError('jwks_key_not_found');
  }
  return validateJwk(matchingKeys[0], alg, kid);
}

async function verifySignedMcpJwt(token) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    throw new InvalidMcpTokenError('jwt_size_invalid');
  }

  const parts = token.split('.');
  if (parts.length !== 3) throw new InvalidMcpTokenError('jwt_structure_invalid');

  const {
    issuer,
    jwksUrl,
    signingAlgorithm,
    clientId,
    resource,
  } = getOAuthConfiguration();
  if (isDescopeOAuthEnabled()) await getMcpOAuthServerMetadata();
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (
    !header
    || typeof header !== 'object'
    || Array.isArray(header)
    || !ALLOWED_ALGORITHMS.has(header.alg)
    || header.alg !== signingAlgorithm
    || typeof header.kid !== 'string'
    || header.kid.length === 0
    || header.crit !== undefined
    || !claims
    || typeof claims !== 'object'
    || Array.isArray(claims)
  ) {
    if (isDescopePreviewOAuthEnabled()) {
      console.warn('[MCP OAuth] Preview JWT header/payload rejected:', {
        alg: header?.alg === 'RS256' || header?.alg === 'ES256' ? header.alg : 'other',
        kidPresent: typeof header?.kid === 'string' && header.kid.length > 0,
        critPresent: header?.crit !== undefined,
        headerObject: Boolean(header && typeof header === 'object' && !Array.isArray(header)),
        payloadObject: Boolean(claims && typeof claims === 'object' && !Array.isArray(claims)),
        configuredAlgorithm: ALLOWED_ALGORITHMS.has(signingAlgorithm) ? signingAlgorithm : 'other',
      });
    }
    throw new InvalidMcpTokenError('jwt_header_or_payload_invalid');
  }

  const key = await getVerificationKey(jwksUrl, header.alg, header.kid);
  const signature = Buffer.from(parts[2], 'base64url');
  if (
    (header.alg === 'ES256' && signature.length !== 64)
    || !crypto.verify(
      header.alg === 'RS256' ? 'RSA-SHA256' : 'sha256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      header.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key,
      signature,
    )
  ) {
    throw new InvalidMcpTokenError('jwt_signature_invalid');
  }

  return {
    config: { issuer, resource, clientId },
    header,
    claims,
  };
}

export async function verifyDescopeIdentityToken(token) {
  const {
    issuer,
    jwksUrl,
    signingAlgorithm,
    descopeClientId,
  } = getOAuthConfiguration();
  if (!descopeClientId) {
    throw new McpOAuthConfigurationError(
      'The Descope OAuth application client ID must be configured.',
      'descope_client_id_configuration_missing',
    );
  }
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    throw new InvalidMcpTokenError('jwt_size_invalid');
  }
  const parts = token.split('.');
  if (parts.length !== 3) throw new InvalidMcpTokenError('jwt_structure_invalid');

  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (
    !header
    || typeof header !== 'object'
    || Array.isArray(header)
    || !ALLOWED_ALGORITHMS.has(header.alg)
    || header.alg !== signingAlgorithm
    || typeof header.kid !== 'string'
    || header.kid.length === 0
    || header.crit !== undefined
    || !claims
    || typeof claims !== 'object'
    || Array.isArray(claims)
  ) {
    throw new InvalidMcpTokenError('jwt_header_or_payload_invalid');
  }

  const key = await getVerificationKey(jwksUrl, header.alg, header.kid);
  const signature = Buffer.from(parts[2], 'base64url');
  if (
    (header.alg === 'ES256' && signature.length !== 64)
    || !crypto.verify(
      header.alg === 'RS256' ? 'RSA-SHA256' : 'sha256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      header.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key,
      signature,
    )
  ) {
    throw new InvalidMcpTokenError('jwt_signature_invalid');
  }

  const now = Math.floor(Date.now() / 1000);
  const audienceMatches = claims.aud === descopeClientId
    || (Array.isArray(claims.aud) && claims.aud.includes(descopeClientId));
  if (claims.iss !== issuer) throw new InvalidMcpTokenError('issuer_mismatch');
  if (
    !audienceMatches
    || (claims.azp !== undefined && claims.azp !== descopeClientId)
    || (Array.isArray(claims.aud)
      && claims.aud.length > 1
      && claims.azp !== descopeClientId)
  ) {
    throw new InvalidMcpTokenError('client_binding_mismatch');
  }
  if (
    typeof claims.sub !== 'string'
    || claims.sub.length > 255
    || claims.sub !== claims.sub.trim()
    || claims.sub.length === 0
  ) {
    throw new InvalidMcpTokenError('subject_invalid');
  }
  if (
    typeof claims.exp !== 'number'
    || !Number.isFinite(claims.exp)
    || claims.exp <= now
  ) {
    throw new InvalidMcpTokenError('expiration_invalid');
  }
  if (claims.nbf !== undefined && (
    typeof claims.nbf !== 'number'
    || !Number.isFinite(claims.nbf)
    || claims.nbf > now
  )) {
    throw new InvalidMcpTokenError('token_not_yet_valid');
  }

  return claims;
}

function hasExpectedAudience(aud, resource) {
  return aud === resource || (Array.isArray(aud) && aud.includes(resource));
}

function safeDiagnosticString(value, maximumLength = 2048) {
  if (
    typeof value !== 'string'
    || value.length > maximumLength
    || [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return null;
  }
  return value;
}

function getDiagnosticAudience(audience) {
  if (typeof audience === 'string') return safeDiagnosticString(audience);
  if (!Array.isArray(audience) || audience.length > 8) return null;
  return audience.map((value) => safeDiagnosticString(value));
}

export async function getMcpOAuthClaimsDiagnostic(request) {
  const token = parseBearerToken(request);
  if (!token) throw new InvalidMcpTokenError();

  const { header, claims } = await verifySignedMcpJwt(token);
  return {
    iss: safeDiagnosticString(claims.iss),
    aud: getDiagnosticAudience(claims.aud),
    client_id: safeDiagnosticString(claims.client_id, 256),
    exp: Number.isSafeInteger(claims.exp) ? claims.exp : null,
    sub_present: typeof claims.sub === 'string' && claims.sub.trim().length > 0,
    alg: safeDiagnosticString(header.alg, 16),
    kid: safeDiagnosticString(header.kid, 256),
  };
}

export async function verifyMcpOAuthToken(token) {
  if (isDescopeOAuthEnabled()) {
    const {
      lookupMcpOAuthBrokerToken,
      McpOAuthBrokerTokenInvalidError,
      McpOAuthBrokerStoreUnavailableError,
    } = await import('./mcp-oauth-broker-db.js');
    try {
      return await lookupMcpOAuthBrokerToken(token);
    } catch (error) {
      if (error instanceof McpOAuthBrokerTokenInvalidError) {
        throw new InvalidMcpTokenError(error.reasonCode);
      }
      if (error instanceof McpOAuthBrokerStoreUnavailableError) {
        throw error;
      }
      throw error;
    }
  }

  const { config, claims } = await verifySignedMcpJwt(token);
  const { issuer, resource, clientId } = config;
  const now = Math.floor(Date.now() / 1000);
  const hasDescopeClientBinding = isDescopeOAuthEnabled()
    && claims.client_id === undefined
    && hasExpectedAudience(claims.aud, clientId);
  if (claims.iss !== issuer) throw new InvalidMcpTokenError('issuer_mismatch');
  if (!hasExpectedAudience(claims.aud, resource)) {
    throw new InvalidMcpTokenError('audience_mismatch');
  }
  if (
    typeof claims.sub !== 'string'
    || claims.sub.length > 255
    || claims.sub !== claims.sub.trim()
    || claims.sub.trim().length === 0
  ) {
    throw new InvalidMcpTokenError('subject_invalid');
  }
  if (claims.client_id !== clientId && !hasDescopeClientBinding) {
    throw new InvalidMcpTokenError('client_binding_mismatch');
  }
  if (
    typeof claims.exp !== 'number'
    || !Number.isFinite(claims.exp)
    || claims.exp <= now
  ) {
    throw new InvalidMcpTokenError('expiration_invalid');
  }
  if (claims.nbf !== undefined && (
    typeof claims.nbf !== 'number'
    || !Number.isFinite(claims.nbf)
    || claims.nbf > now
  )) {
    throw new InvalidMcpTokenError('token_not_yet_valid');
  }

  return {
    type: 'oauth',
    subject: claims.sub,
    clientId,
  };
}

export async function authenticateMcpRequest(request) {
  const token = parseBearerToken(request);
  if (!token) return { ok: false, status: 401, reasonCode: 'bearer_missing_or_invalid' };

  if (!isDescopeOAuthEnabled() && token.split('.').length !== 3) {
    return { ok: false, status: 401, reasonCode: 'bearer_not_jwt' };
  }

  try {
    return { ok: true, authentication: await verifyMcpOAuthToken(token) };
  } catch (error) {
    if (error instanceof InvalidMcpTokenError) {
      return { ok: false, status: 401, reasonCode: error.reasonCode };
    }
    if (
      error instanceof McpOAuthConfigurationError
      || error instanceof McpJwksUnavailableError
      || error instanceof McpOAuthMetadataUnavailableError
      || error?.code === 'MCP_OAUTH_BROKER_STORE_UNAVAILABLE'
    ) {
      return {
        ok: false,
        status: 503,
        reasonCode: error.reasonCode || 'oauth_authentication_unavailable',
      };
    }
    throw error;
  }
}

export function getMcpProtectedResourceMetadata() {
  const { issuer, resource } = getOAuthConfiguration();
  return {
    resource,
    authorization_servers: [isDescopeOAuthEnabled() ? new URL(resource).origin : issuer],
    ...(isDescopeOAuthEnabled()
      ? { scopes_supported: ['openid', 'profile', 'email'] }
      : {}),
  };
}

export function getMcpAuthorizationServerMetadata() {
  const { resource } = getOAuthConfiguration();
  const issuer = new URL(resource).origin;
  return {
    issuer,
    authorization_endpoint: new URL('/authorize', issuer).toString(),
    token_endpoint: new URL('/oauth/token', issuer).toString(),
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    ...(isDescopeOAuthEnabled()
      ? { registration_endpoint: new URL('/oauth/register', issuer).toString() }
      : {}),
  };
}

export function getMcpResourceMetadataResource() {
  return getMcpResourceConfiguration().resource;
}

export function getMcpOAuthChallenge() {
  const { protectedResourceMetadataUrl } = getMcpResourceConfiguration();
  return `Bearer resource_metadata="${protectedResourceMetadataUrl}"`;
}
