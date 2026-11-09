const DEPLOYMENT_ENVIRONMENTS = new Set(['production', 'preview', 'development']);

const PREVIEW_FEATURE_FLAGS = {
  email: 'ENABLE_EMAIL',
  cron: 'ENABLE_CRON',
  promptsheTrial: 'ENABLE_PROMPTSHE_TRIAL',
  blobUploads: 'ENABLE_BLOB_UPLOADS',
};

export const INTEGRATION_UNAVAILABLE_MESSAGE = 'Unavailable in this environment.';

export function getDeploymentEnvironment(env = process.env) {
  const value = String(env.VERCEL_ENV || '').trim().toLowerCase();
  return DEPLOYMENT_ENVIRONMENTS.has(value) ? value : 'development';
}

export function isPreviewDeployment(env = process.env) {
  return getDeploymentEnvironment(env) === 'preview';
}

export function isProductionDeployment(env = process.env) {
  return getDeploymentEnvironment(env) === 'production';
}

export function isPreviewKvDisabled(env = process.env) {
  return isPreviewDeployment(env)
    && String(env.PREVIEW_KV_MODE || '').trim().toLowerCase() === 'disabled';
}

export function getPreviewFeatureFlag(feature) {
  const flag = PREVIEW_FEATURE_FLAGS[feature];
  if (!flag) throw new Error(`Unknown deployment feature: ${feature}`);
  return flag;
}

export function isIntegrationEnabled(feature, env = process.env) {
  if (!isPreviewDeployment(env)) return true;
  return String(env[getPreviewFeatureFlag(feature)] || '').trim().toLowerCase() === 'true';
}
