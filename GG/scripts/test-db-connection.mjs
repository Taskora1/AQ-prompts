#!/usr/bin/env node
/**
 * Standalone database connectivity test.
 * Run: node scripts/test-db-connection.mjs
 *
 * Tests:
 *   1. DATABASE_URL presence
 *   2. SELECT 1 (basic connectivity)
 *   3. SELECT from users table
 *
 * Never logs credentials.
 */

import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

const { getPgPool, testDatabaseConnection } = await import('../src/lib/db.js');

async function main() {
  console.log('=== Neon Postgres Connection Test ===\n');

  // Step 1: basic connectivity
  const basic = await testDatabaseConnection();
  if (!basic.ok) {
    console.error(`\nFAILED at basic connectivity: ${basic.reason}`);
    console.error('Action: Resume your Neon database from the Neon dashboard.');
    process.exit(1);
  }
  console.log('');

  // Step 2: query users table
  try {
    console.log('[DB] querying users table — SELECT id, email, role FROM users LIMIT 3…');
    const start = Date.now();
    const result = await getPgPool().query(
      'SELECT id, email, role FROM users ORDER BY role DESC, email LIMIT 3',
    );
    const ms = Date.now() - start;
    console.log(`[DB] users query OK (${ms}ms) — ${result.rows.length} row(s) returned`);
    for (const row of result.rows) {
      console.log(`  id=${row.id} email=${row.email} role=${row.role}`);
    }
  } catch (err) {
    console.error(`\n[DB] users query FAILED: ${err.name}: ${err.message}`);
    console.error('The users table may not exist, or the connection dropped mid-query.');
  }

  console.log('\n=== Done ===');
  await getPgPool().end();
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
