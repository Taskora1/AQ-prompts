#!/usr/bin/env node
/**
 * Safely populates .env.vercel.production with DATABASE_URL from .env.
 * 
 * This script:
 * 1. Reads .env to extract DATABASE_URL
 * 2. Writes .env.vercel.production with DATABASE_URL and required migration vars
 * 3. NEVER prints the actual DATABASE_URL value to the console
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';

const ROOT = process.cwd();
const ENV_LOCAL_PATH = path.join(ROOT, '.env');
const PROD_ENV_PATH = path.join(ROOT, '.env.vercel.production');

async function main() {
  // Read .env
  let envContent;
  try {
    envContent = await fs.readFile(ENV_LOCAL_PATH, 'utf8');
  } catch {
    console.error('[populate-production-env] Cannot read .env file');
    process.exitCode = 1;
    return;
  }

  const envVars = parseEnv(envContent);
  const dbUrl = envVars.DATABASE_URL || envVars.POSTGRES_URL || envVars.POSTGRES_PRISMA_URL;

  if (!dbUrl || !dbUrl.trim()) {
    console.error('[populate-production-env] No DATABASE_URL found in .env');
    process.exitCode = 1;
    return;
  }

  // Read existing .env.vercel.production if it exists
  let existingProd = {};
  try {
    const prodContent = await fs.readFile(PROD_ENV_PATH, 'utf8');
    existingProd = parseEnv(prodContent);
  } catch {
    // File doesn't exist, that's fine
  }

  // Build the production env file content
  // Preserve existing vars, only set what's needed
  const lines = [];
  
  // Copy all existing production env vars (except DATABASE_URL which we'll set)
  try {
    const rawProd = await fs.readFile(PROD_ENV_PATH, 'utf8');
    for (const line of rawProd.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=') || trimmed.startsWith('POSTGRES_URL=') || trimmed.startsWith('POSTGRES_PRISMA_URL=')) {
        continue; // Skip existing DB URLs, we'll set the correct one
      }
      lines.push(line);
    }
  } catch {
    // No existing file
  }

  // Ensure DATABASE_URL is set
  const hasDbUrl = lines.some(l => l.trim().startsWith('DATABASE_URL='));
  if (!hasDbUrl) {
    lines.push(`DATABASE_URL=${dbUrl}`);
  }

  // Ensure required migration vars are set
  const ensureVar = (name, value) => {
    if (!lines.some(l => l.trim().startsWith(`${name}=`))) {
      lines.push(`${name}=${value}`);
    }
  };

  ensureVar('VERCEL_ENV', 'production');
  ensureVar('ALLOW_PRODUCTION_MIGRATION', 'true');
  ensureVar('PREVIEW_DATABASE_MODE', 'staging');

  // Write the file
  await fs.writeFile(PROD_ENV_PATH, lines.join('\n') + '\n', 'utf8');

  // Verify without printing credentials
  const verifyContent = await fs.readFile(PROD_ENV_PATH, 'utf8');
  const verifyVars = parseEnv(verifyContent);
  const hasUrl = !!(verifyVars.DATABASE_URL || verifyVars.POSTGRES_URL || '').trim();
  const hasVercelEnv = verifyVars.VERCEL_ENV === 'production';
  const hasAllowMigration = verifyVars.ALLOW_PRODUCTION_MIGRATION === 'true';

  console.log('[populate-production-env] DATABASE_URL present:', hasUrl);
  console.log('[populate-production-env] VERCEL_ENV=production:', hasVercelEnv);
  console.log('[populate-production-env] ALLOW_PRODUCTION_MIGRATION=true:', hasAllowMigration);
  
  if (hasUrl && hasVercelEnv && hasAllowMigration) {
    console.log('[populate-production-env] ✅ .env.vercel.production is ready for production migration');
  } else {
    console.error('[populate-production-env] ❌ Missing required variables');
    process.exitCode = 1;
  }
}

main();
