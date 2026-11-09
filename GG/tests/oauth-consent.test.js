import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decideOAuthConsent,
  loadOAuthConsent,
} from '../src/lib/oauth-consent.js';

const AUTHORIZATION_ID = 'synthetic-authorization-id';

function makeSupabase({
  claims = { sub: 'synthetic-user' },
  details = {
    authorization_id: AUTHORIZATION_ID,
    redirect_uri: 'https://client.example.test/callback',
    client: {
      id: 'synthetic-client',
      name: 'Synthetic MCP client',
      uri: 'https://client.example.test',
    },
    scope: 'openid profile',
  },
  redirectUrl = 'https://client.example.test/callback?code=synthetic',
  error = null,
} = {}) {
  const calls = [];
  const supabase = {
    auth: {
      async getClaims() {
        calls.push(['getClaims']);
        return { data: claims ? { claims } : null, error: claims ? null : new Error('No session') };
      },
      oauth: {
        async getAuthorizationDetails(id) {
          calls.push(['getAuthorizationDetails', id]);
          return { data: details, error };
        },
        async approveAuthorization(id, options) {
          calls.push(['approveAuthorization', id, options]);
          return { data: { redirect_url: redirectUrl }, error };
        },
        async denyAuthorization(id, options) {
          calls.push(['denyAuthorization', id, options]);
          return { data: { redirect_url: redirectUrl }, error };
        },
      },
    },
  };
  return { supabase, calls };
}

test('unauthenticated access requires a verified Supabase Auth claim', async () => {
  const { supabase, calls } = makeSupabase({ claims: null });
  assert.deepEqual(await loadOAuthConsent(supabase, AUTHORIZATION_ID), { status: 'unauthenticated' });
  assert.deepEqual(calls, [['getClaims']]);
});

test('missing and invalid authorization IDs are rejected before SDK lookup', async () => {
  const { supabase, calls } = makeSupabase();
  assert.deepEqual(await loadOAuthConsent(supabase, ''), { status: 'invalid_request' });
  assert.deepEqual(await loadOAuthConsent(supabase, ` ${AUTHORIZATION_ID}`), { status: 'invalid_request' });
  assert.deepEqual(await loadOAuthConsent(supabase, 'id\u0000forged'), { status: 'invalid_request' });
  assert.deepEqual(calls, []);
});

test('valid authorization details expose client identity and requested scopes', async () => {
  const { supabase, calls } = makeSupabase();
  assert.deepEqual(await loadOAuthConsent(supabase, AUTHORIZATION_ID), {
    status: 'consent',
    clientName: 'Synthetic MCP client',
    clientId: 'synthetic-client',
    clientUri: 'https://client.example.test',
    redirectUri: 'https://client.example.test/callback',
    scopes: ['openid', 'profile'],
  });
  assert.deepEqual(calls, [
    ['getClaims'],
    ['getAuthorizationDetails', AUTHORIZATION_ID],
  ]);
});

test('approval uses Supabase authorization methods and only its returned redirect URL', async () => {
  const redirectUrl = 'https://registered-client.example.test/callback?code=approved';
  const { supabase, calls } = makeSupabase({ redirectUrl });
  const result = await decideOAuthConsent(supabase, AUTHORIZATION_ID, 'approve');
  assert.deepEqual(result, { status: 'redirect', redirectUrl });
  assert.deepEqual(calls, [
    ['getClaims'],
    ['getAuthorizationDetails', AUTHORIZATION_ID],
    ['approveAuthorization', AUTHORIZATION_ID, { skipBrowserRedirect: true }],
  ]);
});

test('denial uses Supabase deny method and its returned redirect URL', async () => {
  const { supabase, calls } = makeSupabase();
  const result = await decideOAuthConsent(supabase, AUTHORIZATION_ID, 'deny');
  assert.deepEqual(result, {
    status: 'redirect',
    redirectUrl: 'https://client.example.test/callback?code=synthetic',
  });
  assert.deepEqual(calls.at(-1), [
    'denyAuthorization',
    AUTHORIZATION_ID,
    { skipBrowserRedirect: true },
  ]);
});

test('invalid IDs, mismatched SDK authorization details, and unsafe SDK redirects fail closed', async () => {
  const missingDetails = makeSupabase({ details: { authorization_id: 'different-id' } });
  assert.deepEqual(
    await decideOAuthConsent(missingDetails.supabase, AUTHORIZATION_ID, 'approve'),
    { status: 'invalid_request' },
  );

  const unsafeRedirect = makeSupabase({ redirectUrl: 'javascript:alert(1)' });
  assert.deepEqual(
    await decideOAuthConsent(unsafeRedirect.supabase, AUTHORIZATION_ID, 'approve'),
    { status: 'invalid_response' },
  );
});

test('an invalid authorization ID rejected by Supabase is not displayed', async () => {
  const invalid = makeSupabase({ error: new Error('Unknown authorization ID') });
  assert.deepEqual(
    await loadOAuthConsent(invalid.supabase, AUTHORIZATION_ID),
    { status: 'invalid_request' },
  );
});
