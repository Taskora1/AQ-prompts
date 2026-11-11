import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isDescopeOAuthEnabled } from '../src/lib/mcp-auth.js';

function restoreEnvironment(previous) {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test('Descope OAuth is enabled by the provider alone, without VERCEL_ENV', async () => {
  // Step 1: Workers never sets VERCEL_ENV, so gating on it disabled the
  // whole Descope flow live even though every Descope variable was set.
  // The provider flag alone must turn Descope on.
  const previous = {
    AQ_MCP_OAUTH_PROVIDER: process.env.AQ_MCP_OAUTH_PROVIDER,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
  delete process.env.VERCEL_ENV;
  process.env.AQ_MCP_OAUTH_PROVIDER = 'descope';

  try {
    assert.equal(isDescopeOAuthEnabled(), true);
  } finally {
    restoreEnvironment(previous);
  }
});

test('Descope OAuth stays off when the provider is not descope', async () => {
  const previous = {
    AQ_MCP_OAUTH_PROVIDER: process.env.AQ_MCP_OAUTH_PROVIDER,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };

  try {
    // Even a Vercel preview environment must not enable Descope when the
    // provider is something else (or unset).
    process.env.VERCEL_ENV = 'preview';
    process.env.AQ_MCP_OAUTH_PROVIDER = 'supabase';
    assert.equal(isDescopeOAuthEnabled(), false);

    delete process.env.AQ_MCP_OAUTH_PROVIDER;
    assert.equal(isDescopeOAuthEnabled(), false);
  } finally {
    restoreEnvironment(previous);
  }
});
