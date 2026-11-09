#!/usr/bin/env node
/**
 * Adds missing required migration variables to .env.vercel.production.
 * Does NOT print or modify the existing DATABASE_URL.
 */
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), '.env.vercel.production');
const content = fs.readFileSync(filePath, 'utf8');

const additions = [];
if (!content.includes('VERCEL_ENV=')) additions.push('VERCEL_ENV=production');
if (!content.includes('ALLOW_PRODUCTION_MIGRATION=')) additions.push('ALLOW_PRODUCTION_MIGRATION=true');
if (!content.includes('PREVIEW_DATABASE_MODE=')) additions.push('PREVIEW_DATABASE_MODE=staging');

if (additions.length === 0) {
  console.log('[fix-production-env] All required variables already present');
  process.exit(0);
}

const updated = content.trimEnd() + '\n' + additions.join('\n') + '\n';
fs.writeFileSync(filePath, updated, 'utf8');

console.log('[fix-production-env] Added:', additions.join(', '));
console.log('[fix-production-env] ✅ .env.vercel.production updated');
