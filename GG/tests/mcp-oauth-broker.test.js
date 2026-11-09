import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';

import { GET as getAuthorizationServerMetadata } from '../app/.well-known/oauth-authorization-server/route.js';
import { GET as getProtectedResourceMetadata } from '../app/.well-known/oauth-protected-resource/api/mcp/route.js';
import { POST as registerClient } from '../app/oauth/register/route.js';
import { POST as exchangeToken } from '../app/oauth/token/route.js';
import { authenticateMcpRequest } from '../src/lib/mcp-auth.js';
import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import {
  isMcpOAuthRefreshEnabled,
  listRecentUnlinkedMcpOAuthSubjects,
} from '../src/lib/mcp-oauth-broker-db.js';

const RESOURCE = 'https://www.aqprompts.com/api/mcp';
const ISSUER = 'https://oauth.example.test/descope-app';
const DISCOVERY_URL = 'https://oauth.example.test/isolated-descope-discovery';
const JWKS_URL = 'https://oauth.example.test/isolated-descope-jwks';
const TOKEN_ENDPOINT = 'https://api.descope.com/oauth2/v1/apps/token';
const AUTHORIZATION_ENDPOINT = 'https://api.descope.com/oauth2/v1/apps/authorize';
const CLAUDE_CLIENT_ID = `aqmc_${'A'.repeat(32)}`;
const DESCOPE_CLIENT_ID = 'isolated-descope-application-client';
const DESCOPE_CLIENT_SECRET = 'isolated-descope-secret-value';
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const privateKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...privateKey.publicKey.export({ format: 'jwk' }),
  kid: 'isolated-descope-signing-key',
  use: 'sig',
  alg: 'RS256',
};
const previousEnvironment = {};
const brokerTokens = new Map();
const brokerRefreshTokens = new Map();
const registeredClients = new Map();
const databaseCalls = [];
let previousFetch;
let previousPool;
let providerStatus = 200;
let databaseUnavailable = false;
let providerRequest;

function createIdentityToken(claimOverrides = {}) {
  const header = Buffer.from(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT',
    kid: publicJwk.kid,
  })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: ISSUER,
    aud: DESCOPE_CLIENT_ID,
    sub: 'isolated-oauth-subject',
    exp: Math.floor(Date.now() / 1000) + 300,
    ...claimOverrides,
  })).toString('base64url');
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey.privateKey);
  return `${unsigned}.${signature.toString('base64url')}`;
}

function authorizationCodeRequest(overrides = {}) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLAUDE_CLIENT_ID,
    code: 'synthetic-authorization-code-123456789',
    redirect_uri: REDIRECT_URI,
    code_verifier: 'A'.repeat(43),
    resource: RESOURCE,
    ...overrides,
  });
  return new Request('https://www.aqprompts.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
}

function registrationRequest(overrides = {}) {
  return new Request('https://www.aqprompts.com/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Isolated Claude client',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...overrides,
    }),
  });
}

function tokenRequest(values) {
  return new Request('https://www.aqprompts.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });
}

before(() => {
  const names = [
    'AQ_MCP_OAUTH_ISSUER',
    'AQ_MCP_OAUTH_JWKS_URL',
    'AQ_MCP_OAUTH_SIGNING_ALGORITHM',
    'AQ_MCP_OAUTH_CLIENT_ID',
    'AQ_MCP_DESCOPE_CLIENT_ID',
    'AQ_MCP_DESCOPE_CLIENT_SECRET',
    'AQ_MCP_RESOURCE_URI',
    'AQ_MCP_OAUTH_PROVIDER',
    'AQ_MCP_OAUTH_DISCOVERY_URL',
    'VERCEL_ENV',
    'DATABASE_URL',
  ];
  for (const name of names) previousEnvironment[name] = process.env[name];
  previousFetch = globalThis.fetch;
  previousPool = globalThis.__dbPgPool;

  process.env.AQ_MCP_OAUTH_ISSUER = ISSUER;
  process.env.AQ_MCP_OAUTH_JWKS_URL = JWKS_URL;
  process.env.AQ_MCP_OAUTH_SIGNING_ALGORITHM = 'RS256';
  delete process.env.AQ_MCP_OAUTH_CLIENT_ID;
  process.env.AQ_MCP_DESCOPE_CLIENT_ID = DESCOPE_CLIENT_ID;
  process.env.AQ_MCP_DESCOPE_CLIENT_SECRET = DESCOPE_CLIENT_SECRET;
  process.env.AQ_MCP_RESOURCE_URI = RESOURCE;
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  process.env.AQ_MCP_OAUTH_DISCOVERY_URL = DISCOVERY_URL;
  process.env.VERCEL_ENV = 'preview';
  process.env.DATABASE_URL = 'postgres://localhost/mcp_oauth_broker_test';
  registeredClients.clear();
  brokerTokens.clear();
  brokerRefreshTokens.clear();
  registeredClients.set(CLAUDE_CLIENT_ID, {
    clientId: CLAUDE_CLIENT_ID,
    clientName: 'Isolated Claude client',
    redirectUri: REDIRECT_URI,
    refreshEnabled: true,
  });

  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: Number.parseInt(process.env.PG_POOL_MAX || '', 10)
      || (isBuildPhase() ? 1 : 5),
    async query(query, values = []) {
      const sql = typeof query === 'string' ? query : query.text;
      databaseCalls.push({ sql, values });
      if (/INSERT INTO mcp_oauth_clients/.test(sql)) {
        registeredClients.set(values[0], {
          clientId: values[0],
          clientName: values[1],
          redirectUri: values[2],
          refreshEnabled: values[3],
        });
        return { rowCount: 1, rows: [] };
      }
      if (/SELECT client_id\s+FROM mcp_oauth_clients/.test(sql)) {
        const client = registeredClients.get(values[0]);
        const requiresRefresh = /refresh_enabled = TRUE/.test(sql);
        return client?.redirectUri === values[1] && (!requiresRefresh || client.refreshEnabled)
          ? { rowCount: 1, rows: [{ client_id: values[0] }] }
          : { rowCount: 0, rows: [] };
      }
      if (/SELECT client_id AS "clientId"/.test(sql)) {
        return {
          rowCount: registeredClients.size,
          rows: [...registeredClients.values()].map((client) => ({
            clientId: client.clientId,
            clientName: client.clientName,
            registeredAt: '2026-01-01T00:00:00.000Z',
          })),
        };
      }
      if (databaseUnavailable) throw new Error('isolated database failure');
      if (/WITH recent_subjects AS/.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            subject: 'isolated-oauth-subject',
            clientId: CLAUDE_CLIENT_ID,
            clientName: 'Isolated Claude client',
            lastAuthenticatedAt: '2026-10-19T18:00:00.000Z',
          }],
        };
      }
      if (/WITH consumed AS/.test(sql) && /DELETE FROM mcp_oauth_broker_refresh_tokens/.test(sql)) {
        const consumed = brokerRefreshTokens.get(values[0]);
        const client = registeredClients.get(values[1]);
        const usable = consumed
          && consumed.expiresAt > Date.now()
          && consumed.clientId === values[1]
          && consumed.resource === values[5]
          && client?.redirectUri === values[2]
          && client.refreshEnabled;
        if (!usable) return { rowCount: 0, rows: [] };
        brokerRefreshTokens.delete(values[0]);
        brokerTokens.set(values[3], {
          subject: consumed.subject,
          clientId: consumed.clientId,
          resource: consumed.resource,
          expiresAt: Date.now() + values[6] * 1000,
        });
        brokerRefreshTokens.set(values[4], {
          subject: consumed.subject,
          clientId: consumed.clientId,
          resource: consumed.resource,
          expiresAt: Date.now() + values[7] * 1000,
        });
        return {
          rowCount: 1,
          rows: [{
            subject: consumed.subject,
            clientId: consumed.clientId,
            resource: consumed.resource,
          }],
        };
      }
      if (/INSERT INTO mcp_oauth_broker_refresh_tokens/.test(sql)) {
        brokerRefreshTokens.set(values[0], {
          subject: values[1],
          clientId: values[2],
          resource: values[3],
          expiresAt: Date.now() + values[4] * 1000,
        });
        return { rowCount: 1, rows: [] };
      }
      if (/WITH expired_tokens AS/.test(sql) && /INSERT INTO mcp_oauth_broker_tokens/.test(sql)) {
        brokerTokens.set(values[0], {
          subject: values[1],
          clientId: values[2],
          resource: values[3],
          expiresAt: Date.now() + values[4] * 1000,
        });
        return { rowCount: 1, rows: [] };
      }
      if (/FROM mcp_oauth_broker_tokens/.test(sql)) {
        const token = brokerTokens.get(values[0]);
        return token && token.expiresAt > Date.now() && registeredClients.has(token.clientId)
          ? { rowCount: 1, rows: [{ ...token }] }
          : { rowCount: 0, rows: [] };
      }
      if (/INSERT INTO mcp_oauth_broker_tokens/.test(sql)) {
        brokerTokens.set(values[0], {
          subject: values[1],
          clientId: values[2],
          resource: values[3],
          expiresAt: Date.now() + values[4] * 1000,
        });
        return { rowCount: 1, rows: [] };
      }
      throw new Error('Unexpected isolated database query.');
    },
  };

  globalThis.fetch = async (url, options = {}) => {
    if (url === DISCOVERY_URL) {
      return Response.json({
        issuer: ISSUER,
        authorization_endpoint: AUTHORIZATION_ENDPOINT,
        token_endpoint: TOKEN_ENDPOINT,
        jwks_uri: JWKS_URL,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (url === JWKS_URL) return Response.json({ keys: [publicJwk] });
    if (url === TOKEN_ENDPOINT) {
      providerRequest = options;
      if (providerStatus !== 200) {
        return Response.json({ error: 'provider error details are not forwarded' }, {
          status: providerStatus,
        });
      }
      return Response.json({
        access_token: 'isolated-provider-access-token',
        id_token: createIdentityToken(),
        expires_in: 300,
      });
    }
    throw new Error('Unexpected external request in isolated broker test.');
  };
});

after(() => {
  globalThis.fetch = previousFetch;
  if (previousPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = previousPool;
  for (const [name, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('AQ authorization-server metadata advertises the first-party public-client PKCE flow', async () => {
  const response = getAuthorizationServerMetadata();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    issuer: 'https://www.aqprompts.com',
    authorization_endpoint: 'https://www.aqprompts.com/authorize',
    token_endpoint: 'https://www.aqprompts.com/oauth/token',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    registration_endpoint: 'https://www.aqprompts.com/oauth/register',
  });
  const resourceResponse = await getProtectedResourceMetadata();
  assert.deepEqual(await resourceResponse.json(), {
    resource: RESOURCE,
    authorization_servers: ['https://www.aqprompts.com'],
    scopes_supported: ['openid', 'profile', 'email'],
  });
});

test('recent unlinked subject lookup returns only verified subject and registered client metadata', async () => {
  databaseCalls.length = 0;
  const subjects = await listRecentUnlinkedMcpOAuthSubjects(RESOURCE);

  assert.deepEqual(subjects, [{
    subject: 'isolated-oauth-subject',
    clientId: CLAUDE_CLIENT_ID,
    clientName: 'Isolated Claude client',
    lastAuthenticatedAt: '2026-10-19T18:00:00.000Z',
  }]);
  assert.equal(databaseCalls.length, 1);
  assert.deepEqual(databaseCalls[0].values, [RESOURCE]);
  assert.match(databaseCalls[0].sql, /token\.created_at >= NOW\(\) - INTERVAL '24 hours'/);
  assert.match(databaseCalls[0].sql, /mcp_oauth_authorizations/);
  assert.match(databaseCalls[0].sql, /LIMIT 100/);
  assert.doesNotMatch(databaseCalls[0].sql, /SELECT[^;]*token_hash/i);
  await assert.rejects(
    listRecentUnlinkedMcpOAuthSubjects(''),
    /resource is invalid/,
  );
});

test('Claude client registration accepts the supported callback and code plus refresh grants', async () => {
  const refreshRegistrationResponse = await registerClient(registrationRequest({
    grant_types: ['authorization_code', 'refresh_token'],
  }));
  assert.equal(refreshRegistrationResponse.status, 201);
  const refreshRegistration = await refreshRegistrationResponse.json();
  assert.deepEqual(refreshRegistration.grant_types, ['authorization_code', 'refresh_token']);
  assert.equal(registeredClients.get(refreshRegistration.client_id).refreshEnabled, true);

  const response = await registerClient(registrationRequest());
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const registration = await response.json();
  assert.match(registration.client_id, /^aqmc_[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(registration.redirect_uris, [REDIRECT_URI]);
  assert.equal(registration.token_endpoint_auth_method, 'none');
  assert.equal(registeredClients.get(registration.client_id).redirectUri, REDIRECT_URI);
  assert.equal(registeredClients.get(registration.client_id).refreshEnabled, false);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...values) => warnings.push(values.join(' '));
  try {
    const invalidRequests = [
      registrationRequest({ redirect_uris: ['https://attacker.example/callback'] }),
      registrationRequest({ grant_types: ['client_credentials'] }),
      registrationRequest({ grant_types: ['refresh_token'] }),
      registrationRequest({ grant_types: ['authorization_code', 'authorization_code'] }),
      registrationRequest({ response_types: ['token'] }),
      registrationRequest({ token_endpoint_auth_method: 'client_secret_basic' }),
    ];
    for (const invalidRequest of invalidRequests) {
      assert.equal((await registerClient(invalidRequest)).status, 400);
    }

    const invalidContentType = new Request('https://www.aqprompts.com/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/jsonp' },
      body: JSON.stringify({ redirect_uris: [REDIRECT_URI] }),
    });
    assert.equal((await registerClient(invalidContentType)).status, 400);
    assert.deepEqual(warnings, [
      '[MCP OAuth] Client registration rejected: redirect_uri_unsupported',
      '[MCP OAuth] Client registration rejected: grant_types_unsupported',
      '[MCP OAuth] Client registration rejected: grant_types_unsupported',
      '[MCP OAuth] Client registration rejected: grant_types_unsupported',
      '[MCP OAuth] Client registration rejected: response_types_unsupported',
      '[MCP OAuth] Client registration rejected: token_auth_method_unsupported',
      '[MCP OAuth] Client registration rejected: content_type_invalid',
    ]);
    assert.equal(warnings.join(' ').includes('attacker.example'), false);
  } finally {
    console.warn = originalWarn;
  }

  const previousProvider = process.env.AQ_MCP_OAUTH_PROVIDER;
  process.env.AQ_MCP_OAUTH_PROVIDER = 'supabase';
  try {
    assert.equal((await registerClient(registrationRequest())).status, 404);
  } finally {
    if (previousProvider === undefined) delete process.env.AQ_MCP_OAUTH_PROVIDER;
    else process.env.AQ_MCP_OAUTH_PROVIDER = previousProvider;
  }
});

test('authorization-server metadata fails explicitly when OAuth configuration is incomplete', async () => {
  const previousClientId = process.env.AQ_MCP_DESCOPE_CLIENT_ID;
  delete process.env.AQ_MCP_DESCOPE_CLIENT_ID;
  try {
    const response = getAuthorizationServerMetadata();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'MCP OAuth metadata is not configured.',
    });
  } finally {
    if (previousClientId === undefined) delete process.env.AQ_MCP_DESCOPE_CLIENT_ID;
    else process.env.AQ_MCP_DESCOPE_CLIENT_ID = previousClientId;
  }
});

test('Claude code exchange verifies Descope identity and returns a stored opaque token', async () => {
  const response = await exchangeToken(authorizationCodeRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const issued = await response.json();
  assert.equal(issued.token_type, 'Bearer');
  assert.equal(issued.expires_in, 300);
  assert.equal(issued.access_token.includes('.'), false);
  assert.equal(typeof issued.refresh_token, 'string');
  assert.equal(JSON.stringify(issued).includes(DESCOPE_CLIENT_SECRET), false);

  assert.equal(providerRequest.method, 'POST');
  assert.equal(providerRequest.redirect, 'error');
  const encodeCredential = (credential) => new URLSearchParams({ credential })
    .toString()
    .slice('credential='.length);
  const expectedBasic = Buffer.from(
    `${encodeCredential(DESCOPE_CLIENT_ID)}:${encodeCredential(DESCOPE_CLIENT_SECRET)}`,
  ).toString('base64');
  assert.equal(providerRequest.headers.authorization, `Basic ${expectedBasic}`);
  const providerForm = new URLSearchParams(providerRequest.body);
  assert.equal(providerForm.get('client_id'), null);
  assert.equal(providerForm.get('code_verifier'), 'A'.repeat(43));
  assert.equal(providerForm.get('redirect_uri'), REDIRECT_URI);

  const tokenHash = crypto.createHash('sha256').update(issued.access_token).digest('hex');
  assert.equal(brokerTokens.has(tokenHash), true);
  assert.equal(JSON.stringify([...brokerTokens.keys()]).includes(issued.access_token), false);
  const refreshTokenHash = crypto.createHash('sha256').update(issued.refresh_token).digest('hex');
  assert.equal(brokerRefreshTokens.has(refreshTokenHash), true);
  assert.equal(JSON.stringify([...brokerRefreshTokens.keys()]).includes(issued.refresh_token), false);

  const authentication = await authenticateMcpRequest(new Request(RESOURCE, {
    method: 'POST',
    headers: { authorization: `Bearer ${issued.access_token}` },
  }));
  assert.deepEqual(authentication, {
    ok: true,
    authentication: {
      type: 'oauth',
      subject: 'isolated-oauth-subject',
      clientId: CLAUDE_CLIENT_ID,
    },
  });

  process.env.AQ_MCP_OAUTH_CLIENT_ID = 'unrelated-static-client-id';
  const dynamicallyRegisteredClientToken = await authenticateMcpRequest(new Request(RESOURCE, {
    method: 'POST',
    headers: { authorization: `Bearer ${issued.access_token}` },
  }));
  assert.equal(dynamicallyRegisteredClientToken.ok, true);
  delete process.env.AQ_MCP_OAUTH_CLIENT_ID;

  process.env.AQ_MCP_RESOURCE_URI = 'https://other.example/api/mcp';
  const wrongResourceToken = await authenticateMcpRequest(new Request(RESOURCE, {
    method: 'POST',
    headers: { authorization: `Bearer ${issued.access_token}` },
  }));
  assert.equal(wrongResourceToken.status, 401);
  assert.equal(wrongResourceToken.reasonCode, 'audience_mismatch');
  process.env.AQ_MCP_RESOURCE_URI = RESOURCE;

  brokerTokens.get(tokenHash).expiresAt = Date.now() - 1;
  const expired = await authenticateMcpRequest(new Request(RESOURCE, {
    method: 'POST',
    headers: { authorization: `Bearer ${issued.access_token}` },
  }));
  assert.equal(expired.status, 401);
  assert.equal(expired.reasonCode, 'jwt_invalid');
});

test('refresh grants rotate hashed tokens once and remain bound to client and resource', async () => {
  assert.equal(await isMcpOAuthRefreshEnabled(CLAUDE_CLIENT_ID, REDIRECT_URI), true);
  const initial = await exchangeToken(authorizationCodeRequest());
  assert.equal(initial.status, 200, await initial.clone().text());
  const initialTokens = await initial.json();
  assert.equal(typeof initialTokens.refresh_token, 'string');
  const initialRefreshHash = crypto.createHash('sha256')
    .update(initialTokens.refresh_token)
    .digest('hex');
  assert.equal(brokerRefreshTokens.has(initialRefreshHash), true);
  const accessCount = brokerTokens.size;

  const response = await exchangeToken(tokenRequest({
    grant_type: 'refresh_token',
    client_id: CLAUDE_CLIENT_ID,
    refresh_token: initialTokens.refresh_token,
    resource: RESOURCE,
  }));
  assert.equal(response.status, 200, await response.clone().text());
  const rotated = await response.json();
  assert.equal(rotated.token_type, 'Bearer');
  assert.equal(rotated.expires_in, 3600);
  assert.equal(typeof rotated.refresh_token, 'string');
  assert.equal(brokerRefreshTokens.has(initialRefreshHash), false);
  assert.equal(brokerTokens.size, accessCount + 1);

  const replacementHash = crypto.createHash('sha256')
    .update(rotated.refresh_token)
    .digest('hex');
  assert.equal(brokerRefreshTokens.has(replacementHash), true);
  assert.equal(JSON.stringify([...brokerRefreshTokens.keys()]).includes(rotated.refresh_token), false);

  const replay = await exchangeToken(tokenRequest({
    grant_type: 'refresh_token',
    client_id: CLAUDE_CLIENT_ID,
    refresh_token: initialTokens.refresh_token,
    resource: RESOURCE,
  }));
  assert.equal(replay.status, 400);

  const wrongResource = await exchangeToken(tokenRequest({
    grant_type: 'refresh_token',
    client_id: CLAUDE_CLIENT_ID,
    refresh_token: rotated.refresh_token,
    resource: 'https://other.example/api/mcp',
  }));
  assert.equal(wrongResource.status, 400);
});

test('token exchange rejects an unregistered client or mismatched resource before contacting Descope', async () => {
  const before = databaseCalls.length;
  assert.equal((await exchangeToken(authorizationCodeRequest({
    client_id: 'unapproved-claude-client',
  }))).status, 401);
  assert.equal((await exchangeToken(authorizationCodeRequest({
    resource: 'https://other.example/api/mcp',
  }))).status, 400);
  assert.equal(databaseCalls.length, before + 1);
});

test('provider and token-store failures do not return credentials or success-shaped tokens', async () => {
  providerStatus = 503;
  const providerFailure = await exchangeToken(authorizationCodeRequest());
  providerStatus = 200;
  assert.equal(providerFailure.status, 503);
  assert.equal((await providerFailure.text()).includes(DESCOPE_CLIENT_SECRET), false);

  databaseUnavailable = true;
  const storageFailure = await exchangeToken(authorizationCodeRequest());
  assert.equal(storageFailure.status, 503);
  assert.deepEqual(await storageFailure.json(), { error: 'server_error' });

  const lookupFailure = await authenticateMcpRequest(new Request(RESOURCE, {
    method: 'POST',
    headers: { authorization: `Bearer ${'x'.repeat(48)}` },
  }));
  databaseUnavailable = false;
  assert.equal(lookupFailure.ok, false);
  assert.equal(lookupFailure.status, 503);
});
