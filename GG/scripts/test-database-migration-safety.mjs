import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  applyValidatedMigrationEnvironment,
  fingerprintDatabaseUrl,
  isMigrationRunnerAuthorized,
  validateMigrationRequest,
} from './lib/database-migration-safety.mjs';
import { isDatabaseMigrationConnectionAllowed } from '../src/lib/db.js';

const productionUrl = 'postgresql://production_user:test-only@production-example.neon.tech/production_db';
const previewUrl = 'postgresql://preview_user:test-only@preview-example.neon.tech/preview_db';
const productionPolicy = fingerprintDatabaseUrl(productionUrl);
const script = '--script=migrate-prompts-to-db.mjs';
const syntheticBootstrapScript = '--script=bootstrap-preview-synthetic-db.mjs';
const removeSitemapEligibilityScript = '--script=remove-sitemap-prompt-eligibility.mjs';

function validate(args, envFile) {
  return validateMigrationRequest({ args, envFile, policy: productionPolicy });
}

function passes(message, callback) {
  callback();
  console.log(`PASS: ${message}`);
}

passes('Preview defaults to dry-run and accepts an explicit staging identity', () => {
  const result = validate(
    [script, '--target=preview'],
    { DATABASE_URL: previewUrl, VERCEL_ENV: 'preview', PREVIEW_DATABASE_MODE: 'staging' },
  );
  assert.equal(result.safe, true);
  assert.equal(result.dryRun, true);
});

passes('MCP OAuth authorization migration is allowlisted for guarded execution', () => {
  const result = validate(
    ['--script=add-mcp-oauth-authorization.mjs', '--target=development'],
    { DATABASE_URL: previewUrl },
  );
  assert.equal(result.safe, true);
  assert.equal(result.dryRun, true);
});

passes('Sitemap eligibility removal is allowlisted only through guarded execution', () => {
  const result = validate(
    [removeSitemapEligibilityScript, '--target=production'],
    { DATABASE_URL: productionUrl, VERCEL_ENV: 'production' },
  );
  assert.equal(result.safe, true);
  assert.deepEqual(result.operations, ['drop only the unused prompt sitemap eligibility column']);
  assert.equal(isDatabaseMigrationConnectionAllowed('remove-sitemap-prompt-eligibility.mjs', ''), false);
});

passes('Synthetic Preview bootstrap is allowlisted only for an isolated Neon Preview target', () => {
  const result = validate(
    [syntheticBootstrapScript, '--target=preview'],
    {
      DATABASE_URL: previewUrl,
      VERCEL_ENV: 'preview',
      PREVIEW_DATABASE_MODE: 'staging',
    },
  );
  assert.equal(result.safe, true);
  assert.deepEqual(result.operations, [
    'create application schema in an empty Preview Neon database',
    'seed only synthetic Preview admin, category, and prompt records',
    'create MCP OAuth authorization schema without granting access',
  ]);

  const nonNeon = validate(
    [syntheticBootstrapScript, '--target=preview'],
    {
      DATABASE_URL: 'postgres://preview-user@preview.example.test/preview_db',
      VERCEL_ENV: 'preview',
      PREVIEW_DATABASE_MODE: 'staging',
    },
  );
  assert.equal(nonNeon.safe, false);
  assert(nonNeon.failures.some((failure) => failure.includes('isolated Neon')));
});

passes('Synthetic Preview bootstrap rejects non-Preview targets and Production identity', () => {
  for (const target of ['development', 'production']) {
    const result = validate([syntheticBootstrapScript, `--target=${target}`], {
      DATABASE_URL: previewUrl,
      VERCEL_ENV: target,
      PREVIEW_DATABASE_MODE: 'staging',
    });
    assert.equal(result.safe, false);
    assert(result.failures.some((failure) => failure.includes('Preview-only')));
  }

  const production = validate(
    [syntheticBootstrapScript, '--target=preview'],
    {
      DATABASE_URL: productionUrl,
      VERCEL_ENV: 'preview',
      PREVIEW_DATABASE_MODE: 'staging',
    },
  );
  assert.equal(production.safe, false);
  assert(production.failures.some((failure) => failure.includes('Production database identity')));
});

passes('Preview rejects the registered Production database identity', () => {
  const result = validate(
    [script, '--target=preview'],
    { DATABASE_URL: productionUrl, VERCEL_ENV: 'preview', PREVIEW_DATABASE_MODE: 'staging' },
  );
  assert.equal(result.safe, false);
  assert(result.failures.some((failure) => failure.includes('Production database identity')));
});

passes('Preview requires both VERCEL_ENV and staging mode in the explicit file', () => {
  const result = validate([script, '--target=preview'], { DATABASE_URL: previewUrl });
  assert.equal(result.safe, false);
  assert(result.failures.some((failure) => failure.includes('VERCEL_ENV=preview')));
  assert(result.failures.some((failure) => failure.includes('PREVIEW_DATABASE_MODE=staging')));
});

passes('Production dry-run remains available without execution approval', () => {
  assert.equal(isMigrationRunnerAuthorized('run-database-migration.mjs'), false);
  const result = validate(
    [script, '--target=production'],
    { DATABASE_URL: productionUrl, VERCEL_ENV: 'production' },
  );
  assert.equal(result.safe, true);
  assert.equal(result.dryRun, true);
  assert.equal(isMigrationRunnerAuthorized('run-database-migration.mjs'), false);
});

passes('Production execution rejects missing flag, file opt-in, and typed confirmation', () => {
  const result = validate(
    [script, '--target=production', '--execute'],
    { DATABASE_URL: productionUrl, VERCEL_ENV: 'production' },
  );
  assert.equal(result.safe, false);
  assert(result.failures.some((failure) => failure.includes('--allow-production')));
  assert(result.failures.some((failure) => failure.includes('ALLOW_PRODUCTION_MIGRATION=true')));
  assert(result.failures.some((failure) => failure.includes('--confirm=')));
});

passes('Production execution remains possible only with all confirmations', () => {
  const dryRun = validate(
    [script, '--target=production'],
    { DATABASE_URL: productionUrl, VERCEL_ENV: 'production' },
  );
  const result = validate(
    [
      script,
      '--target=production',
      '--execute',
      '--allow-production',
      `--confirm=${dryRun.expectedConfirmation}`,
    ],
    {
      DATABASE_URL: productionUrl,
      VERCEL_ENV: 'production',
      ALLOW_PRODUCTION_MIGRATION: 'true',
    },
  );
  assert.equal(result.safe, true);
  assert.equal(result.execute, true);
});

passes('Production target rejects an unregistered database identity', () => {
  const result = validate(
    [script, '--target=production'],
    { DATABASE_URL: previewUrl, VERCEL_ENV: 'production' },
  );
  assert.equal(result.safe, false);
  assert(result.failures.some((failure) => failure.includes('does not match')));
});

passes('Development rejects the registered Production identity', () => {
  const result = validate(
    [script, '--target=development'],
    { DATABASE_URL: productionUrl },
  );
  assert.equal(result.safe, false);
});

passes('Missing target, script, or database identity fails closed', () => {
  const result = validate([], {});
  assert.equal(result.safe, false);
  assert(result.failures.length >= 3);
});

passes('Direct mutation scripts cannot open a database connection outside the guard', () => {
  assert.equal(isDatabaseMigrationConnectionAllowed('migrate-prompts-to-db.mjs', ''), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('add-prompt-library-type.mjs', ''), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('add-mcp-oauth-authorization.mjs', ''), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('bootstrap-preview-synthetic-db.mjs', ''), false);
  assert.equal(
    isDatabaseMigrationConnectionAllowed('E:\\AQ\\GG\\scripts\\add-prompt-library-type.mjs', ''),
    false,
  );
  assert.equal(isDatabaseMigrationConnectionAllowed('setup-paddle-database.mjs', ''), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('delete-text-portrait-categories.mjs', ''), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('run-database-migration.mjs', ''), false);
  for (const value of ['', 'unapproved', 'true', '1', 'production:add-prompt-library-type.mjs']) {
    process.env.AQ_MIGRATION_GUARD_APPROVED = value;
    assert.equal(isDatabaseMigrationConnectionAllowed('migrate-prompts-to-db.mjs'), false);
    assert.equal(isDatabaseMigrationConnectionAllowed('add-prompt-library-type.mjs'), false);
    assert.equal(isDatabaseMigrationConnectionAllowed('separate-prompt-library-categories.mjs'), false);
    assert.equal(isDatabaseMigrationConnectionAllowed('delete-text-portrait-categories.mjs'), false);
  }
  delete process.env.AQ_MIGRATION_GUARD_APPROVED;
  assert.equal(isDatabaseMigrationConnectionAllowed('migrate-prompts-to-db.mjs'), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('add-prompt-library-type.mjs'), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('separate-prompt-library-categories.mjs'), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('delete-text-portrait-categories.mjs'), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('run-database-migration.mjs'), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('next-server.js', ''), true);
});

passes('Direct migration entrypoint rejects forged environment approval', () => {
  const dbPath = fileURLToPath(new URL('../src/lib/db.js', import.meta.url));
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    `import { getPgPool } from ${JSON.stringify(pathToFileURL(dbPath).href)}; process.argv[1] = 'add-prompt-library-type.mjs'; process.env.DATABASE_URL = 'postgres://test:test@localhost/test'; try { getPgPool(); console.log('ALLOWED'); } catch (error) { console.log(error.message.startsWith('Direct database migration execution is blocked') ? 'REJECTED' : 'UNEXPECTED'); }`,
  ], {
    encoding: 'utf8',
    env: { ...process.env, AQ_MIGRATION_GUARD_APPROVED: 'unapproved' },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'REJECTED');
});

passes('Synthetic Preview bootstrap direct execution is refused before any database connection', () => {
  const bootstrapPath = fileURLToPath(new URL('./bootstrap-preview-synthetic-db.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [bootstrapPath], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '', POSTGRES_URL: '', POSTGRES_PRISMA_URL: '' },
  });
  assert.equal(result.status, 1);
  assert.equal(
    result.stderr.trim(),
    'Direct bootstrap execution is blocked; use the guarded Preview migration runner.',
  );
});

passes('Validated runner execution authorizes only its current process', () => {
  const dryRun = validate(
    [script, '--target=development'],
    { DATABASE_URL: previewUrl },
  );
  const result = validate(
    [
      script,
      '--target=development',
      '--execute',
      `--confirm=${dryRun.expectedConfirmation}`,
    ],
    { DATABASE_URL: previewUrl },
  );
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousPostgresUrl = process.env.POSTGRES_URL;
  const previousPrismaUrl = process.env.POSTGRES_PRISMA_URL;
  try {
    applyValidatedMigrationEnvironment(result, { DATABASE_URL: previewUrl });
    assert.equal(isDatabaseMigrationConnectionAllowed('run-database-migration.mjs'), true);
    assert.equal(isDatabaseMigrationConnectionAllowed('add-prompt-library-type.mjs'), false);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousPostgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = previousPostgresUrl;
    if (previousPrismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
    else process.env.POSTGRES_PRISMA_URL = previousPrismaUrl;
  }
});

passes('Production execution rejects wrong target, missing opt-in, and bad confirmation', () => {
  const valid = validate(
    [
      script,
      '--target=production',
      '--execute',
      '--allow-production',
      '--confirm=PRODUCTION:wrong',
    ],
    {
      DATABASE_URL: productionUrl,
      VERCEL_ENV: 'production',
      ALLOW_PRODUCTION_MIGRATION: 'true',
    },
  );
  assert.equal(valid.safe, false);
  assert(valid.failures.some((failure) => failure.includes('--confirm=')));
  assert.equal(validate(
    [script, '--target=production'],
    { DATABASE_URL: previewUrl, VERCEL_ENV: 'production' },
  ).safe, false);
  assert.equal(validate(
    [script, '--target=preview', '--execute', '--confirm=PREVIEW:wrong'],
    { DATABASE_URL: previewUrl, VERCEL_ENV: 'preview', PREVIEW_DATABASE_MODE: 'staging' },
  ).safe, false);
  assert.equal(validate(
    [script, '--target=production', '--execute', '--allow-production'],
    { DATABASE_URL: productionUrl, VERCEL_ENV: 'production' },
  ).safe, false);
});

passes('Dry-run runner validates without starting a database worker', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aq-migration-dry-run-'));
  const envFile = path.join(tempDir, 'staging-preview.env');
  await fs.writeFile(
    envFile,
    'DATABASE_URL=postgres://test:test@preview-example.neon.tech/test_db\nVERCEL_ENV=preview\nPREVIEW_DATABASE_MODE=staging\n',
  );
  try {
    const runnerPath = fileURLToPath(new URL('./run-database-migration.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [
      runnerPath,
      '--script=add-prompt-library-type.mjs',
      '--target=preview',
      `--env-file=${envFile}`,
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY RUN ONLY; no database connection was opened/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

console.log('[migration-safety] all policy simulations passed; no database migration was run');
