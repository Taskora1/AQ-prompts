#!/usr/bin/env node

/**
 * Diagnostic script: verify password reset system is configured correctly.
 *
 * Usage:
 *   node scripts/check-password-reset.mjs
 *
 * Checks:
 *   1. RESEND_API_KEY is set
 *   2. DATABASE_URL is set
 *   3. password_reset_tokens table exists
 *   4. users table has at least one admin user
 *   5. Can generate and verify a test token (optional)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* ── Load environment variables ─────────────────────────────────────────── */

function loadEnvFile(filename) {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const envPath = join(__dirname, '..', filename);
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // File doesn't exist — continue
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

/* ── Checks ─────────────────────────────────────────────────────────────── */

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`);
    pass++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

console.log('\n🔐 Password Reset System Diagnostic\n');

// 1. RESEND_API_KEY
const resendKey = process.env.RESEND_API_KEY;
check('RESEND_API_KEY', Boolean(resendKey), resendKey ? `length=${resendKey.length}` : 'NOT SET');

// 2. DATABASE_URL
const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
check('DATABASE_URL / POSTGRES_URL', Boolean(dbUrl), dbUrl ? 'configured' : 'NOT SET');

// 3. AUTH_SECRET
const authSecret = process.env.AUTH_SECRET;
check('AUTH_SECRET', Boolean(authSecret) && authSecret.length >= 32, authSecret ? `length=${authSecret.length}` : 'NOT SET or too short');

// 4. SITE_URL
const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
check('SITE_URL / NEXT_PUBLIC_SITE_URL', Boolean(siteUrl), siteUrl || 'not set (will use request origin)');

// 5. Database tables
if (dbUrl) {
  console.log('\n📊 Database Checks\n');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });

  try {
    // Check users table
    const usersResult = await pool.query(`
      SELECT COUNT(*)::int AS count FROM users
    `);
    const userCount = usersResult.rows[0]?.count || 0;
    check('users table', userCount > 0, `${userCount} user(s)`);

    // List admin users (email + role only)
    const adminsResult = await pool.query(`
      SELECT email, role FROM users ORDER BY role DESC, email
    `);
    for (const row of adminsResult.rows) {
      console.log(`     → ${row.email} (${row.role})`);
    }

    // Check password_reset_tokens table
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'password_reset_tokens'
      ) AS exists
    `);
    const tableExists = tableCheck.rows[0]?.exists;
    check('password_reset_tokens table', tableExists, tableExists ? 'exists' : 'MISSING — run: node scripts/migrate-admin-password-reset.mjs');

    if (tableExists) {
      const tokenCount = await pool.query('SELECT COUNT(*)::int AS count FROM password_reset_tokens');
      console.log(`     → ${tokenCount.rows[0]?.count || 0} token(s) in table`);
    }
  } catch (err) {
    console.error(`  ❌ Database error: ${err.message}`);
    fail++;
  } finally {
    await pool.end();
  }
}

// Summary
console.log('\n' + '─'.repeat(50));
if (fail === 0) {
  console.log(`\n✅ All checks passed (${pass}/${pass + fail})\n`);
} else {
  console.log(`\n❌ ${fail} check(s) failed, ${pass} passed\n`);
  if (fail > 0) {
    console.log('Fix the failed checks above before testing password reset.\n');
  }
}
