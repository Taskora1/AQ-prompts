#!/usr/bin/env node
/**
 * Standalone network diagnostic — DNS / TCP / TLS timing for BOTH
 * the pooled and direct Neon hosts. No application queries, no secrets.
 *
 *   node scripts/network-tls-diagnostic.mjs
 */

import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';

// ── helpers ──────────────────────────────────────────────────────────────

function getHosts() {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!raw) throw new Error('No DATABASE_URL or POSTGRES_URL found in env');
  const u = new URL(raw);
  const pooled = u.hostname;
  const port = parseInt(u.port || '5432', 10);
  // Direct host = pooled host with "-pooler" removed
  const direct = pooled.replace(/-pooler/, '');
  return { pooled, direct, port };
}

function dnsLookup(host) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    dns.lookup(host, { all: true }, (err, addrs) => {
      if (err) return reject(err);
      resolve({ ms: Date.now() - t0, addresses: addrs.map(a => a.address) });
    });
  });
}

function tcpConnect(host, port) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const sock = net.connect({ host, port, timeout: 10_000 }, () => {
      const ms = Date.now() - t0;
      sock.destroy();
      resolve({ ms });
    });
    sock.on('timeout', () => { sock.destroy(); reject(new Error('TCP timeout 10 s')); });
    sock.on('error', reject);
  });
}

function tlsHandshake(host, port) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const sock = tls.connect({
      host,
      port,
      servername: host,
      rejectUnauthorized: false,
      timeout: 10_000,
    }, () => {
      const ms = Date.now() - t0;
      const proto = sock.getProtocol();
      const cipher = sock.getCipher()?.name;
      sock.destroy();
      resolve({ ms, protocol: proto, cipher });
    });
    sock.on('timeout', () => { sock.destroy(); reject(new Error('TLS handshake timeout 10 s')); });
    sock.on('error', reject);
  });
}

function stats(values) {
  if (!values.length) return { min: 'n/a', max: 'n/a', avg: 'n/a', ok: 0, total: 0 };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    ok: values.length,
    total: values.length,
  };
}

// ── test one host ────────────────────────────────────────────────────────

async function testHost(label, host, port) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}: ${host}:${port}`);
  console.log(`${'═'.repeat(60)}`);

  // DNS
  console.log('\n--- DNS lookup ---');
  let dnsMs = null;
  let dnsAddrs = [];
  try {
    const r = await dnsLookup(host);
    dnsMs = r.ms;
    dnsAddrs = r.addresses;
    console.log(`  ${r.ms}ms  [${r.addresses.join(', ')}]`);
  } catch (e) {
    console.error(`  FAILED: ${e.message}`);
  }

  // TCP ×5
  console.log('\n--- TCP connect (5 attempts) ---');
  const tcpTimes = [];
  for (let i = 1; i <= 5; i++) {
    try {
      const r = await tcpConnect(host, port);
      tcpTimes.push(r.ms);
      console.log(`  #${i}  ${r.ms}ms  OK`);
    } catch (e) {
      console.error(`  #${i}  FAILED: ${e.message}`);
    }
  }

  // TLS ×5
  console.log('\n--- TLS handshake (5 attempts) ---');
  const tlsTimes = [];
  let lastProtocol = '';
  for (let i = 1; i <= 5; i++) {
    try {
      const r = await tlsHandshake(host, port);
      tlsTimes.push(r.ms);
      lastProtocol = `${r.protocol} / ${r.cipher}`;
      console.log(`  #${i}  ${r.ms}ms  ${r.protocol} / ${r.cipher}`);
    } catch (e) {
      console.error(`  #${i}  FAILED: ${e.message}`);
    }
  }

  // Summary
  const tcpS = stats(tcpTimes);
  const tlsS = stats(tlsTimes);
  const totalAvg = (dnsMs ?? 0) + tcpS.avg + tlsS.avg;

  console.log(`\n--- Summary for ${label} ---`);
  console.log(`  DNS:   ${dnsMs !== null ? dnsMs + 'ms' : 'FAILED'}`);
  console.log(`  TCP:   ${tcpS.ok}/5  min=${tcpS.min}  max=${tcpS.max}  avg=${tcpS.avg}ms`);
  console.log(`  TLS:   ${tlsS.ok}/5  min=${tlsS.min}  max=${tlsS.max}  avg=${tlsS.avg}ms`);
  if (tlsTimes.length) console.log(`  TLS protocol: ${lastProtocol}`);
  console.log(`  EST total (DNS+TCP_avg+TLS_avg): ~${totalAvg}ms`);

  return { label, host, dnsMs, dnsAddrs, tcpTimes, tlsTimes, tcpStats: tcpS, tlsStats: tlsS };
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const { pooled, direct, port } = getHosts();

  console.log('=== Pooled vs Direct host diagnostic ===');
  console.log(`node=${process.version}  started=${new Date().toISOString()}`);
  console.log(`port=${port}  (no application query — network only)\n`);

  const pooledResult = await testHost('POOLED (connection-string host)', pooled, port);
  const directResult = await testHost('DIRECT (no -pooler suffix)', direct, port);

  // ── side-by-side comparison ──────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  SIDE-BY-SIDE COMPARISON');
  console.log(`${'═'.repeat(60)}`);

  const pad = (s, n) => String(s).padStart(n);
  const p = (label, pVal, dVal) => {
    console.log(`  ${label.padEnd(16)} POOLED  ${pad(pVal, 8)}   DIRECT  ${pad(dVal, 8)}`);
  };

  p('DNS', pooledResult.dnsMs !== null ? pooledResult.dnsMs + 'ms' : 'FAIL',
    directResult.dnsMs !== null ? directResult.dnsMs + 'ms' : 'FAIL');
  console.log('  ' + '-'.repeat(48));

  for (let i = 0; i < 5; i++) {
    const pt = pooledResult.tcpTimes[i];
    const dt = directResult.tcpTimes[i];
    p(`TCP #${i+1}`, pt !== undefined ? pt + 'ms' : 'FAIL',
      dt !== undefined ? dt + 'ms' : 'FAIL');
  }
  console.log('  ' + '-'.repeat(48));
  p('TCP avg', pooledResult.tcpStats.avg + 'ms', directResult.tcpStats.avg + 'ms');
  p('TCP min/max', `${pooledResult.tcpStats.min}/${pooledResult.tcpStats.max}`,
    `${directResult.tcpStats.min}/${directResult.tcpStats.max}`);
  console.log('  ' + '-'.repeat(48));

  for (let i = 0; i < 5; i++) {
    const pt = pooledResult.tlsTimes[i];
    const dt = directResult.tlsTimes[i];
    p(`TLS #${i+1}`, pt !== undefined ? pt + 'ms' : 'FAIL',
      dt !== undefined ? dt + 'ms' : 'FAIL');
  }
  console.log('  ' + '-'.repeat(48));
  p('TLS avg', pooledResult.tlsStats.avg + 'ms', directResult.tlsStats.avg + 'ms');
  p('TLS min/max', `${pooledResult.tlsStats.min}/${pooledResult.tlsStats.max}`,
    `${directResult.tlsStats.min}/${directResult.tlsStats.max}`);
  console.log('  ' + '-'.repeat(48));

  const pooledTotal = (pooledResult.dnsMs ?? 0) + pooledResult.tcpStats.avg + pooledResult.tlsStats.avg;
  const directTotal = (directResult.dnsMs ?? 0) + directResult.tcpStats.avg + directResult.tlsStats.avg;
  p('Est. total', '~' + pooledTotal + 'ms', '~' + directTotal + 'ms');

  // Verdict
  console.log('\n--- Verdict ---');
  if (directResult.tlsStats.avg < pooledResult.tlsStats.avg * 0.7) {
    console.log('  DIRECT host is significantly faster — pooler proxy adds latency.');
  } else if (pooledResult.tlsStats.avg < directResult.tlsStats.avg * 0.7) {
    console.log('  POOLED host is significantly faster — direct route is slower.');
  } else {
    console.log('  Both hosts show similar latency — pooler vs direct is not the primary factor.');
  }

  console.log('\n=== Done ===');
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
