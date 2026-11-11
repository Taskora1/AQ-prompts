import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import { authenticateAdminUserWithDailyIpLimit } from '../src/lib/admin-users-db.js';

let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;
const queries = [];
const failureState = new Map();

before(() => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalPostgresUrl = process.env.POSTGRES_URL;
  originalPrismaUrl = process.env.POSTGRES_PRISMA_URL;
  originalPool = globalThis.__dbPgPool;
  process.env.DATABASE_URL = 'postgres://localhost/unit_test';
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async query(sql) {
      queries.push(String(sql));
      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql, values = []) {
          const text = String(sql);
          queries.push(text);
          if (/DELETE FROM admin_login_rate_limits/i.test(text)) {
            for (const [fingerprint, state] of failureState) {
              if (!state.active) failureState.delete(fingerprint);
            }
          } else if (/FROM admin_login_rate_limits/i.test(text)) {
            const state = failureState.get(values[0]);
            return {
              rows: state
                ? [{ failedAttempts: state.count, windowActive: state.active }]
                : [],
            };
          } else if (/FROM users/i.test(text)) {
            return { rows: [] };
          } else if (/INSERT INTO admin_login_rate_limits/i.test(text)) {
            const state = failureState.get(values[0]);
            if (state?.active) state.count += 1;
            else failureState.set(values[0], { count: 1, active: true });
          }
          return { rows: [] };
        },
        release() {},
      };
    },
    async end() {},
  };
});

after(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
  if (originalPrismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
  else process.env.POSTGRES_PRISMA_URL = originalPrismaUrl;
  if (originalPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = originalPool;
});

test('admin login allows three wrong attempts per IP and blocks the fourth across accounts', async () => {
  const fingerprint = 'same-ip-fingerprint';

  for (const email of ['first@example.com', 'second@example.com', 'third@example.com']) {
    const result = await authenticateAdminUserWithDailyIpLimit(email, 'wrong-password', fingerprint);
    assert.deepEqual(result, { user: null, limited: false });
  }

  const usersQueriesBeforeBlockedAttempt = queries.filter((sql) => /FROM users/i.test(sql)).length;
  const blocked = await authenticateAdminUserWithDailyIpLimit(
    'another-account@example.com',
    'wrong-password',
    fingerprint,
  );

  assert.deepEqual(blocked, { user: null, limited: true });
  assert.equal(failureState.get(fingerprint).count, 3);
  assert.equal(queries.filter((sql) => /FROM users/i.test(sql)).length, usersQueriesBeforeBlockedAttempt);
  assert(queries.some((sql) => /pg_advisory_xact_lock/i.test(sql)));
});

test('expired admin login failure windows restart at one attempt', async () => {
  const fingerprint = 'expired-ip-fingerprint';
  failureState.set(fingerprint, { count: 3, active: false });

  const result = await authenticateAdminUserWithDailyIpLimit(
    'admin@example.com',
    'wrong-password',
    fingerprint,
  );

  assert.deepEqual(result, { user: null, limited: false });
  assert.deepEqual(failureState.get(fingerprint), { count: 1, active: true });
});

test('login route and page report the daily IP-wide limit without an alternate auth path', async () => {
  const [route, page, usersDb] = await Promise.all([
    readFile(new URL('../app/admin/login/submit/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/login/page.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/admin-users-db.js', import.meta.url), 'utf8'),
  ]);

  assert.match(route, /authenticateAdminUserWithDailyIpLimit/);
  assert.match(route, /getClientIp/);
  assert.match(route, /limited \? 'limited' : 'invalid'/);
  assert.match(page, /Too many incorrect sign-in attempts from this network/);
  assert.doesNotMatch(usersDb, /export async function authenticateAdminUser\(/);
});
