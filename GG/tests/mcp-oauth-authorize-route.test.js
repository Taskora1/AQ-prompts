import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { GET } from '../app/authorize/route.js';
import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';

const ISSUER = 'https://oauth.example.test/auth/v1';
const CLIENT_ID = 'synthetic-claude-client';
const RESOURCE = 'https://mcp-isolated.example.test/api/mcp';
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const CODE_CHALLENGE = 'A'.repeat(43);
const DESCOPE_ISSUER = 'https://api.descope.com/v1/apps/P3KrYVxQ1xBEE0QOnJdbzBfEVPyf';
const DESCOPE_DISCOVERY_URL =
  `${DESCOPE_ISSUER}/.well-known/openid-configuration`;
const DESCOPE_JWKS_URL =
  'https://api.descope.com/P3KrYVxQ1xBEE0QOnJdbzBfEVPyf/.well-known/jwks.json';
const DESCOPE_AUTHORIZATION_ENDPOINT = 'https://api.descope.com/oauth2/v1/apps/authorize';
const DESCOPE_TOKEN_ENDPOINT = 'https://api.descope.com/oauth2/v1/apps/token';
const DESCOPE_RESOURCE = 'https://aqprompts-cloudflare-k9in-mcp-preview.vercel.app/api/mcp';
const DESCOPE_CLIENT_ID = 'synthetic-descope-app-client';

let previousEnvironment;
let previousPool;

function authorizationRequest(parameters = {}) {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
    state: 'synthetic-state',
    ...parameters,
  });
  return new Request(`https://mcp-isolated.example.test/authorize?${query}`);
}

function restoreEnvironmentValue(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

before(() => {
  previousPool = globalThis.__dbPgPool;
  previousEnvironment = {
    issuer: process.env.AQ_MCP_OAUTH_ISSUER,
    jwksUrl: process.env.AQ_MCP_OAUTH_JWKS_URL,
    signingAlgorithm: process.env.AQ_MCP_OAUTH_SIGNING_ALGORITHM,
    clientId: process.env.AQ_MCP_OAUTH_CLIENT_ID,
    resource: process.env.AQ_MCP_RESOURCE_URI,
    vercelEnv: process.env.VERCEL_ENV,
    oauthProvider: process.env.AQ_MCP_OAUTH_PROVIDER,
    descopeClientId: process.env.AQ_MCP_DESCOPE_CLIENT_ID,
    discoveryUrl: process.env.AQ_MCP_OAUTH_DISCOVERY_URL,
    omitResourceDiagnostic: process.env.AQ_MCP_OAUTH_PREVIEW_OMIT_RESOURCE_DIAGNOSTIC,
    databaseUrl: process.env.DATABASE_URL,
  };
  process.env.AQ_MCP_OAUTH_ISSUER = ISSUER;
  process.env.AQ_MCP_OAUTH_JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
  process.env.AQ_MCP_OAUTH_SIGNING_ALGORITHM = 'RS256';
  process.env.AQ_MCP_OAUTH_CLIENT_ID = CLIENT_ID;
  process.env.AQ_MCP_RESOURCE_URI = RESOURCE;
  process.env.AQ_MCP_DESCOPE_CLIENT_ID = DESCOPE_CLIENT_ID;
  process.env.VERCEL_ENV = 'preview';
  delete process.env.AQ_MCP_OAUTH_PROVIDER;
  delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  delete process.env.AQ_MCP_OAUTH_PREVIEW_OMIT_RESOURCE_DIAGNOSTIC;
  process.env.DATABASE_URL = 'postgres://localhost/mcp_oauth_authorize_test';
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: Number.parseInt(process.env.PG_POOL_MAX || '', 10)
      || (isBuildPhase() ? 1 : 5),
    async query(query, values = []) {
      const sql = typeof query === 'string' ? query : query.text;
      if (/SELECT client_id\s+FROM mcp_oauth_clients/.test(sql)
        && values[0] === CLIENT_ID
        && values[1] === REDIRECT_URI) {
        return { rowCount: 1, rows: [{ client_id: CLIENT_ID }] };
      }
      if (/SELECT client_id\s+FROM mcp_oauth_clients/.test(sql)) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error('Unexpected isolated MCP OAuth database query.');
    },
  };
});

after(() => {
  if (previousPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = previousPool;
  restoreEnvironmentValue('AQ_MCP_OAUTH_ISSUER', previousEnvironment.issuer);
  restoreEnvironmentValue('AQ_MCP_OAUTH_JWKS_URL', previousEnvironment.jwksUrl);
  restoreEnvironmentValue(
    'AQ_MCP_OAUTH_SIGNING_ALGORITHM',
    previousEnvironment.signingAlgorithm,
  );
  restoreEnvironmentValue('AQ_MCP_OAUTH_CLIENT_ID', previousEnvironment.clientId);
  restoreEnvironmentValue('AQ_MCP_RESOURCE_URI', previousEnvironment.resource);
  restoreEnvironmentValue('VERCEL_ENV', previousEnvironment.vercelEnv);
  restoreEnvironmentValue('AQ_MCP_OAUTH_PROVIDER', previousEnvironment.oauthProvider);
  restoreEnvironmentValue('AQ_MCP_DESCOPE_CLIENT_ID', previousEnvironment.descopeClientId);
  restoreEnvironmentValue('AQ_MCP_OAUTH_DISCOVERY_URL', previousEnvironment.discoveryUrl);
  restoreEnvironmentValue(
    'AQ_MCP_OAUTH_PREVIEW_OMIT_RESOURCE_DIAGNOSTIC',
    previousEnvironment.omitResourceDiagnostic,
  );
  restoreEnvironmentValue('DATABASE_URL', previousEnvironment.databaseUrl);
});

test('authorization bridge forwards Claude code and PKCE request to Supabase', async () => {
  const response = await GET(authorizationRequest({
    scope: 'openid profile',
    nonce: 'synthetic-nonce',
  }));

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');

  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://oauth.example.test');
  assert.equal(location.pathname, '/auth/v1/oauth/authorize');
  assert.deepEqual(Object.fromEntries(location.searchParams), {
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
    state: 'synthetic-state',
    resource: RESOURCE,
    scope: 'openid profile',
    nonce: 'synthetic-nonce',
  });
});

test('authorization bridge rejects wrong clients, callbacks, resource, and PKCE', async () => {
  const invalidRequests = [
    authorizationRequest({ client_id: 'other-client' }),
    authorizationRequest({ redirect_uri: 'https://attacker.example/callback' }),
    authorizationRequest({ resource: 'https://other.example/api/mcp' }),
    authorizationRequest({ code_challenge_method: 'plain' }),
    authorizationRequest({ code_challenge: 'short' }),
    authorizationRequest({ state: '' }),
  ];

  for (const request of invalidRequests) {
    assert.equal((await GET(request)).status, 400);
  }

  const duplicateClient = new Request(
    `https://mcp-isolated.example.test/authorize?${new URLSearchParams({
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: 'S256',
      state: 'synthetic-state',
    })}&client_id=${CLIENT_ID}&client_id=other-client`,
  );
  assert.equal((await GET(duplicateClient)).status, 400);
});

test('authorization bridge injects canonical resource if Claude omits it', async () => {
  const response = await GET(authorizationRequest());
  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('resource'), RESOURCE);
});

test('Preview diagnostic omits only forwarded resource and preserves other OAuth parameters', async () => {
  process.env.AQ_MCP_OAUTH_PREVIEW_OMIT_RESOURCE_DIAGNOSTIC = 'true';
  const response = await GET(authorizationRequest({
    scope: 'openid profile',
    nonce: 'synthetic-nonce',
  }));

  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.deepEqual(Object.fromEntries(location.searchParams), {
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
    state: 'synthetic-state',
    scope: 'openid profile',
    nonce: 'synthetic-nonce',
  });
});

test('Preview diagnostic still rejects an invalid incoming resource', async () => {
  process.env.AQ_MCP_OAUTH_PREVIEW_OMIT_RESOURCE_DIAGNOSTIC = 'true';
  const response = await GET(authorizationRequest({
    resource: 'https://other.example/api/mcp',
  }));

  assert.equal(response.status, 400);
});

test('Production cannot enable the resource omission diagnostic', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.AQ_MCP_OAUTH_PREVIEW_OMIT_RESOURCE_DIAGNOSTIC = 'true';
  const response = await GET(authorizationRequest());

  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('resource'), RESOURCE);
});

test('Production Descope fails closed when discovery configuration is missing', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  const response = await GET(authorizationRequest());

  assert.equal(response.status, 503);
});

test('Production Descope authorization uses verified discovery and keeps the MCP resource internal', async () => {
  const originalFetch = globalThis.fetch;
  const discoveryUrl = 'https://discovery.example.test/production-oidc-configuration';
  process.env.VERCEL_ENV = 'production';
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  process.env.AQ_MCP_OAUTH_DISCOVERY_URL = discoveryUrl;
  globalThis.fetch = async (url) => {
    assert.equal(url, discoveryUrl);
    return Response.json({
      issuer: ISSUER,
      authorization_endpoint: DESCOPE_AUTHORIZATION_ENDPOINT,
      token_endpoint: DESCOPE_TOKEN_ENDPOINT,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
    });
  };

  try {
    assert.equal((await GET(authorizationRequest({
      client_id: 'unregistered-claude-client',
    }))).status, 400);
    const response = await GET(authorizationRequest());
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.origin, 'https://api.descope.com');
    assert.equal(location.pathname, '/oauth2/v1/apps/authorize');
    assert.equal(location.searchParams.has('resource'), false);
    assert.equal(location.searchParams.get('client_id'), DESCOPE_CLIENT_ID);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironmentValue('AQ_MCP_OAUTH_PROVIDER', previousEnvironment.oauthProvider);
    restoreEnvironmentValue('AQ_MCP_OAUTH_DISCOVERY_URL', previousEnvironment.discoveryUrl);
    restoreEnvironmentValue('VERCEL_ENV', previousEnvironment.vercelEnv);
  }
});

test('Preview Descope authorization uses its app client without forwarding the MCP resource', async () => {
  const originalFetch = globalThis.fetch;
  const discoveryUrl = 'https://discovery.example.test/preview-oidc-configuration';
  process.env.VERCEL_ENV = 'preview';
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  process.env.AQ_MCP_OAUTH_DISCOVERY_URL = discoveryUrl;
  process.env.AQ_MCP_OAUTH_PREVIEW_OMIT_RESOURCE_DIAGNOSTIC = 'true';
  globalThis.fetch = async (url) => {
    assert.equal(url, discoveryUrl);
    return Response.json({
      issuer: ISSUER,
      authorization_endpoint: DESCOPE_AUTHORIZATION_ENDPOINT,
      token_endpoint: DESCOPE_TOKEN_ENDPOINT,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
    });
  };

  try {
    const response = await GET(authorizationRequest({
      scope: 'mcp:tools.read',
      nonce: 'synthetic-nonce',
    }));
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location'));
    assert.equal(
      location.href.startsWith(`${DESCOPE_AUTHORIZATION_ENDPOINT}?`),
      true,
    );
    assert.deepEqual(Object.fromEntries(location.searchParams), {
      response_type: 'code',
      client_id: DESCOPE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: 'S256',
      state: 'synthetic-state',
      scope: 'openid',
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AQ_MCP_OAUTH_PROVIDER;
    delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
    delete process.env.AQ_MCP_OAUTH_PREVIEW_OMIT_RESOURCE_DIAGNOSTIC;
  }
});

test('Preview Descope accepts the confirmed issuer, JWKS, endpoints, and resource configuration', async () => {
  const originalFetch = globalThis.fetch;
  const previousValues = {
    issuer: process.env.AQ_MCP_OAUTH_ISSUER,
    jwksUrl: process.env.AQ_MCP_OAUTH_JWKS_URL,
    resource: process.env.AQ_MCP_RESOURCE_URI,
    discoveryUrl: process.env.AQ_MCP_OAUTH_DISCOVERY_URL,
    oauthProvider: process.env.AQ_MCP_OAUTH_PROVIDER,
    vercelEnv: process.env.VERCEL_ENV,
  };
  process.env.AQ_MCP_OAUTH_ISSUER = DESCOPE_ISSUER;
  process.env.AQ_MCP_OAUTH_JWKS_URL = DESCOPE_JWKS_URL;
  process.env.AQ_MCP_RESOURCE_URI = DESCOPE_RESOURCE;
  process.env.AQ_MCP_OAUTH_DISCOVERY_URL = DESCOPE_DISCOVERY_URL;
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  process.env.VERCEL_ENV = 'preview';
  globalThis.fetch = async (url) => {
    assert.equal(url, DESCOPE_DISCOVERY_URL);
    return Response.json({
      issuer: DESCOPE_ISSUER,
      authorization_endpoint: DESCOPE_AUTHORIZATION_ENDPOINT,
      token_endpoint: DESCOPE_TOKEN_ENDPOINT,
      jwks_uri: DESCOPE_JWKS_URL,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
    });
  };

  try {
    const response = await GET(authorizationRequest({ resource: DESCOPE_RESOURCE }));
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.origin, 'https://api.descope.com');
    assert.equal(location.pathname, '/oauth2/v1/apps/authorize');
    assert.equal(location.searchParams.has('resource'), false);
    assert.equal(location.searchParams.get('client_id'), DESCOPE_CLIENT_ID);
    assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(location.searchParams.get('redirect_uri'), REDIRECT_URI);
    assert.equal(location.searchParams.get('scope'), 'openid');
    assert.equal(location.searchParams.has('nonce'), false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironmentValue('AQ_MCP_OAUTH_ISSUER', previousValues.issuer);
    restoreEnvironmentValue('AQ_MCP_OAUTH_JWKS_URL', previousValues.jwksUrl);
    restoreEnvironmentValue('AQ_MCP_RESOURCE_URI', previousValues.resource);
    restoreEnvironmentValue('AQ_MCP_OAUTH_DISCOVERY_URL', previousValues.discoveryUrl);
    restoreEnvironmentValue('AQ_MCP_OAUTH_PROVIDER', previousValues.oauthProvider);
    restoreEnvironmentValue('VERCEL_ENV', previousValues.vercelEnv);
  }
});

test('Preview Descope discovery must match configured issuer and JWKS URL', async () => {
  const originalFetch = globalThis.fetch;
  process.env.VERCEL_ENV = 'preview';
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  process.env.AQ_MCP_OAUTH_DISCOVERY_URL =
    'https://discovery.example.test/mismatched-preview-oidc-configuration';
  globalThis.fetch = async () => Response.json({
    issuer: 'https://unexpected-issuer.example.test',
    authorization_endpoint: DESCOPE_AUTHORIZATION_ENDPOINT,
    token_endpoint: DESCOPE_TOKEN_ENDPOINT,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  });

  try {
    const response = await GET(authorizationRequest());
    assert.equal(response.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AQ_MCP_OAUTH_PROVIDER;
    delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  }
});

test('Preview Descope discovery rejects authorization or token endpoints outside the confirmed endpoints', async () => {
  const originalFetch = globalThis.fetch;
  process.env.VERCEL_ENV = 'preview';
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  process.env.AQ_MCP_OAUTH_DISCOVERY_URL =
    'https://discovery.example.test/unexpected-endpoints';
  const validMetadata = {
    issuer: ISSUER,
    authorization_endpoint: DESCOPE_AUTHORIZATION_ENDPOINT,
    token_endpoint: DESCOPE_TOKEN_ENDPOINT,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  };

  try {
    globalThis.fetch = async () => Response.json({
      ...validMetadata,
      authorization_endpoint: 'https://attacker.example.test/oauth/authorize',
    });
    assert.equal((await GET(authorizationRequest())).status, 503);

    globalThis.fetch = async () => Response.json({
      ...validMetadata,
      token_endpoint: 'https://attacker.example.test/oauth/token',
    });
    assert.equal((await GET(authorizationRequest())).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AQ_MCP_OAUTH_PROVIDER;
    delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  }
});

test('Preview Descope discovery rejects a mismatched JWKS URL', async () => {
  const originalFetch = globalThis.fetch;
  process.env.VERCEL_ENV = 'preview';
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  process.env.AQ_MCP_OAUTH_DISCOVERY_URL =
    'https://discovery.example.test/mismatched-jwks-configuration';
  globalThis.fetch = async () => Response.json({
    issuer: ISSUER,
    authorization_endpoint: DESCOPE_AUTHORIZATION_ENDPOINT,
    token_endpoint: DESCOPE_TOKEN_ENDPOINT,
    jwks_uri: 'https://other.example.test/.well-known/jwks.json',
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  });

  try {
    const response = await GET(authorizationRequest());
    assert.equal(response.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AQ_MCP_OAUTH_PROVIDER;
    delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  }
});

test('Preview Descope discovery rejects metadata missing a required endpoint', async () => {
  const originalFetch = globalThis.fetch;
  process.env.VERCEL_ENV = 'preview';
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  process.env.AQ_MCP_OAUTH_DISCOVERY_URL =
    'https://discovery.example.test/missing-endpoint-configuration';
  globalThis.fetch = async () => Response.json({
    issuer: ISSUER,
    authorization_endpoint: DESCOPE_AUTHORIZATION_ENDPOINT,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  });

  try {
    const response = await GET(authorizationRequest());
    assert.equal(response.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AQ_MCP_OAUTH_PROVIDER;
    delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  }
});

test('Preview Descope discovery rejects malformed JSON and unsupported code or S256 metadata', async () => {
  const originalFetch = globalThis.fetch;
  process.env.VERCEL_ENV = 'preview';
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  process.env.AQ_MCP_OAUTH_DISCOVERY_URL =
    'https://discovery.example.test/invalid-capabilities-configuration';
  const validMetadata = {
    issuer: ISSUER,
    authorization_endpoint: DESCOPE_AUTHORIZATION_ENDPOINT,
    token_endpoint: DESCOPE_TOKEN_ENDPOINT,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  };

  try {
    globalThis.fetch = async () => new Response('{invalid-json', {
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal((await GET(authorizationRequest())).status, 503);

    globalThis.fetch = async () => Response.json({
      ...validMetadata,
      response_types_supported: ['token'],
    });
    assert.equal((await GET(authorizationRequest())).status, 503);

    globalThis.fetch = async () => Response.json({
      ...validMetadata,
      code_challenge_methods_supported: ['plain'],
    });
    assert.equal((await GET(authorizationRequest())).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AQ_MCP_OAUTH_PROVIDER;
    delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  }
});

test('Preview Descope discovery rejects redirects without following them', async () => {
  const originalFetch = globalThis.fetch;
  process.env.VERCEL_ENV = 'preview';
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';
  process.env.AQ_MCP_OAUTH_DISCOVERY_URL =
    'https://discovery.example.test/redirected-configuration';
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.redirect, 'error');
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://other.example.test/openid-configuration' },
    });
  };

  try {
    const response = await GET(authorizationRequest());
    assert.equal(response.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AQ_MCP_OAUTH_PROVIDER;
    delete process.env.AQ_MCP_OAUTH_DISCOVERY_URL;
  }
});
