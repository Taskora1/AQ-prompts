import crypto from 'node:crypto';
import process from 'node:process';
import nextEnv from '@next/env';

import { isIntegrationEnabled } from '../src/lib/deployment-env.js';
import { validateDeploymentEnvironment } from './verify-production-env.mjs';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

const production = validateDeploymentEnvironment({
  ...process.env,
  VERCEL_ENV: 'production',
});
assert(production.safe, 'existing Production configuration remains strictly valid');
assert(
  isIntegrationEnabled('email', { VERCEL_ENV: 'production', ENABLE_EMAIL: 'false' }),
  'Preview feature flags cannot disable Production integrations',
);

const emptyProduction = validateDeploymentEnvironment({ VERCEL_ENV: 'production' });
assert(!emptyProduction.safe, 'Production rejects missing mandatory integrations');
assert(
  emptyProduction.failures.some((failure) => failure.startsWith('RESEND_API_KEY:')),
  'Production still requires email configuration',
);

const previewSecret = crypto.randomBytes(48).toString('base64url');
const disabledPreview = validateDeploymentEnvironment({
  VERCEL_ENV: 'preview',
  AUTH_SECRET: previewSecret,
});
assert(!disabledPreview.safe, 'Preview fails while its safe data services are missing');
assert(
  !isIntegrationEnabled('email', { VERCEL_ENV: 'preview' })
    && !isIntegrationEnabled('cron', { VERCEL_ENV: 'preview' })
    && !isIntegrationEnabled('promptsheTrial', { VERCEL_ENV: 'preview' })
    && !isIntegrationEnabled('blobUploads', { VERCEL_ENV: 'preview' }),
  'Preview integrations default to disabled',
);
assert(
  disabledPreview.failures.some((failure) => failure.startsWith('Preview database:')),
  'Preview identifies its database requirement',
);
assert(
  disabledPreview.failures.some((failure) => failure.startsWith('Preview KV:')),
  'Preview identifies its dedicated KV requirement',
);
const kvDisabledPreview = validateDeploymentEnvironment({
  VERCEL_ENV: 'preview',
  AUTH_SECRET: previewSecret,
  DATABASE_URL: 'postgresql://preview@ep-preview.neon.tech/preview_db',
  PREVIEW_DATABASE_MODE: 'staging',
  PREVIEW_KV_MODE: 'disabled',
});
assert(kvDisabledPreview.safe, 'Preview accepts explicit KV-disabled mode without KV credentials');
assert(
  validateDeploymentEnvironment({
    VERCEL_ENV: 'preview',
    AUTH_SECRET: previewSecret,
    DATABASE_URL: 'postgresql://preview@ep-preview.neon.tech/preview_db',
    PREVIEW_DATABASE_MODE: 'staging',
    PREVIEW_KV_MODE: 'invalid',
  }).safe === false,
  'Preview rejects invalid KV mode',
);
assert(
  validateDeploymentEnvironment({
    VERCEL_ENV: 'production',
    PREVIEW_KV_MODE: 'disabled',
  }).failures.some((failure) => failure.includes('Preview-only')),
  'Production rejects Preview-only KV-disabled mode',
);
assert(
  validateDeploymentEnvironment({
    VERCEL_ENV: 'preview',
    AUTH_SECRET: previewSecret,
    DATABASE_URL: 'postgresql://preview@ep-preview.neon.tech/preview_db',
    PREVIEW_DATABASE_MODE: 'staging',
    PREVIEW_KV_MODE: 'staging',
  }).failures.some((failure) => failure.startsWith('Preview KV:')),
  'Preview staging mode still requires KV credentials',
);
assert(
  !disabledPreview.failures.some((failure) => /RESEND_API_KEY|CRON_SECRET|WEEKLY_PROMPTS_TO|PROMPTSHE_TRIAL/.test(failure)),
  'disabled Preview integrations do not require live email, cron, or Promptshe variables',
);



console.log('[environment-modes] all environment policy simulations passed');
