#!/usr/bin/env node
/**
 * TEMP diagnostic — slow home-page prompts query on Neon (DO NOT leave in repo).
 *
 * Usage (from project root):
 *   node scripts/diagnose-slow-query.mjs          # all 7 diagnostics (query 2 EXPLAIN ANALYZE
 *                                                 #   executes the real query: 3-13 min)
 *   node scripts/diagnose-slow-query.mjs fast     # skip the long query 2 (runs 1,3,4,5,6,7)
 *   node scripts/diagnose-slow-query.mjs watch    # poll pg_stat_activity (5,6,7) every 5s
 *                                                 #   until Ctrl+C — run this WHILE the app
 *                                                 #   request or query 2 is executing
 *
 * Never logs DATABASE_URL, passwords, or secrets. Error messages are sanitized.
 */

import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

import { getPgPool } from '../src/lib/db.js';

// ─── Queries (verbatim from the investigation plan) ───────────────────────────

const Q1_STATS = `
SELECT relname, n_live_tup, n_dead_tup,
       pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_stat_user_tables
WHERE relname IN ('prompts','categories','prompt_categories');
`;

const Q2_EXPLAIN_FULL = `
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT
  p.id, p.title, p.prompt, p.slug, p.image, p.images,
  COALESCE(primary_category.name, p.category) AS category,
  COALESCE(assigned_categories.names, p.categories, '[]'::jsonb) AS categories,
  p.use_case AS "useCase", p.tags, p.faqs, p.status,
  p.primary_category_id AS "primaryCategoryId",
  primary_category.slug AS "primaryCategorySlug",
  COALESCE(assigned_categories.ids, '[]'::jsonb) AS "categoryIds",
  COALESCE(assigned_categories.slugs, '[]'::jsonb) AS "categorySlugs",
  p.meta_title AS "metaTitle", p.meta_description AS "metaDescription",
  p.og_image AS "ogImage", p.related_prompt_ids AS "relatedPromptIds",
  p.prompt_breakdown AS "promptBreakdown",
  p.prompt_specific_troubleshooting AS "promptSpecificTroubleshooting",
  p.created_at::text AS "createdAt", p.intro,
  p.unique_feature AS "uniqueFeature", p.best_use_case AS "bestUseCase",
  p.updated_at::text AS "updatedAt",
  p.customization_tips AS "customizationTips",
  p.recommended_aspect_ratio AS "recommendedAspectRatio",
  p.aspect_ratio_reason AS "aspectRatioReason",
  p.reviewed_at::text AS "reviewedAt",
  p.generation_tested AS "generationTested",
  p.generation_tested_date::text AS "generationTestedDate",
  p.generation_tested_tool AS "generationTestedTool",
  p.image_alt_texts AS "imageAltTexts"
FROM prompts p
LEFT JOIN categories primary_category
  ON primary_category.id = p.primary_category_id
LEFT JOIN LATERAL (
  SELECT
    JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names,
    JSONB_AGG(c.id ORDER BY pc.position, c.id) AS ids,
    JSONB_AGG(c.slug ORDER BY pc.position, c.id) AS slugs
  FROM prompt_categories pc
  JOIN categories c ON c.id = pc.category_id
  WHERE pc.prompt_id = p.id
) assigned_categories ON true
WHERE p.status = 'published'
ORDER BY p.id;
`;

const Q3_BASE = `
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.status
FROM prompts p
WHERE p.status = 'published'
ORDER BY p.id;
`;

const Q4_LATERAL = `
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  pc.prompt_id,
  JSONB_AGG(c.name ORDER BY pc.position, c.id),
  JSONB_AGG(c.id ORDER BY pc.position, c.id),
  JSONB_AGG(c.slug ORDER BY pc.position, c.id)
FROM prompt_categories pc
JOIN categories c ON c.id = pc.category_id
GROUP BY pc.prompt_id;
`;

const Q5_ACTIVITY = `
SELECT
  pid,
  usename,
  state,
  wait_event_type,
  wait_event,
  now() - query_start AS query_age,
  left(query, 200) AS query
FROM pg_stat_activity
WHERE datname = current_database()
  AND state <> 'idle'
  AND pid <> pg_backend_pid()
ORDER BY query_start;
`;

const Q6_BLOCKERS = `
SELECT
  pid,
  pg_blocking_pids(pid) AS blocked_by,
  left(query, 200) AS query
FROM pg_stat_activity
WHERE state <> 'idle'
  AND pid <> pg_backend_pid()
  AND cardinality(pg_blocking_pids(pid)) > 0;
`;

const Q7_CENSUS = `
SELECT state, count(*)
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY state;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip any postgres://... credentials that leak into error text. */
function sanitize(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[DATABASE_URL redacted]');
}

function printPlan(rows) {
  for (const row of rows) {
    const line = Object.values(row)[0];
    console.log(line);
  }
}

function printTable(rows) {
  if (!rows.length) {
    console.log('(no rows)');
    return;
  }
  const cols = Object.keys(rows[0]);
  const widths = cols.map((col) =>
    Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length)),
  );
  const fmt = (r) =>
    cols.map((col, i) => String(r[col] ?? '').padEnd(widths[i])).join('  |  ');
  console.log(fmt(Object.fromEntries(cols.map((c) => [c, c]))));
  console.log(cols.map((_, i) => '-'.repeat(widths[i])).join('--+--'));
  for (const r of rows) console.log(fmt(r));
}

async function runQuery(label, sql, { print = printTable } = {}) {
  const pool = getPgPool();
  console.log(`\n===== ${label} — started ${new Date().toISOString()} =====`);
  const start = Date.now();
  try {
    const result = await pool.query(sql);
    const ms = Date.now() - start;
    console.log(`----- result (${ms}ms, ${result.rows.length} row(s)) -----`);
    print(result.rows);
    console.log(`----- end ${label} (${ms}ms) -----`);
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`ERROR after ${ms}ms — ${err?.name || ''}: ${sanitize(err?.message || '')} (code=${err?.code || ''})`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Modes ────────────────────────────────────────────────────────────────────

async function watchActivity() {
  console.log('Polling pg_stat_activity (queries 5,6,7) every 5s — press Ctrl+C to stop.\n');
  let round = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    round += 1;
    console.log(`\n──────── snapshot #${round} @ ${new Date().toISOString()} ────────`);
    await runQuery('5) active queries/waits', Q5_ACTIVITY);
    await runQuery('6) blockers', Q6_BLOCKERS);
    await runQuery('7) connection census', Q7_CENSUS);
    await sleep(5000);
  }
}

async function main() {
  const mode = process.argv[2] || 'all';
  const pool = getPgPool();

  console.log('=== Neon slow-query diagnostics ===');
  console.log(`mode=${mode}  started=${new Date().toISOString()}`);
  console.log('(db.js TEMP-DEBUG pool events will also print below — expected)');

  if (mode === 'watch') {
    process.on('SIGINT', async () => {
      console.log('\nStopping watch — closing pool…');
      await pool.end();
      process.exit(0);
    });
    await watchActivity();
    return;
  }

  const fast = mode === 'fast';
  console.log(fast ? '(fast mode: skipping long query 2)' : '(full mode: query 2 EXPLAIN ANALYZE executes the real query — expect 3-13 min)');

  // Fast diagnostics first (1, 3, 4) — cheap, immediate signal.
  await runQuery('1) table stats / bloat', Q1_STATS);
  await runQuery('3) base prompts query EXPLAIN', Q3_BASE, { print: printPlan });
  await runQuery('4) LATERAL aggregation standalone EXPLAIN', Q4_LATERAL, { print: printPlan });

  if (!fast) {
    // Long one: full production query EXPLAIN (ANALYZE, BUFFERS, VERBOSE).
    // Tip: while this runs, open a second terminal and run:
    //   node scripts/diagnose-slow-query.mjs watch
    await runQuery('2) FULL PRODUCTION QUERY EXPLAIN (ANALYZE, BUFFERS, VERBOSE)', Q2_EXPLAIN_FULL, { print: printPlan });
  }

  // Post-hoc activity snapshots (best evidence comes from `watch` during the run).
  await runQuery('5) active queries/waits', Q5_ACTIVITY);
  await runQuery('6) blockers', Q6_BLOCKERS);
  await runQuery('7) connection census', Q7_CENSUS);

  console.log('\n=== Done ===');
  await pool.end();
}

main().catch((err) => {
  console.error('Unhandled error:', sanitize(err?.message || err));
  process.exit(1);
});