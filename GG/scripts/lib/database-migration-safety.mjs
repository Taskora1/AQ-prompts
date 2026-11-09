import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';

export const DATABASE_MIGRATION_OPERATIONS = Object.freeze({
  'migrate-prompts-to-db.mjs': [
    'create the prompts table and indexes when missing',
    'replace the prompts updated-at trigger',
    'upsert bundled public prompt rows by slug',
  ],
  'migrate-prompt-status-categories.mjs': [
    'add/backfill/constrain prompt publication status',
    'create and seed categories when missing',
    'create and backfill prompt-category relationships without removing existing assignments',
  ],
  'add-prompt-library-type.mjs': [
    'add a photo-defaulted prompt library_type column when missing',
    'constrain library_type to photo or text without changing prompt records',
  ],
  'separate-prompt-library-categories.mjs': [
    'add Photo-defaulted category library_type and enforce scoped category name and slug uniqueness',
    'duplicate Text prompt categories and remap Text assignments without changing Photo assignments',
  ],
  'delete-text-portrait-categories.mjs': [
    'delete the Business Portraits and Female Portraits Text categories',
    'remove their Text prompt assignments while preserving all other prompt categories and content',
  ],
  'add-author-profiles.mjs': [
    'create an author profile table with unique public slugs and validated social-link JSON',
    'seed the existing Abdul Qudoos profile without changing blog posts',
  ],
  'add-site-reviews.mjs': [
    'create moderated site reviews with pending-by-default status',
    'add an optional contact email to existing site reviews',
    'store hashed IP fingerprints and user-agent strings for hourly spam controls',
    'add optional prompt references and source labels for one-time copy feedback',
  ],
  'add-site-review-profiles.mjs': [
    'add reviewer profile photo and social-link fields to moderated site reviews',
  ],
'add-prompts-faqs-column.mjs': [
  'add and constrain the prompts FAQ array',
  'normalize invalid FAQ values to an empty array',
],
'add-prompt-editorial-columns.mjs': [
  'add prompt editorial metadata columns',
  'add generation tested tool metadata',
],
  'add-prompt-detail-fields.mjs': [
    'add prompt variation, recommended tool, tool note, how-to, and compatible tool fields',
    'constrain detail-content JSONB columns to arrays without changing existing prompt data',
  ],
  'add-prompt-seo-columns.mjs': [
    'add nullable prompt metadata and Open Graph columns',
  ],
  'add-related-prompt-ids-column.mjs': [
    'add the related-prompt ID array column',
  ],
  'add-public-prompt-eligibility.mjs': [
    'add the photo-directory eligibility flag with a safe false default',
  ],
  'remove-sitemap-prompt-eligibility.mjs': [
    'drop only the unused prompt sitemap eligibility column',
  ],
  'backfill-public-prompt-eligibility.mjs': [
    'prove current JavaScript public-directory eligibility equivalence before updating its stored flag',
  ],
  'create-activity-log-table.mjs': [
    'create the admin activity log table and indexes when missing',
  ],
  'create-admin-users.mjs': [
    'create the admin users table when missing',
    'insert or update the explicitly configured admin account',
  ],
  'setup-paddle-database.mjs': [
    'create or upgrade Paddle customer, subscription, and transaction tables',
  ],
  'backfill-paddle.mjs': [
    'retrieve configured Paddle records',
    'upsert Paddle customer, subscription, and transaction records',
  ],
  'add-mcp-oauth-authorization.mjs': [
    'add an optional admin-account link to MCP OAuth authorizations without linking legacy subjects',
    'create MCP OAuth prompt and blog draft access tables without changing existing content',
    'create the Claude dynamic OAuth client registry without changing existing content',
    'create hashed, expiring MCP OAuth broker access and rotating refresh token stores without changing existing content',
  ],
  'bootstrap-preview-synthetic-db.mjs': [
    'create application schema in an empty Preview Neon database',
    'seed only synthetic Preview admin, category, and prompt records',
    'create MCP OAuth authorization schema without granting access',
  ],
  'migrate-prompt-images-to-blob.mjs': [
    'upload eligible prompt images to the configured Blob store',
    'update prompt image URLs after successful uploads',
  ],
});

export const KNOWN_PRODUCTION_IDENTITY = Object.freeze({
  hostnameFingerprint: 'sha256:4096aeaa9a022f83',
  databaseNameFingerprint: 'sha256:693fe5919fc229a2',
  usernameFingerprint: 'sha256:6f198191100386e1',
});

const DATABASE_VARIABLES = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL'];
const VALID_TARGETS = new Set(['preview', 'production', 'development']);
const validatedExecutionRequests = new WeakSet();
let authorizedRunnerScript = '';

function sha(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`;
}

function option(args, name) {
  const prefix = `${name}=`;
  return args.find((item) => item.startsWith(prefix))?.slice(prefix.length) || '';
}

function databaseValue(env) {
  for (const name of DATABASE_VARIABLES) {
    if (String(env[name] || '').trim()) return { name, value: String(env[name]).trim() };
  }
  return null;
}

export function fingerprintDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const hostname = parsed.hostname.toLowerCase();
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(parsed.username);
  return {
    connectionFingerprint: sha(databaseUrl),
    hostnameFingerprint: sha(hostname),
    databaseNameFingerprint: sha(databaseName),
    usernameFingerprint: sha(username),
    provider: hostname.endsWith('.neon.tech') ? 'neon' : 'other',
    endpointSuffix: `*.${hostname.split('.').slice(-2).join('.')}${parsed.port ? `:${parsed.port}` : ':5432'}`,
  };
}

export function identitiesEqual(left, right) {
  return left.hostnameFingerprint === right.hostnameFingerprint
    && left.databaseNameFingerprint === right.databaseNameFingerprint
    && left.usernameFingerprint === right.usernameFingerprint;
}

export function validateMigrationRequest({
  args,
  envFile,
  policy = KNOWN_PRODUCTION_IDENTITY,
}) {
  const script = path.basename(option(args, '--script'));
  const target = option(args, '--target').toLowerCase();
  const execute = args.includes('--execute');
  const allowProduction = args.includes('--allow-production');
  const confirmation = option(args, '--confirm');
  const failures = [];

  if (!DATABASE_MIGRATION_OPERATIONS[script]) failures.push('--script must select an approved database migration');
  if (!VALID_TARGETS.has(target)) failures.push('--target must be preview, production, or development');
  if (script === 'bootstrap-preview-synthetic-db.mjs' && target !== 'preview') {
    failures.push('Synthetic database bootstrap is Preview-only');
  }

  const selected = databaseValue(envFile);
  if (!selected) failures.push('the explicit environment file has no database URL');
  const identity = selected ? fingerprintDatabaseUrl(selected.value) : null;
  const productionIdentity = identity ? identitiesEqual(identity, policy) : false;
  const expectedConfirmation = identity ? `${target.toUpperCase()}:${identity.connectionFingerprint.slice(-8)}` : '';

  if (target === 'preview') {
    if (envFile.VERCEL_ENV !== 'preview') failures.push('Preview requires VERCEL_ENV=preview in the explicit file');
    if (envFile.PREVIEW_DATABASE_MODE !== 'staging') {
      failures.push('Preview requires PREVIEW_DATABASE_MODE=staging in the explicit file');
    }
    if (productionIdentity) failures.push('Preview target matches the registered Production database identity');
    if (script === 'bootstrap-preview-synthetic-db.mjs') {
      if (identity?.provider !== 'neon') {
        failures.push('Synthetic database bootstrap requires an isolated Neon database identity');
      }
      if (
        identity
        && identity.hostnameFingerprint === policy.hostnameFingerprint
        && identity.databaseNameFingerprint === policy.databaseNameFingerprint
      ) {
        failures.push('Synthetic Preview bootstrap matches the registered Production database endpoint');
      }
    }
  }

  if (target === 'production' && identity && !productionIdentity) {
    failures.push('Production target does not match the registered Production database identity');
  }

  if (target === 'development' && productionIdentity) {
    failures.push('Development target matches the registered Production database identity');
  }

  if (execute && target === 'production') {
    if (!allowProduction) failures.push('Production execution requires --allow-production');
    if (envFile.ALLOW_PRODUCTION_MIGRATION !== 'true') {
      failures.push('Production execution requires ALLOW_PRODUCTION_MIGRATION=true in the explicit file');
    }
  }

  if (execute && confirmation !== expectedConfirmation) {
    failures.push(`Execution requires --confirm=${expectedConfirmation || '<target>:<fingerprint>'}`);
  }

  const result = {
    safe: failures.length === 0,
    failures,
    script,
    target,
    execute,
    dryRun: !execute,
    selectedVariable: selected?.name || null,
    databaseUrl: selected?.value || null,
    identity,
    expectedConfirmation,
    operations: DATABASE_MIGRATION_OPERATIONS[script] || [],
  };
  if (result.safe && result.execute) validatedExecutionRequests.add(result);
  return result;
}

export async function loadExplicitMigrationEnvironment(fileArgument, target) {
  if (!fileArgument) throw new Error('--env-file is required; implicit local environment loading is forbidden');
  const resolved = path.resolve(process.cwd(), fileArgument);
  const basename = path.basename(resolved).toLowerCase();
  if (target === 'preview' && !basename.includes('preview')) {
    throw new Error('Preview migrations require a dedicated file whose name contains preview');
  }
  if (target === 'production' && !basename.includes('production')) {
    throw new Error('Production migrations require a dedicated file whose name contains production');
  }
  if (['.env', '.env.local'].includes(basename)) {
    throw new Error('Generic .env and .env.local files are forbidden for database migrations');
  }
  const source = await fs.readFile(resolved, 'utf8');
  return { resolved, values: parseEnv(source) };
}

export function applyValidatedMigrationEnvironment(result, values) {
  if (
    !result.safe
    || !result.execute
    || !result.databaseUrl
    || !validatedExecutionRequests.has(result)
  ) {
    throw new Error('Migration environment cannot be applied before successful execute-mode validation');
  }
  validatedExecutionRequests.delete(result);
  const allowedName = /^(?:DATABASE_|POSTGRES_|PGSSLMODE$|PADDLE_|NEXT_PUBLIC_PADDLE_|BLOB_|VERCEL_OIDC_TOKEN$|ADMIN_|PREVIEW_|VERCEL_ENV$|ALLOW_PRODUCTION_MIGRATION$)/;
  for (const [name, value] of Object.entries(values)) {
    if (allowedName.test(name)) process.env[name] = value;
  }
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  process.env.DATABASE_URL = result.databaseUrl;
  delete process.env.AQ_MIGRATION_GUARD_APPROVED;
  authorizedRunnerScript = result.script;
}

export function isMigrationRunnerAuthorized(entrypoint = process.argv[1]) {
  const script = path.basename(String(entrypoint || ''));
  return script === 'run-database-migration.mjs'
    && Boolean(authorizedRunnerScript)
    && Boolean(DATABASE_MIGRATION_OPERATIONS[authorizedRunnerScript]);
}
