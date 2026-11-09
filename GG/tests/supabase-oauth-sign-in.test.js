import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  completeSupabaseOAuthSignIn,
  createOAuthCallbackUrl,
  requestSupabaseOAuthSignIn,
} from '../src/lib/supabase-oauth-sign-in.js';

const AUTHORIZATION_ID = 'synthetic-authorization-id';

test('sign-in requests a Supabase email link without silently creating users', async () => {
  const calls = [];
  const supabase = {
    auth: {
      async signInWithOtp(input) {
        calls.push(input);
        return { error: null };
      },
    },
  };
  const callbackUrl = createOAuthCallbackUrl(
    'https://isolated-aq.example.test',
    AUTHORIZATION_ID,
  );
  assert.equal(
    callbackUrl,
    `https://isolated-aq.example.test/oauth/callback?authorization_id=${AUTHORIZATION_ID}`,
  );
  assert.deepEqual(await requestSupabaseOAuthSignIn(supabase, {
    email: ' Test.User@example.test ',
    authorizationId: AUTHORIZATION_ID,
    callbackUrl,
  }), { status: 'sent' });
  assert.deepEqual(calls, [{
    email: 'test.user@example.test',
    options: {
      emailRedirectTo: callbackUrl,
      shouldCreateUser: false,
    },
  }]);
});

test('sign-in rejects invalid identities and callback URLs without calling Supabase', async () => {
  let calls = 0;
  const supabase = {
    auth: {
      async signInWithOtp() {
        calls += 1;
        return { error: null };
      },
    },
  };
  assert.equal(createOAuthCallbackUrl('javascript:alert(1)', AUTHORIZATION_ID), null);
  assert.deepEqual(await requestSupabaseOAuthSignIn(supabase, {
    email: 'not-an-email',
    authorizationId: AUTHORIZATION_ID,
    callbackUrl: 'https://evil.example.test/oauth/callback',
  }), { status: 'invalid_request' });
  assert.equal(calls, 0);
});

test('callback exchanges Supabase PKCE code and verifies the resulting session', async () => {
  const calls = [];
  const supabase = {
    auth: {
      async exchangeCodeForSession(code) {
        calls.push(['exchangeCodeForSession', code]);
        return { error: null };
      },
      async getClaims() {
        calls.push(['getClaims']);
        return { data: { claims: { sub: 'synthetic-supabase-user' } }, error: null };
      },
    },
  };
  assert.deepEqual(await completeSupabaseOAuthSignIn(supabase, {
    code: 'synthetic-pkce-code',
    authorizationId: AUTHORIZATION_ID,
  }), {
    status: 'complete',
    path: `/oauth/consent?authorization_id=${AUTHORIZATION_ID}`,
  });
  assert.deepEqual(calls, [
    ['exchangeCodeForSession', 'synthetic-pkce-code'],
    ['getClaims'],
  ]);
});

test('callback rejects missing, invalid, or unverified sessions', async () => {
  let exchanged = false;
  const supabase = {
    auth: {
      async exchangeCodeForSession() {
        exchanged = true;
        return { error: null };
      },
      async getClaims() {
        return { data: null, error: new Error('No verified claims') };
      },
    },
  };
  assert.deepEqual(await completeSupabaseOAuthSignIn(supabase, {
    code: '',
    authorizationId: AUTHORIZATION_ID,
  }), { status: 'invalid_request' });
  assert.deepEqual(await completeSupabaseOAuthSignIn(supabase, {
    code: 'synthetic-pkce-code',
    authorizationId: 'invalid\u0000id',
  }), { status: 'invalid_request' });
  assert.equal(exchanged, false);
  assert.deepEqual(await completeSupabaseOAuthSignIn(supabase, {
    code: 'synthetic-pkce-code',
    authorizationId: AUTHORIZATION_ID,
  }), { status: 'invalid_callback' });
});
