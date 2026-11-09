import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

import { getDeploymentEnvironment } from '../src/lib/deployment-env.js';

const { loadEnvConfig } = nextEnv;
const CANONICAL_ORIGIN = 'https://www.aqprompts.com';
const FEATURE_FLAGS = {
  email: 'ENABLE_EMAIL',
  cron: 'ENABLE_CRON',
  promptsheTrial: 'ENABLE_PROMPTSHE_TRIAL',
  blobUploads: 'ENABLE_BLOB_UPLOADS',
};
const DATABASE_NAMES = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL'];
const BLOB_NAMES = ['BLOB_READ_WRITE_TOKEN', 'VERCEL_OIDC_TOKEN'];
const KV_PAIRS = [
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ['STORAGE_KV_REST_API_URL', 'STORAGE_KV_REST_API_TOKEN'],
  ['STORAGE_REDIS_REST_API_URL', 'STORAGE_REDIS_REST_API_TOKEN'],
  ['STORAGE_REST_API_URL', 'STORAGE_REST_API_TOKEN'],
];
const PRODUCTION_REQUIRED = [
  'SITE_URL',
  'AUTH_SECRET',
  'RESEND_API_KEY',
  'CRON_SECRET',
  'WEEKLY_PROMPTS_TO',
  'PROMPTSHE_TRIAL_WEB_APP_URL',
  'PROMPTSHE_TRIAL_SHARED_SECRET',

];
const OPTIONAL_NAMES = [
  'SITE_NAME',
  'SITE_EMAIL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_GA_ID',
  'NEXT_PUBLIC_CLARITY_ID',
  'NEXT_PUBLIC_GSC_VERIFY',
  'NEXT_PUBLIC_BING_VERIFY',
  'NEXT_PUBLIC_PINTEREST_VERIFY',

  'KV_REST_API_READ_ONLY_TOKEN',
  'PGSSLMODE',
];

function clean(env, name) {
  return String(env[name] || '').trim();
}

function looksLikePlaceholder(input) {
  return /replace[_-]?with|your[_-]?domain|example\.com|x{8,}|real[_-]?16|changeme|todo/i.test(input);
}

function configured(env, name) {
  const current = clean(env, name);
  return Boolean(current) && !looksLikePlaceholder(current);
}

function enabled(env, name) {
  return clean(env, name).toLowerCase() === 'true';
}

function validateBooleanFlag(env, name, failures) {
  const value = clean(env, name).toLowerCase();
  if (value && !['true', 'false'].includes(value)) {
    failures.push(`${name}: must be true or false when configured`);
  }
}

function hasConfiguredPair(env, pairs) {
  return pairs.some(([first, second]) => configured(env, first) && configured(env, second));
}

function requireName(env, name, failures, required) {
  required.add(name);
  if (!configured(env, name)) failures.push(`${name}: missing, empty, or placeholder`);
}

function requireOne(env, names, label, failures, required) {
  names.forEach((name) => required.add(name));
  if (!names.some((name) => configured(env, name))) {
    failures.push(`${label}: one configured value is required`);
  }
}

function validateHttpsUrl(env, name, failures, { allowCanonicalOnly = false, allowRelative = false } = {}) {
  const current = clean(env, name);
  if (!current || looksLikePlaceholder(current)) return;
  if (allowRelative && current.startsWith('/') && !current.startsWith('//')) return;

  try {
    const parsed = new URL(current);
    if (parsed.protocol !== 'https:') failures.push(`${name}: must use HTTPS`);
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(parsed.hostname)) {
      failures.push(`${name}: localhost is not allowed`);
    }
    if (allowCanonicalOnly && parsed.origin !== CANONICAL_ORIGIN) {
      failures.push(`${name}: Preview metadata must retain the Production canonical origin`);
    }
  } catch {
    failures.push(`${name}: invalid URL`);
  }
}

function validateAuthSecret(env, failures) {
  const secret = clean(env, 'AUTH_SECRET');
  if (secret && secret.length < 32) failures.push('AUTH_SECRET: must contain at least 32 characters');
}

function validateMcpOAuthProvider(env, failures, required) {
  const provider = clean(env, 'AQ_MCP_OAUTH_PROVIDER').toLowerCase();
  if (!provider) return;
  if (provider === 'supabase') return;
  if (provider !== 'descope') {
    failures.push('AQ_MCP_OAUTH_PROVIDER: must be descope or supabase when configured');
    return;
  }

  for (const name of [
    'AQ_MCP_OAUTH_ISSUER',
    'AQ_MCP_OAUTH_DISCOVERY_URL',
    'AQ_MCP_OAUTH_JWKS_URL',
    'AQ_MCP_OAUTH_SIGNING_ALGORITHM',
    'AQ_MCP_DESCOPE_CLIENT_ID',
    'AQ_MCP_DESCOPE_CLIENT_SECRET',
    'AQ_MCP_RESOURCE_URI',
  ]) {
    requireName(env, name, failures, required);
  }
  for (const name of [
    'AQ_MCP_OAUTH_ISSUER',
    'AQ_MCP_OAUTH_DISCOVERY_URL',
    'AQ_MCP_OAUTH_JWKS_URL',
  ]) {
    validateHttpsUrl(env, name, failures);
  }

  const algorithm = clean(env, 'AQ_MCP_OAUTH_SIGNING_ALGORITHM');
  if (algorithm && !['RS256', 'ES256'].includes(algorithm)) {
    failures.push('AQ_MCP_OAUTH_SIGNING_ALGORITHM: must be RS256 or ES256');
  }

  const resource = clean(env, 'AQ_MCP_RESOURCE_URI');
  if (resource && !looksLikePlaceholder(resource)) {
    try {
      const parsed = new URL(resource);
      if (
        parsed.protocol !== 'https:'
        || parsed.username
        || parsed.password
        || parsed.pathname !== '/api/mcp'
        || parsed.search
        || parsed.hash
      ) {
        failures.push('AQ_MCP_RESOURCE_URI: must be the canonical HTTPS /api/mcp URI');
      }
    } catch {
      failures.push('AQ_MCP_RESOURCE_URI: invalid URL');
    }
  }
}



function validatePreview(env, failures, warnings, required, disabledIntegrations) {
  requireName(env, 'AUTH_SECRET', failures, required);
  requireOne(env, DATABASE_NAMES, 'Preview database', failures, required);
  if (clean(env, 'PREVIEW_KV_MODE').toLowerCase() !== 'disabled' && !hasConfiguredPair(env, KV_PAIRS)) {
    KV_PAIRS.flat().forEach((name) => required.add(name));
    failures.push('Preview KV: one complete dedicated URL/token pair is required');
  }
  requireName(env, 'PREVIEW_DATABASE_MODE', failures, required);
  requireName(env, 'PREVIEW_KV_MODE', failures, required);

  if (configured(env, 'PREVIEW_DATABASE_MODE') && !['staging', 'readonly-public'].includes(clean(env, 'PREVIEW_DATABASE_MODE'))) {
    failures.push('PREVIEW_DATABASE_MODE: must be staging or readonly-public');
  }
  if (configured(env, 'PREVIEW_KV_MODE')
    && !['staging', 'disabled'].includes(clean(env, 'PREVIEW_KV_MODE'))) {
    failures.push('PREVIEW_KV_MODE: must be staging or disabled');
  }

  validateAuthSecret(env, failures);
  validateHttpsUrl(env, 'SITE_URL', failures, { allowCanonicalOnly: true });
  validateHttpsUrl(env, 'NEXT_PUBLIC_SITE_URL', failures, { allowCanonicalOnly: true });

  for (const flag of Object.values(FEATURE_FLAGS)) validateBooleanFlag(env, flag, failures);
  for (const [feature, flag] of Object.entries(FEATURE_FLAGS)) {
    if (!enabled(env, flag)) disabledIntegrations.push(feature);
  }

  for (const [feature, flag] of [
    ['email', FEATURE_FLAGS.email],
    ['cron', FEATURE_FLAGS.cron],
    ['promptsheTrial', FEATURE_FLAGS.promptsheTrial],
    ['blobUploads', FEATURE_FLAGS.blobUploads],
  ]) {
    if (enabled(env, flag)) {
      failures.push(`${flag}: ${feature} has no approved Preview integration configuration and must remain disabled`);
    }
  }

  if (!enabled(env, FEATURE_FLAGS.email) && configured(env, 'RESEND_API_KEY')) {
    warnings.push('RESEND_API_KEY: configured but unused because Preview email is disabled');
  }
  if (!enabled(env, FEATURE_FLAGS.promptsheTrial)
    && (configured(env, 'PROMPTSHE_TRIAL_WEB_APP_URL') || configured(env, 'PROMPTSHE_TRIAL_SHARED_SECRET'))) {
    warnings.push('Promptshe credentials: configured but unused because Preview forwarding is disabled');
  }
}

function validateProduction(env, failures, warnings, required) {
  if (clean(env, 'PREVIEW_KV_MODE').toLowerCase() === 'disabled') {
    failures.push('PREVIEW_KV_MODE=disabled is Preview-only');
  }
  for (const name of PRODUCTION_REQUIRED) requireName(env, name, failures, required);
  requireOne(env, DATABASE_NAMES, 'Production database', failures, required);
  requireOne(env, BLOB_NAMES, 'Production Blob authorization', failures, required);
  if (!hasConfiguredPair(env, KV_PAIRS)) {
    KV_PAIRS.flat().forEach((name) => required.add(name));
    failures.push('Production KV: one complete URL/token pair is required');
  }

  validateAuthSecret(env, failures);
  validateHttpsUrl(env, 'SITE_URL', failures);
  validateHttpsUrl(env, 'NEXT_PUBLIC_SITE_URL', failures);
  validateHttpsUrl(env, 'PROMPTSHE_TRIAL_WEB_APP_URL', failures);

  for (const name of OPTIONAL_NAMES) {
    if (!configured(env, name)) warnings.push(`${name}: optional and not configured`);
  }
}

function validateDevelopment(env, failures, warnings, required) {
  if (clean(env, 'PREVIEW_KV_MODE').toLowerCase() === 'disabled') {
    failures.push('PREVIEW_KV_MODE=disabled is Preview-only');
  }
  validateAuthSecret(env, failures);
  if (!configured(env, 'AUTH_SECRET')) warnings.push('AUTH_SECRET: required for local authentication testing');
  if (!DATABASE_NAMES.some((name) => configured(env, name))) {
    warnings.push('Database: required for local production builds and prompt generation');
  }
  if (!hasConfiguredPair(env, KV_PAIRS)) warnings.push('KV: required for local stats and trending route testing');
}

export function validateDeploymentEnvironment(env = process.env) {
  const deploymentEnvironment = getDeploymentEnvironment(env);
  const failures = [];
  const warnings = [];
  const required = new Set();
  const disabledIntegrations = [];

  if (deploymentEnvironment === 'production') {
    validateProduction(env, failures, warnings, required);
  } else if (deploymentEnvironment === 'preview') {
    validatePreview(env, failures, warnings, required, disabledIntegrations);
  } else {
    validateDevelopment(env, failures, warnings, required);
  }
  validateMcpOAuthProvider(env, failures, required);

  return {
    deploymentEnvironment,
    required: [...required].sort(),
    disabledIntegrations: [...new Set(disabledIntegrations)].sort(),
    failures: [...new Set(failures)],
    warnings: [...new Set(warnings)],
    safe: failures.length === 0,
  };
}

function localOverrideWarnings(root) {
  const warnings = [];
  const namesByFile = new Map();
  for (const fileName of ['.env', '.env.local']) {
    const file = path.join(root, fileName);
    if (!fs.existsSync(file)) continue;
    const names = new Set();
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match) names.add(match[1]);
    }
    namesByFile.set(fileName, names);
  }
  if (namesByFile.size > 1) {
    warnings.push('Multiple local environment files are loaded; values were not printed or compared');
  }
  return warnings;
}

function printResult(result) {
  console.log(`[environment] detected=${result.deploymentEnvironment}`);
  console.log(`[environment] required variable name(s)=${result.required.length}`);
  console.log(`[environment] disabled integration(s)=${result.disabledIntegrations.join(', ') || 'none'}`);
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
  for (const failure of result.failures) console.error(`FAIL: ${failure}`);
  console.log(`[environment] ${result.safe ? 'SAFE TO CONTINUE' : 'UNSAFE TO CONTINUE'}`);
}

const isCli = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isCli) {
  const root = process.cwd();
  loadEnvConfig(root, false);
  const result = validateDeploymentEnvironment(process.env);
  result.warnings.push(...localOverrideWarnings(root));
  printResult(result);
  if (!result.safe) process.exitCode = 1;
}
