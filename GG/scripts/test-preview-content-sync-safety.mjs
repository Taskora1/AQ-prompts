import assert from 'node:assert/strict';

import {
  assertContentSyncSafety,
  fingerprintPreviewDatabaseIdentity,
} from './build-content.mjs';
import { fingerprintDatabaseUrl } from './lib/database-migration-safety.mjs';

const previewUrl =
  'postgresql://preview_user@ep-preview-example.neon.tech/preview_db';
const productionUrl = 'postgresql://production_user@ep-production.neon.tech/production_db';
const validPreviewEnvironment = {
  DATABASE_URL: previewUrl,
  VERCEL_ENV: 'preview',
  PREVIEW_DATABASE_MODE: 'staging',
};
const productionIdentity = fingerprintDatabaseUrl(productionUrl);
const safetyOptions = {
  productionIdentity,
  expectedPreviewIdentityFingerprint: fingerprintPreviewDatabaseIdentity(previewUrl),
};

function rejects(expectedError, env, options = safetyOptions) {
  assert.throws(() => assertContentSyncSafety(env, options), {
    message: expectedError,
  });
  console.log(`PASS: ${expectedError}`);
}

rejects('Content sync requires an explicit Preview or Production environment.', {
  DATABASE_URL: previewUrl,
});

rejects('Content sync requires an explicit Preview or Production environment.', {
  DATABASE_URL: previewUrl,
  VERCEL_ENV: 'staging',
});

rejects('Content sync Preview requires PREVIEW_DATABASE_MODE=staging.', {
  DATABASE_URL: previewUrl,
  VERCEL_ENV: 'preview',
});

rejects('Content sync requires a configured database.', {
  VERCEL_ENV: 'preview',
  PREVIEW_DATABASE_MODE: 'staging',
});

rejects('Content sync Preview requires the dedicated Neon database.', {
  ...validPreviewEnvironment,
  DATABASE_URL: 'postgresql://preview_user@preview.example.test/preview_db',
});

rejects('Content sync Preview cannot use the registered Production database.', {
  ...validPreviewEnvironment,
  DATABASE_URL: productionUrl,
});

const unverifiedPreviewUrl = 'postgresql://unknown_user@ep-unknown.neon.tech/unknown_db';
rejects('Content sync database identity is not the verified Preview database.', {
  ...validPreviewEnvironment,
  DATABASE_URL: unverifiedPreviewUrl,
});

rejects('Content sync Production database does not match the registered Production identity.', {
  DATABASE_URL: previewUrl,
  VERCEL_ENV: 'production',
});

assert.doesNotThrow(() => assertContentSyncSafety(validPreviewEnvironment, safetyOptions));
console.log('PASS: verified disposable Preview identity');

assert.doesNotThrow(() => assertContentSyncSafety({
  DATABASE_URL: productionUrl,
  VERCEL_ENV: 'production',
}, safetyOptions));
console.log('PASS: registered Production identity');
