import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { validateDeploymentEnvironment } from '../scripts/verify-production-env.mjs';
import {
  getKvClient,
  getKvEnvStatus,
  isKvDisabledError,
} from '../src/lib/kv.js';

const root = process.cwd();
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') {
      return nextResolve(
        pathToFileURL(path.resolve(root, 'node_modules/next/server.js')).href,
        context,
      );
    }
    if (specifier.startsWith('@/')) {
      const target = path.resolve(root, 'src', specifier.slice(2));
      return nextResolve(pathToFileURL(`${target}.js`).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const originalEnv = { ...process.env };
const previewDatabase = 'postgresql://preview@ep-preview.neon.tech/preview_db';

function previewEnvironment(overrides = {}) {
  return {
    VERCEL_ENV: 'preview',
    AUTH_SECRET: 'test-auth-secret-long-enough-for-validation',
    DATABASE_URL: previewDatabase,
    PREVIEW_DATABASE_MODE: 'staging',
    PREVIEW_KV_MODE: 'disabled',
    ...overrides,
  };
}

function setEnvironment(env) {
  for (const name of Object.keys(process.env)) {
    if (!(name in env)) delete process.env[name];
  }
  Object.assign(process.env, env);
}

function validWriteRequest(id, body) {
  return new Request(`https://preview.example.test/api/prompts/${id}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test.after(() => {
  setEnvironment(originalEnv);
});

test('Preview KV-disabled configuration validates without any KV credentials', async (t) => {
  const disabled = validateDeploymentEnvironment(previewEnvironment());
  assert.equal(disabled.safe, true);

  assert.equal(
    validateDeploymentEnvironment(previewEnvironment({ PREVIEW_KV_MODE: '' })).safe,
    false,
  );
  assert.equal(
    validateDeploymentEnvironment(previewEnvironment({ PREVIEW_KV_MODE: 'unexpected' })).safe,
    false,
  );

  const staging = validateDeploymentEnvironment(previewEnvironment({
    PREVIEW_KV_MODE: 'staging',
    KV_REST_API_URL: 'https://fixture.example.test',
    KV_REST_API_TOKEN: 'fixture-token',
  }));
  assert.equal(staging.safe, true);
  assert.equal(validateDeploymentEnvironment(previewEnvironment({
    PREVIEW_KV_MODE: 'staging',
  })).safe, false);

  const incompleteDescope = validateDeploymentEnvironment(previewEnvironment({
    AQ_MCP_OAUTH_PROVIDER: 'descope',
  }));
  assert.equal(incompleteDescope.safe, false);
  assert(incompleteDescope.failures.some((failure) => failure.includes('AQ_MCP_DESCOPE_CLIENT_SECRET')));

  const configuredDescope = validateDeploymentEnvironment(previewEnvironment({
    AQ_MCP_OAUTH_PROVIDER: 'descope',
    AQ_MCP_OAUTH_ISSUER: 'https://api.descope.example/issuer',
    AQ_MCP_OAUTH_DISCOVERY_URL: 'https://api.descope.example/.well-known/openid-configuration',
    AQ_MCP_OAUTH_JWKS_URL: 'https://api.descope.example/keys',
    AQ_MCP_OAUTH_SIGNING_ALGORITHM: 'RS256',
    AQ_MCP_OAUTH_CLIENT_ID: 'approved-claude-client',
    AQ_MCP_DESCOPE_CLIENT_ID: 'descope-app-client',
    AQ_MCP_DESCOPE_CLIENT_SECRET: 'server-only-descope-secret',
    AQ_MCP_RESOURCE_URI: 'https://www.aqprompts.com/api/mcp',
  }));
  assert.equal(configuredDescope.safe, true);
  assert(configuredDescope.required.includes('AQ_MCP_DESCOPE_CLIENT_SECRET'));

  const productionDisabled = validateDeploymentEnvironment({
    VERCEL_ENV: 'production',
    PREVIEW_KV_MODE: 'disabled',
  });
  assert.equal(productionDisabled.safe, false);
  assert(productionDisabled.failures.some((failure) => failure.includes('Preview-only')));

  const production = validateDeploymentEnvironment({
    VERCEL_ENV: 'production',
    SITE_URL: 'https://www.aqprompts.com',
    AUTH_SECRET: 'production-fixture-secret-with-sufficient-length',
    RESEND_API_KEY: 'fixture',
    CRON_SECRET: 'fixture',
    WEEKLY_PROMPTS_TO: 'fixture@example.test',
    PROMPTSHE_TRIAL_WEB_APP_URL: 'https://promptshe.example.test',
    PROMPTSHE_TRIAL_SHARED_SECRET: 'fixture',
    DATABASE_URL: 'postgresql://fixture@ep-production.neon.tech/production',
    KV_REST_API_URL: 'https://fixture.example.test',
    KV_REST_API_TOKEN: 'fixture',
    BLOB_READ_WRITE_TOKEN: 'fixture',
  });
  assert.equal(production.safe, true);

  await t.test('disabled Preview never constructs a client despite fallback credentials', () => {
    const env = previewEnvironment({
      KV_REST_API_URL: 'https://shared-production.fixture.test',
      KV_REST_API_TOKEN: 'fixture-production-token',
      UPSTASH_REDIS_REST_URL: 'https://fallback.fixture.test',
      UPSTASH_REDIS_REST_TOKEN: 'fixture-fallback-token',
    });
    let constructions = 0;
    assert.throws(
      () => getKvClient({
        env,
        createKvClient() {
          constructions += 1;
          throw new Error('KV client construction must not run.');
        },
      }),
      isKvDisabledError,
    );
    assert.equal(constructions, 0);
    assert.equal(getKvEnvStatus({ env }).disabled, true);
  });

  await t.test('engagement write routes return unavailable without KV operations', async () => {
    setEnvironment(previewEnvironment({
      KV_REST_API_URL: 'https://shared-production.fixture.test',
      KV_REST_API_TOKEN: 'fixture-production-token',
    }));
    const routes = [
      ['view', '../app/api/prompts/[id]/view/route.js', { userId: 'synthetic-user-id-123' }],
      ['copy', '../app/api/prompts/[id]/copy/route.js', { userId: 'synthetic-user-id-123' }],
      ['like', '../app/api/prompts/[id]/like/route.js', { userId: 'synthetic-user-id-123' }],
      ['rate', '../app/api/prompts/[id]/rate/route.js', { userId: 'synthetic-user-id-123', rating: 5 }],
    ];

    for (const [action, routePath, body] of routes) {
      const route = await import(routePath);
      const response = await route.POST(validWriteRequest('synthetic-prompt', body), {
        params: Promise.resolve({ id: 'synthetic-prompt' }),
      });
      assert.equal(response.status, 503, action);
      assert.deepEqual(await response.json(), {
        error: 'Prompt engagement is unavailable in this Preview.',
        code: 'KV_DISABLED',
      });
    }
  });
});

test('Production KV client creation retains its normal path', () => {
  let options;
  const client = { fixture: true };
  const result = getKvClient({
    env: {
      VERCEL_ENV: 'production',
      PREVIEW_KV_MODE: 'staging',
      KV_REST_API_URL: 'https://production.fixture.test',
      KV_REST_API_TOKEN: 'fixture-production-token',
    },
    createKvClient(value) {
      options = value;
      return client;
    },
  });
  assert.equal(result, client);
  assert.deepEqual(options, {
    url: 'https://production.fixture.test',
    token: 'fixture-production-token',
  });
});
