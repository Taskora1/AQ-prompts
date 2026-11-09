#!/usr/bin/env node
/**
 * TEMP diagnostic — standalone comparison for the home-page prompts query hang.
 *
 *   node scripts/diagnose-query-lifecycle.mjs
 *
 * Phases (all against the SAME DATABASE_URL as the app):
 *   1. pool.query(SQL)                — the original app path (fresh pool → first connect)
 *   2. pool.connect + client.query()  — explicit connect path
 *   3. raw new pg.Client + SELECT 1   — bare connect timing, no pool
 *   4. phase 2 repeated               — warm-path (idle reuse) steady-state timing
 *
 * Never logs DATABASE_URL or secrets. Error messages are sanitized.
 */

import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

import pg from 'pg';
import { getPgPool, getDatabaseUrl } from '../src/lib/db.js';

// Exact SQL used by queryPromptRows in src/lib/prompts-db.js.
const SQL = `
    SELECT
      p.id,
      p.title,
      p.prompt,
      p.slug,
      p.image,
      p.images,
      COALESCE(primary_category.name, p.category) AS category,
      COALESCE(assigned_categories.names, p.categories, '[]'::jsonb) AS categories,
      p.use_case AS "useCase",
      p.tags,
      p.faqs,
      p.status,
      p.primary_category_id AS "primaryCategoryId",
      primary_category.slug AS "primaryCategorySlug",
      COALESCE(assigned_categories.ids, '[]'::jsonb) AS "categoryIds",
      COALESCE(assigned_categories.slugs, '[]'::jsonb) AS "categorySlugs",
      p.meta_title AS "metaTitle",
      p.meta_description AS "metaDescription",
      p.og_image AS "ogImage",
      p.related_prompt_ids AS "relatedPromptIds",
      p.prompt_breakdown AS "promptBreakdown",
      p.prompt_specific_troubleshooting AS "promptSpecificTroubleshooting",
      p.created_at::text AS "createdAt",
      p.intro,
      p.unique_feature AS "uniqueFeature",
      p.best_use_case AS "bestUseCase",
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
    ORDER BY p.id
  `;

/** Strip any postgres://... credentials that leak into error text. */
function sanitize(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[DATABASE_URL redacted]');
}

function log(label, msg) {
  console.log(`[LIFECYCLE] ${label}: ${msg}`);
}

async function phase1PoolQuery(pool) {
  log('phase1', 'pool.query(SQL) — original app path (fresh pool → first connect)');
  const t0 = Date.now();
  try {
    const res = await pool.query({ text: SQL });
    log('phase1', `RESOLVED in ${Date.now() - t0}ms rows=${res.rowCount}`);
  } catch (err) {
    log('phase1', `REJECTED in ${Date.now() - t0}ms — ${sanitize(err?.message || '')} (${err?.code || ''})`);
  }
}

async function phase2ExplicitClient(pool, label) {
  log(label, 'pool.connect + client.query(callback) — instrumented app path');
  const t0 = Date.now();
  const client = await pool.connect();
  log(label, `acquired in ${Date.now() - t0}ms pid=${client.processID ?? 'n/a'}`);
  await new Promise((resolve, reject) => {
    client.query({ text: SQL }, (err, res) => {
      const ms = Date.now() - t0;
      log(label, `query CALLBACK at +${ms}ms err=${err ? sanitize(err?.message || '') : 'none'} rows=${res ? res.rowCount : 'n/a'}`);
      if (err) reject(err); else resolve(res);
    });
  });
  client.release();
  log(label, `complete in ${Date.now() - t0}ms`);
}

async function phase3RawClient() {
  log('phase3', 'raw new pg.Client + SELECT 1 — bare connect, no pool (10s budget, same as app)');
  const t0 = Date.now();
  const client = new pg.Client({
    connectionString: getDatabaseUrl(),
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });
  try {
    await client.connect();
    log('phase3', `connected in ${Date.now() - t0}ms (auth done)`);
    const startQ = Date.now();
    const res = await client.query('SELECT 1 AS ok');
    log('phase3', `SELECT 1 in ${Date.now() - startQ}ms rows=${res.rowCount}`);
  } catch (err) {
    log('phase3', `FAILED in ${Date.now() - t0}ms — ${sanitize(err?.message || '')} (${err?.code || ''})`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  console.log('=== query lifecycle diagnostic (standalone Node) ===');
  console.log(`node=${process.version} started=${new Date().toISOString()}`);

  const pool = getPgPool();
  await phase1PoolQuery(pool);
  await phase2ExplicitClient(pool, 'phase2');
  await phase3RawClient();
  await phase2ExplicitClient(pool, 'phase4-warm');

  console.log('\n=== Done — closing pool ===');
  await pool.end();
}

main().catch((err) => {
  console.error('Unhandled error:', sanitize(err?.message || err));
  process.exit(1);
});
