#!/usr/bin/env node
/**
 * Standalone diagnostic — compare connection & query latency across:
 *   A) Standard node-postgres (pg.Pool) over TCP port 5432
 *   B) Neon serverless driver over HTTPS port 443 (fetch-based)
 *   C) Neon serverless driver over WSS port 443 (WebSocket)
 *
 *   node scripts/test-neon-serverless-http.mjs
 *
 * Prerequisites:  npm install @neondatabase/serverless ws
 */

import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

import pg from 'pg';
import { neon, Pool as NeonPool } from '@neondatabase/serverless';

// ── env helpers (no secrets printed) ─────────────────────────────────────

function getDatabaseUrl() {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!raw) throw new Error('No DATABASE_URL / POSTGRES_URL / POSTGRES_PRISMA_URL in env');
  try {
    const u = new URL(raw);
    u.searchParams.delete('channel_binding');
    return u.toString();
  } catch {
    return raw;
  }
}

function maskHost(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '5432'}`;
  } catch {
    return '(parse failed)';
  }
}

const ATTEMPTS = 5;
const SQL = 'SELECT 1 AS ok';

// ── helpers ──────────────────────────────────────────────────────────────

function stats(values) {
  if (!values.length) return { min: '-', max: '-', avg: '-' };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  };
}

// ── Approach A: standard pg.Pool (TCP 5432) ─────────────────────────────

async function approachA(url) {
  const pool = new pg.Pool({
    connectionString: url,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15_000,
  });

  const results = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    const t0 = Date.now();
    try {
      const res = await pool.query(SQL);
      results.push({ ms: Date.now() - t0, ok: true, rows: res.rowCount });
    } catch (err) {
      results.push({ ms: Date.now() - t0, ok: false, error: err.message });
    }
  }
  await pool.end().catch(() => {});
  return results;
}

// ── Approach B: Neon HTTP (fetch-based, HTTPS 443) ──────────────────────

async function approachB(url) {
  const sql = neon(url, { fullResults: true });

  const results = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    const t0 = Date.now();
    try {
      const res = await sql(SQL);
      results.push({ ms: Date.now() - t0, ok: true, rows: res.rowCount });
    } catch (err) {
      results.push({ ms: Date.now() - t0, ok: false, error: err.message });
    }
  }
  return results;
}

// ── Approach C: Neon WebSocket (WSS 443) ────────────────────────────────

async function approachC(url) {
  // In Node.js the serverless driver needs the `ws` WebSocket constructor
  // registered globally. It ships a Node adapter that handles this.
  let wsModule;
  try {
    wsModule = await import('ws');
  } catch {
    // If `ws` is not installed, the Neon driver may still work with Node's
    // built-in WebSocket (Node ≥ 22) — but the Pool over WSS requires ws.
  }

  const pool = new NeonPool({
    connectionString: url,
    // Neon serverless pool negotiates WSS automatically
    ...(wsModule?.default ? { webSocketConstructor: wsModule.default } : {}),
  });

  const results = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    const t0 = Date.now();
    try {
      const client = await pool.connect();
      try {
        const res = await client.query(SQL);
        results.push({ ms: Date.now() - t0, ok: true, rows: res.rowCount });
      } finally {
        client.release();
      }
    } catch (err) {
      results.push({ ms: Date.now() - t0, ok: false, error: err.message });
    }
  }
  await pool.end().catch(() => {});
  return results;
}

// ── table rendering ──────────────────────────────────────────────────────

function printTable(label, results) {
  console.log(`\n  ${label}`);
  console.log('  ' + '-'.repeat(40));
  let okCount = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.ok) {
      okCount++;
      console.log(`    #${i + 1}  ${String(r.ms).padStart(6)}ms  OK  rows=${r.rows}`);
    } else {
      console.log(`    #${i + 1}  ${String(r.ms).padStart(6)}ms  FAIL  ${r.error}`);
    }
  }
  const okMs = results.filter(r => r.ok).map(r => r.ms);
  const s = stats(okMs);
  console.log(`  ` + '-'.repeat(40));
  console.log(`    OK: ${okCount}/${results.length}   min=${s.min}ms  max=${s.max}ms  avg=${s.avg}ms`);
  return { okCount, total: results.length, ...s, values: okMs };
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const url = getDatabaseUrl();
  const host = maskHost(url);

  console.log('=== Neon connection-method latency diagnostic ===');
  console.log(`node=${process.version}  started=${new Date().toISOString()}`);
  console.log(`host=${host}  attempts=${ATTEMPTS}  query="${SQL}"`);
  console.log('(no secrets logged)\n');

  // ── A: standard pg ──
  console.log('[A] Standard pg.Pool (TCP 5432)');
  const a = await approachA(url);
  const sa = printTable('Standard pg.Pool — per-attempt:', a);

  // ── B: Neon HTTP ──
  console.log('\n[B] Neon HTTP (fetch, HTTPS 443)');
  const b = await approachB(url);
  const sb = printTable('Neon HTTP — per-attempt:', b);

  // ── C: Neon WebSocket ──
  console.log('\n[C] Neon WebSocket (WSS 443)');
  let sc;
  try {
    const c = await approachC(url);
    sc = printTable('Neon WebSocket — per-attempt:', c);
  } catch (err) {
    console.error(`  Neon WebSocket init FAILED: ${err.message}`);
    sc = { okCount: 0, total: 0, min: '-', max: '-', avg: '-', values: [] };
  }

  // ── side-by-side summary ──
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  SIDE-BY-SIDE SUMMARY');
  console.log(`${'═'.repeat(60)}`);

  const pad = (s, n) => String(s).padStart(n);
  const row = (label, aV, bV, cV) => {
    console.log(`  ${label.padEnd(16)} pg/TCP ${pad(aV, 8)}  HTTP ${pad(bV, 8)}  WSS  ${pad(cV, 8)}`);
  };

  row('OK count', `${sa.okCount}/${sa.total}`, `${sb.okCount}/${sb.total}`, `${sc.okCount}/${sc.total}`);
  console.log('  ' + '-'.repeat(56));
  row('Min', sa.min, sb.min, sc.min);
  row('Max', sa.max, sb.max, sc.max);
  row('Avg', sa.avg, sb.avg, sc.avg);
  console.log('  ' + '-'.repeat(56));

  // Per-attempt comparison
  for (let i = 0; i < ATTEMPTS; i++) {
    const aMs = a[i]?.ok ? a[i].ms : 'FAIL';
    const bMs = b[i]?.ok ? b[i].ms : 'FAIL';
    const cMs = c[i]?.ok ? c[i].ms : 'FAIL';
    row(`Attempt #${i + 1}`, aMs, bMs, cMs);
  }

  // ── verdict ──
  console.log('\n--- Verdict ---');
  const httpAvg = typeof sb.avg === 'number' ? sb.avg : Infinity;
  const pgAvg = typeof sa.avg === 'number' ? sa.avg : Infinity;
  const wssAvg = typeof sc.avg === 'number' ? sc.avg : Infinity;

  if (httpAvg < pgAvg && httpAvg < wssAvg && httpAvg < Infinity) {
    console.log(`  Neon HTTP (avg ${httpAvg}ms) is the fastest — bypasses TCP/TLS overhead.`);
  } else if (wssAvg < pgAvg && wssAvg < httpAvg && wssAvg < Infinity) {
    console.log(`  Neon WebSocket (avg ${wssAvg}ms) is the fastest — connection reuse wins.`);
  } else if (pgAvg <= httpAvg && pgAvg <= wssAvg && pgAvg < Infinity) {
    console.log(`  Standard pg (avg ${pgAvg}ms) is the fastest — direct TCP connection wins.`);
  } else {
    console.log('  No clear winner — all methods show similar or failing latency.');
  }

  if (pgAvg > 2000 && httpAvg < pgAvg) {
    console.log(`  Recommendation: consider migrating the homepage query to Neon HTTP`);
    console.log(`  (avg ${httpAvg}ms vs pg avg ${pgAvg}ms — ${(pgAvg - httpAvg)}ms faster).`);
  }

  console.log('\n=== Done ===');
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
