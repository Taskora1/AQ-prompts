import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import { GET as getMcp, POST as postMcp } from '../app/api/mcp/route.js';
import { GET as getProtectedResourceMetadata } from '../app/.well-known/oauth-protected-resource/api/mcp/route.js';
import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import { consumeLoginToken } from '../src/lib/auth-store.js';
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from '../src/lib/admin-session-core.js';
import {
  authenticateMcpRequest,
  getMcpOAuthChallenge,
  getMcpProtectedResourceMetadata,
  verifyDescopeIdentityToken,
  verifyMcpOAuthToken,
} from '../src/lib/mcp-auth.js';

const RESOURCE = 'https://www.aqprompts.com/api/mcp';
const ISOLATED_RESOURCE = 'https://mcp-isolated.example.test/api/mcp';
const ISOLATED_METADATA_URL = 'https://mcp-isolated.example.test/.well-known/oauth-protected-resource/api/mcp';
const ISSUER = 'https://oauth.example.test/auth/v1';
const JWKS_URL = 'https://oauth.example.test/auth/v1/.well-known/jwks.json';
const DISCOVERY_URL = 'https://oauth.example.test/.well-known/openid-configuration';
const DESCOPE_AUTHORIZATION_ENDPOINT = 'https://api.descope.com/oauth2/v1/apps/authorize';
const DESCOPE_TOKEN_ENDPOINT = 'https://api.descope.com/oauth2/v1/apps/token';
const CLIENT_ID = 'isolated-test-client';
const DESCOPE_CLIENT_ID = 'isolated-descope-app-client';
const privateKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const keyId = 'isolated-test-signing-key';
const publicJwk = {
  ...privateKey.publicKey.export({ format: 'jwk' }),
  kid: keyId,
  use: 'sig',
  alg: 'RS256',
};
let originalFetch;
let originalIssuer;
let originalJwksUrl;
let originalSigningAlgorithm;
let originalClientId;
let originalDescopeClientId;
let originalResourceUri;
let originalVercelEnv;
let originalOAuthProvider;
let originalDiscoveryUrl;
let originalClaimsDiagnostic;
let originalApiKey;
let originalDatabaseUrl;
let originalPool;
let originalAuthSecret;
const databaseCalls = [];

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createToken(claimOverrides = {}, headerOverrides = {}) {
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: keyId, ...headerOverrides });
  const claims = encode({
    iss: ISSUER,
    sub: 'synthetic-user-123',
    aud: RESOURCE,
    client_id: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...claimOverrides,
  });
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey.privateKey);
  return `${unsigned}.${signature.toString('base64url')}`;
}

function bearerRequest(token, method = 'POST') {
  return new Request(RESOURCE, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
}

function claimsDiagnosticRequest(token) {
  return new Request(RESOURCE, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-aq-mcp-oauth-claims-diagnostic': 'true',
    },
  });
}

function captureEnvironment(names) {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnvironment(values) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

before(() => {
  originalFetch = globalThis.fetch;
  originalIssuer = process.env.AQ_MCP_OAUTH_ISSUER;
  originalJwksUrl = process.env.AQ_MCP_OAUTH_JWKS_URL;
  originalSigningAlgorithm = process.env.AQ_MCP_OAUTH_SIGNING_ALGORITHM;
  originalClientId = process.env.AQ_MCP_OAUTH_CLIENT_ID;
  originalDescopeClientId = process.env.AQ_MCP_DESCOPE_CLIENT_ID;
  originalResourceUri = process.env.AQ_MCP_RESOURCE_URI;
  originalVercelEnv = process.env.VERCEL_ENV;
  originalOAuthProvider = process.env.AQ_MCP_OAUTH_PROVIDER;
  originalDiscoveryUrl = process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  originalClaimsDiagnostic = process.env.AQ_MCP_OAUTH_CLAIMS_DIAGNOSTIC;
  originalApiKey = process.env.AQ_MCP_API_KEY;
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalPool = globalThis.__dbPgPool;
  originalAuthSecret = process.env.AUTH_SECRET;
  process.env.AQ_MCP_OAUTH_ISSUER = ISSUER;
  process.env.AQ_MCP_OAUTH_JWKS_URL = JWKS_URL;
  process.env.AQ_MCP_OAUTH_SIGNING_ALGORITHM = 'RS256';
  process.env.AQ_MCP_OAUTH_CLIENT_ID = CLIENT_ID;
  process.env.AQ_MCP_DESCOPE_CLIENT_ID = DESCOPE_CLIENT_ID;
  delete process.env.AQ_MCP_OAUTH_PROVIDER;
  delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  delete process.env.AQ_MCP_RESOURCE_URI;
  process.env.DATABASE_URL = 'postgres://localhost/mcp_oauth_test';
  delete process.env.AQ_MCP_API_KEY;
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: Number.parseInt(process.env.PG_POOL_MAX || '', 10) || (isBuildPhase() ? 1 : 5),
    async query(sql) {
      databaseCalls.push(String(sql));
      if (/UPDATE auth_login_tokens/.test(String(sql))) {
        return { rows: [{ email: 'synthetic-user@example.test' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  globalThis.fetch = async (url) => {
    assert.equal(url, JWKS_URL);
    return Response.json({ keys: [publicJwk] });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalIssuer === undefined) delete process.env.AQ_MCP_OAUTH_ISSUER;
  else process.env.AQ_MCP_OAUTH_ISSUER = originalIssuer;
  if (originalJwksUrl === undefined) delete process.env.AQ_MCP_OAUTH_JWKS_URL;
  else process.env.AQ_MCP_OAUTH_JWKS_URL = originalJwksUrl;
  if (originalSigningAlgorithm === undefined) delete process.env.AQ_MCP_OAUTH_SIGNING_ALGORITHM;
  else process.env.AQ_MCP_OAUTH_SIGNING_ALGORITHM = originalSigningAlgorithm;
  if (originalClientId === undefined) delete process.env.AQ_MCP_OAUTH_CLIENT_ID;
  else process.env.AQ_MCP_OAUTH_CLIENT_ID = originalClientId;
  if (originalDescopeClientId === undefined) delete process.env.AQ_MCP_DESCOPE_CLIENT_ID;
  else process.env.AQ_MCP_DESCOPE_CLIENT_ID = originalDescopeClientId;
  if (originalResourceUri === undefined) delete process.env.AQ_MCP_RESOURCE_URI;
  else process.env.AQ_MCP_RESOURCE_URI = originalResourceUri;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
  if (originalOAuthProvider === undefined) delete process.env.AQ_MCP_OAUTH_PROVIDER;
  else process.env.AQ_MCP_OAUTH_PROVIDER = originalOAuthProvider;
  if (originalDiscoveryUrl === undefined) delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  else process.env.AQ_MCP_OAUTH_DISCOVERY_URL = originalDiscoveryUrl;
  if (originalClaimsDiagnostic === undefined) delete process.env.AQ_MCP_OAUTH_CLAIMS_DIAGNOSTIC;
  else process.env.AQ_MCP_OAUTH_CLAIMS_DIAGNOSTIC = originalClaimsDiagnostic;
  if (originalApiKey === undefined) delete process.env.AQ_MCP_API_KEY;
  else process.env.AQ_MCP_API_KEY = originalApiKey;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = originalPool;
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
});

test('existing admin-session and local magic-link authentication remain independent', async () => {
  process.env.AUTH_SECRET = 'synthetic-auth-secret-for-local-regression-test-only';
  const adminToken = createAdminSessionToken({
    id: 9,
    email: 'Admin@Example.test',
    role: 'super_admin',
  });
  const adminSession = verifyAdminSessionToken(adminToken);
  assert.equal(adminSession.scope, 'admin');
  assert.equal(adminSession.email, 'admin@example.test');
  assert.equal(verifyAdminSessionToken(`${adminToken}tampered`), false);

  const signedInEmail = await consumeLoginToken('synthetic-one-time-token-hash');
  assert.equal(signedInEmail, 'synthetic-user@example.test');
  assert.ok(databaseCalls.every((sql) => /auth_login_tokens/.test(sql)));
});

test('valid local JWT verifies signature and required resource claims', async () => {
  const authentication = await verifyMcpOAuthToken(createToken());
  assert.deepEqual(authentication, {
    type: 'oauth',
    subject: 'synthetic-user-123',
    clientId: CLIENT_ID,
  });
});

test('Descope identity tokens require the configured application audience', async () => {
  const previousEnvironment = captureEnvironment([
    'AQ_MCP_OAUTH_ISSUER',
    'AQ_MCP_OAUTH_JWKS_URL',
    'AQ_MCP_OAUTH_SIGNING_ALGORITHM',
    'AQ_MCP_DESCOPE_CLIENT_ID',
  ]);
  const previousFetch = globalThis.fetch;
  process.env.AQ_MCP_OAUTH_ISSUER = ISSUER;
  process.env.AQ_MCP_OAUTH_JWKS_URL = JWKS_URL;
  process.env.AQ_MCP_OAUTH_SIGNING_ALGORITHM = 'RS256';
  process.env.AQ_MCP_DESCOPE_CLIENT_ID = DESCOPE_CLIENT_ID;
  globalThis.fetch = async (url) => {
    assert.equal(url, JWKS_URL);
    return Response.json({ keys: [publicJwk] });
  };

  try {
    const identity = await verifyDescopeIdentityToken(createToken({
      aud: DESCOPE_CLIENT_ID,
      client_id: undefined,
    }));
    assert.equal(identity.sub, 'synthetic-user-123');
    await assert.rejects(
      verifyDescopeIdentityToken(createToken({ aud: 'unapproved-descope-app' })),
      { reasonCode: 'client_binding_mismatch' },
    );
    await assert.rejects(
      verifyDescopeIdentityToken(createToken({ iss: 'https://wrong-issuer.example.test' })),
      { reasonCode: 'issuer_mismatch' },
    );
    await assert.rejects(
      verifyDescopeIdentityToken(createToken({
        aud: [DESCOPE_CLIENT_ID, 'other-app'],
        azp: 'other-app',
      })),
      { reasonCode: 'client_binding_mismatch' },
    );
    await assert.rejects(
      verifyDescopeIdentityToken(createToken({
        aud: DESCOPE_CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) - 1,
      })),
      { reasonCode: 'expiration_invalid' },
    );
    await assert.rejects(
      verifyDescopeIdentityToken(createToken({
        aud: DESCOPE_CLIENT_ID,
        nbf: Math.floor(Date.now() / 1000) + 30,
      })),
      { reasonCode: 'token_not_yet_valid' },
    );
  } finally {
    restoreEnvironment(previousEnvironment);
    globalThis.fetch = previousFetch;
  }
});

test('isolated resource configuration updates metadata, challenge, and strict audience validation', async () => {
  process.env.AQ_MCP_RESOURCE_URI = ISOLATED_RESOURCE;
  try {
    assert.deepEqual(getMcpProtectedResourceMetadata(), {
      resource: ISOLATED_RESOURCE,
      authorization_servers: ['https://mcp-isolated.example.test'],
      scopes_supported: ['openid', 'profile', 'email'],
    });
    const metadataResponse = await getProtectedResourceMetadata();
    assert.deepEqual(await metadataResponse.json(), {
      resource: ISOLATED_RESOURCE,
      authorization_servers: ['https://mcp-isolated.example.test'],
      scopes_supported: ['openid', 'profile', 'email'],
    });
    assert.equal(
      getMcpOAuthChallenge(),
      `Bearer resource_metadata="${ISOLATED_METADATA_URL}"`,
    );
    const challengeResponse = await getMcp(new Request(ISOLATED_RESOURCE));
    assert.equal(challengeResponse.headers.get('www-authenticate'), getMcpOAuthChallenge());
    assert.equal(
      (await verifyMcpOAuthToken(createToken({ aud: ISOLATED_RESOURCE }))).subject,
      'synthetic-user-123',
    );
    await assert.rejects(verifyMcpOAuthToken(createToken({ aud: RESOURCE })));

    process.env.AQ_MCP_RESOURCE_URI = 'http://mcp-isolated.example.test/api/mcp';
    assert.throws(() => getMcpProtectedResourceMetadata());
  } finally {
    delete process.env.AQ_MCP_RESOURCE_URI;
  }
});

test('JWT verification rejects invalid signature, algorithm, claims, and expiry', async () => {
  const token = createToken();
  const [header, claims, signature] = token.split('.');
  const tamperedSignature = `${header}.${claims}.${Buffer.from(signature, 'base64url').map((byte) => byte ^ 1).toString('base64url')}`;

  const invalidTokens = [
    'not-a-jwt',
    tamperedSignature,
    createToken({}, { alg: 'none' }),
    createToken({ iss: 'https://wrong-issuer.example.test' }),
    createToken({ aud: 'https://wrong-resource.example.test' }),
    createToken({ exp: Math.floor(Date.now() / 1000) - 1 }),
    createToken({ sub: '' }),
    createToken({ client_id: 'unapproved-client' }),
  ];
  for (const invalidToken of invalidTokens) {
    await assert.rejects(verifyMcpOAuthToken(invalidToken));
  }
});

test('OAuth endpoint advertises protected-resource metadata and does not run unscoped tools', async () => {
  const metadataResponse = await getProtectedResourceMetadata();
  assert.equal(metadataResponse.status, 200);
  assert.deepEqual(await metadataResponse.json(), {
    resource: RESOURCE,
    authorization_servers: ['https://www.aqprompts.com'],
    scopes_supported: ['openid', 'profile', 'email'],
  });

  const validOAuth = await postMcp(bearerRequest(createToken()));
  assert.equal(validOAuth.status, 403);

  const unauthenticated = await getMcp(new Request(RESOURCE));
  assert.equal(unauthenticated.status, 401);
  assert.equal(
    unauthenticated.headers.get('www-authenticate'),
    'Bearer resource_metadata="https://www.aqprompts.com/.well-known/oauth-protected-resource/api/mcp"',
  );
});

test('invalid OAuth tokens never fall back to API-key authentication', async () => {
  process.env.AQ_MCP_API_KEY = 'isolated-test-api-key-that-is-at-least-32-characters';
  const invalidOAuth = await postMcp(bearerRequest(createToken({ aud: 'https://wrong.example.test' })));
  assert.equal(invalidOAuth.status, 401);

  const malformed = await authenticateMcpRequest(bearerRequest('invalid'));
  assert.deepEqual(malformed, {
    ok: false,
    status: 401,
    reasonCode: 'bearer_not_jwt',
  });
});

test('Descope auth failures log nothing and never leak a reason code', async () => {
  // The old Preview-only console.warn in verifySignedMcpJwt was removed:
  // auth failures must not emit any log line, in any environment, so no
  // failure detail can leak through logs.
  const originalProvider = process.env.AQ_MCP_OAUTH_PROVIDER;
  const originalWarn = console.warn;
  const warnings = [];
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  console.warn = (...args) => warnings.push(args);

  try {
    const response = await postMcp(bearerRequest('invalid'));
    assert.equal(response.status, 401);
    assert.deepEqual(warnings, []);

    process.env.VERCEL_ENV = 'production';
    await postMcp(bearerRequest('invalid'));
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = originalWarn;
    restoreEnvironment({
      AQ_MCP_OAUTH_PROVIDER: originalProvider,
    });
  }
});

test('Descope treats MCP access tokens as opaque and never logs the token', async () => {
  const previousEnvironment = captureEnvironment([
    'AQ_MCP_OAUTH_PROVIDER',
  ]);
  const previousWarn = console.warn;
  const warnings = [];
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  console.warn = (...args) => warnings.push(args);

  try {
    const opaqueToken = 'synthetic-opaque-broker-token-that-is-not-a-jwt-1234567890';
    const response = await postMcp(bearerRequest(opaqueToken));
    assert.equal(response.status, 401);
    assert.deepEqual(warnings, []);
    assert.equal(JSON.stringify(warnings).includes(opaqueToken), false);
  } finally {
    console.warn = previousWarn;
    restoreEnvironment(previousEnvironment);
  }
});

test('claims diagnostic is disabled unless explicitly enabled in Preview', async () => {
  process.env.VERCEL_ENV = 'preview';
  delete process.env.AQ_MCP_OAUTH_CLAIMS_DIAGNOSTIC;
  const response = await postMcp(claimsDiagnosticRequest(createToken()));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found.' });
});

test('claims diagnostic rejects production even when its temporary flag is enabled', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.AQ_MCP_OAUTH_CLAIMS_DIAGNOSTIC = 'true';
  const response = await postMcp(claimsDiagnosticRequest(createToken()));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found.' });
});

test('claims diagnostic rejects an invalid signature without reporting claims', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.AQ_MCP_OAUTH_CLAIMS_DIAGNOSTIC = 'true';
  const token = createToken();
  const [header, claims, signature] = token.split('.');
  const invalidToken = `${header}.${claims}.${Buffer.from(signature, 'base64url').map((byte) => byte ^ 1).toString('base64url')}`;
  const response = await postMcp(claimsDiagnosticRequest(invalidToken));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Invalid diagnostic token.' });
});

test('claims diagnostic reports only sanitized verified claims and never authorizes MCP', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.AQ_MCP_OAUTH_CLAIMS_DIAGNOSTIC = 'true';
  const subject = 'synthetic-private-subject-not-for-output';
  const secretClaim = 'synthetic-extra-claim-not-for-output';
  const expiration = Math.floor(Date.now() / 1000) + 300;
  const token = createToken({
    sub: subject,
    aud: ['authenticated', 'https://audience.example.test\ninvalid'],
    exp: expiration,
    email: 'private@example.test',
    secret: secretClaim,
  });
  const databaseCallCount = databaseCalls.length;
  const response = await postMcp(claimsDiagnosticRequest(token));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const report = await response.json();
  assert.deepEqual(Object.keys(report).sort(), [
    'alg',
    'aud',
    'client_id',
    'exp',
    'iss',
    'kid',
    'sub_present',
  ]);
  assert.deepEqual(report, {
    iss: ISSUER,
    aud: ['authenticated', null],
    client_id: CLIENT_ID,
    exp: expiration,
    sub_present: true,
    alg: 'RS256',
    kid: keyId,
  });
  assert.equal(Number.isSafeInteger(report.exp), true);
  const responseText = JSON.stringify(report);
  assert.equal(responseText.includes(subject), false);
  assert.equal(responseText.includes(secretClaim), false);
  assert.equal(responseText.includes('private@example.test'), false);
  assert.equal(responseText.includes(token), false);
  assert.equal(databaseCalls.length, databaseCallCount);
  await assert.rejects(verifyMcpOAuthToken(token));
});

test('OAuth configuration and JWKS failures fail closed', async () => {
  delete process.env.AQ_MCP_OAUTH_CLIENT_ID;
  assert.equal((await postMcp(bearerRequest(createToken()))).status, 503);
  process.env.AQ_MCP_OAUTH_CLIENT_ID = CLIENT_ID;

  process.env.AQ_MCP_OAUTH_JWKS_URL = 'https://offline.example.test/jwks.json';
  globalThis.fetch = async () => {
    throw new Error('synthetic JWKS outage');
  };
  assert.equal((await postMcp(bearerRequest(createToken()))).status, 503);
  process.env.AQ_MCP_OAUTH_JWKS_URL = JWKS_URL;
});
