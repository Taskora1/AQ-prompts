import { createClient } from '@vercel/kv';
import { getDeploymentEnvironment, isPreviewKvDisabled } from './deployment-env.js';

const ENV_PAIRS = [
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ['STORAGE_KV_REST_API_URL', 'STORAGE_KV_REST_API_TOKEN'],
  ['STORAGE_REDIS_REST_API_URL', 'STORAGE_REDIS_REST_API_TOKEN'],
  ['STORAGE_REST_API_URL', 'STORAGE_REST_API_TOKEN'],
];

let client;

export class KvDisabledError extends Error {
  constructor() {
    super('KV is explicitly disabled in this Preview deployment.');
    this.name = 'KvDisabledError';
    this.code = 'KV_DISABLED';
  }
}

export function isKvDisabledError(error) {
  return error?.code === 'KV_DISABLED';
}

function resolveKvEnv(env = process.env) {
  for (const [urlName, tokenName] of ENV_PAIRS) {
    const url = env[urlName];
    const token = env[tokenName];

    if (url && token) {
      return { url, token, urlName, tokenName };
    }
  }

  return null;
}

export function getKvEnvStatus({ env = process.env } = {}) {
  if (isPreviewKvDisabled(env)) {
    return {
      configured: false,
      disabled: true,
      pair: null,
      checkedPairs: ENV_PAIRS.map(([urlName, tokenName]) => `${urlName}/${tokenName}`),
    };
  }

  const resolved = resolveKvEnv(env);

  return {
    configured: Boolean(resolved),
    disabled: false,
    pair: resolved ? `${resolved.urlName}/${resolved.tokenName}` : null,
    checkedPairs: ENV_PAIRS.map(([urlName, tokenName]) => `${urlName}/${tokenName}`),
  };
}

export function getKvClient({
  env = process.env,
  createKvClient = createClient,
} = {}) {
  if (isPreviewKvDisabled(env)) {
    throw new KvDisabledError();
  }
  if (getDeploymentEnvironment(env) === 'preview'
    && String(env.PREVIEW_KV_MODE || '').trim().toLowerCase() !== 'staging') {
    throw new Error('Preview KV requires PREVIEW_KV_MODE=staging or disabled.');
  }

  const resolved = resolveKvEnv(env);

  if (!resolved) {
    const checked = ENV_PAIRS.map(([urlName, tokenName]) => `${urlName} + ${tokenName}`).join(', ');
    throw new Error(`Vercel KV/Upstash env vars are missing. Checked: ${checked}.`);
  }

  if (!client) {
    client = createKvClient({
      url: resolved.url,
      token: resolved.token,
    });
  }

  return client;
}
