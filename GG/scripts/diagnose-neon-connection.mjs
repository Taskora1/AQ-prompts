#!/usr/bin/env node
/**
 * Neon connection diagnostic.
 * Run: node scripts/diagnose-neon-connection.mjs
 *
 * Prints ONLY safe metadata. Never prints the connection string,
 * username, password, tokens, or full query string.
 *
 * Steps:
 *   1. Which env var provides the URL (name only)
 *   2. URL metadata: scheme, hostname, port, database, pooled/direct, sslmode
 *   3. DNS lookup of the hostname
 *   4. Raw TCP reachability (no TLS) with a 15s timeout
 *   5. SELECT 1 with the app's SSL config at 10s timeout
 *   6. SELECT 1 at 60s timeout (allows a cold Neon wake) — only if 10s failed
 *   7. Optional: SSL-required probe with ssl:false (15s) if TCP was OK but both SELECT 1 attempts failed
 */

import nextEnv from '@next/env';
import dns from 'node:dns/promises';
import net from 'node:net';
import pg from 'pg';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

const { getDatabaseUrl } = await import('../src/lib/db.js');

const APP_SSL = process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false };

function sourceVarName() {
  for (const name of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL']) {
    if (process.env[name]) return name;
  }
  return null;
}

function describeUrl(raw) {
  try {
    const url = new URL(raw);
    const hostname = url.hostname;
    const port = url.port || '5432';
    const database = url.pathname.replace(/^\//, '') || '(default)';
    return {
      hostname,
      port,
      database,
      isPooler: hostname.includes('-pooler'),
      scheme: url.protocol.replace(/:$/, ''),
      sslmode: url.searchParams.get('sslmode') || '(not set)',
      hasChannelBinding: url.searchParams.has('channel_binding'),
    };
  } catch (err) {
    return { parseError: err.message };
  }
}

function tcpCheck(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, detail });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, `TCP connect OK (host:port reachable)`));
    socket.once('timeout', () => finish(false, `TCP connect timed out after ${timeoutMs}ms`));
    socket.once('error', (err) => finish(false, `TCP connect error: ${err.code || err.message}`));
    socket.connect(Number(port), host);
  });
}

async function select1(connectionString, ssl, timeoutMs, label) {
  const pool = new pg.Pool({
    connectionString,
    ssl,
    connectionTimeoutMillis: timeoutMs,
    idleTimeoutMillis: 1000,
    max: 1,
  });
  const started = Date.now();
  try {
    await pool.query('SELECT 1 AS ok');
    console.log(`[DB] ${label}: SELECT 1 OK in ${Date.now() - started}ms`);
    return true;
  } catch (err) {
    console.log(
      `[DB] ${label}: FAILED after ${Date.now() - started}ms — ${err.name}: ${err.message}${err.code ? ` (code=${err.code})` : ''}`,
    );
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

function categorize({ dnsOk, tcp, s10, s60, sslOff }) {
  if (!dnsOk) return 'DNS / hostname resolution failure — the hostname does not resolve from this network.';
  if (!tcp.ok) return `Network / endpoint unreachable — ${tcp.detail}. Neon endpoint may be suspended or blocked by a firewall.`;
  if (s10 && s60) return 'Healthy — connected within 10s.';
  if (s60) return 'COLD START — connection succeeded only with a 60s timeout. Neon compute was waking up; 10s is too short for the first connection after idle.';
  if (sslOff && sslOff.ok) return 'SSL CONFIG — the server accepts connections without TLS (SELECT 1 with ssl:false succeeded). Verify Neon SSL settings.';
  if (sslOff && !sslOff.ok) return 'Endpoint/SSL/auth — TCP reachable but TLS startup or authentication fails on both SSL modes. Inspect the error messages above (auth/database/SSL).';
  return 'Endpoint/SSL/auth — TCP reachable but SELECT 1 failed at both timeouts. Inspect the error messages above.';
}

async function main() {
  console.log('=== Neon Connection Diagnostic ===\n');

  const varName = sourceVarName();
  if (!varName) {
    console.error('FAIL: no DATABASE_URL / POSTGRES_URL / POSTGRES_PRISMA_URL found in env.');
    process.exit(1);
  }
  console.log(`[ENV] connection string provided by: ${varName} (value never printed)`);

  const info = describeUrl(process.env[varName]);
  if (info.parseError) {
    console.error(`FAIL: connection string is not a valid URL: ${info.parseError}`);
    process.exit(1);
  }

  console.log(`[URL] scheme=${info.scheme}`);
  console.log(`[URL] hostname=${info.hostname}`);
  console.log(`[URL] port=${info.port}`);
  console.log(`[URL] database=${info.database}`);
  console.log(`[URL] endpoint type=${info.isPooler ? 'POOLED (hostname contains -pooler)' : 'DIRECT (hostname has no -pooler)'}`);
  console.log(`[URL] sslmode=${info.sslmode}  channel_binding param present=${info.hasChannelBinding}`);

  // 1) DNS
  console.log('\n-- DNS lookup --');
  let dnsOk = false;
  try {
    const addresses = await dns.lookup(info.hostname, { all: true });
    dnsOk = true;
    console.log(`[NET] DNS OK: ${addresses.map((a) => a.address).join(', ')}`);
  } catch (err) {
    console.log(`[NET] DNS FAILED: ${err.code || ''} ${err.message}`);
  }

  // 2) TCP
  console.log('\n-- TCP reachability (no TLS) --');
  const tcp = await tcpCheck(info.hostname, info.port, 15_000);
  console.log(`[NET] ${tcp.detail}`);

  // 3) SELECT 1 @ 10s
  console.log('\n-- SELECT 1 (app SSL config) --');
  const connectionString = getDatabaseUrl();
  const s10 = await select1(connectionString, APP_SSL, 10_000, '10s SELECT 1');

  // 4) SELECT 1 @ 60s (only if 10s failed)
  let s60 = s10;
  if (!s10) {
    console.log('\n-- SELECT 1 with 60s timeout (cold-wake allowance) --');
    s60 = await select1(connectionString, APP_SSL, 60_000, '60s SELECT 1');
  }

  // 5) SSL-required probe (only if TCP OK but both SELECT 1 attempts failed)
  let sslOff = null;
  if (tcp.ok && !s60) {
    console.log('\n-- SSL probe (ssl:false, 15s) --');
    sslOff = await select1(connectionString, false, 15_000, 'no-SSL probe');
  }

  console.log('\n=== Result ===');
  console.log(`DNS: ${dnsOk ? 'OK' : 'FAILED'}`);
  console.log(`TCP: ${tcp.ok ? 'OK' : 'FAILED'}`);
  console.log(`10s SELECT 1: ${s10 ? 'OK' : 'FAILED'}`);
  console.log(`60s SELECT 1: ${s10 ? 'skipped (10s already OK)' : s60 ? 'OK' : 'FAILED'}`);
  console.log(`No-SSL probe: ${sslOff === null ? 'skipped' : sslOff.ok ? 'OK (server does not require TLS)' : 'FAILED (server requires TLS)'}`);
  console.log(`\nCategory: ${categorize({ dnsOk, tcp, s10, s60, sslOff })}`);
  console.log('\nNext: check the Neon dashboard (project/compute/branch status) and confirm the connection string matches the pooled endpoint there.');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});