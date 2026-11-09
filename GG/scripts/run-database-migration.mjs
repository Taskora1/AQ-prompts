import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  applyValidatedMigrationEnvironment,
  loadExplicitMigrationEnvironment,
  validateMigrationRequest,
} from './lib/database-migration-safety.mjs';

function option(name) {
  const prefix = `${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || '';
}

async function main() {
  const target = option('--target').toLowerCase();
  const explicit = await loadExplicitMigrationEnvironment(option('--env-file'), target);
  const result = validateMigrationRequest({ args: process.argv.slice(2), envFile: explicit.values });

  console.log(`[migration-guard] target=${result.target || 'missing'} mode=${result.dryRun ? 'dry-run' : 'execute'}`);
  console.log(`[migration-guard] script=${result.script || 'missing'}`);
  if (result.identity) {
    console.log(`[migration-guard] provider=${result.identity.provider} endpoint=${result.identity.endpointSuffix}`);
    console.log(`[migration-guard] connection=${result.identity.connectionFingerprint}`);
    console.log(`[migration-guard] host=${result.identity.hostnameFingerprint}`);
    console.log(`[migration-guard] database=${result.identity.databaseNameFingerprint}`);
    console.log(`[migration-guard] username=${result.identity.usernameFingerprint}`);
  }
  for (const operation of result.operations) console.log(`[migration-guard] operation=${operation}`);

  if (!result.safe) {
    for (const failure of result.failures) console.error(`[migration-guard] FAIL: ${failure}`);
    process.exitCode = 1;
    return;
  }

  if (result.dryRun) {
    console.log(`[migration-guard] DRY RUN ONLY; no database connection was opened`);
    console.log(`[migration-guard] execute confirmation=${result.expectedConfirmation}`);
    return;
  }

  applyValidatedMigrationEnvironment(result, explicit.values);
  const migrationPath = path.join(process.cwd(), 'scripts', result.script);
  await import(pathToFileURL(migrationPath).href);
}

main().catch((error) => {
  console.error(`[migration-guard] ERROR: ${error.message}`);
  process.exitCode = 1;
});
