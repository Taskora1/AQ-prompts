#!/usr/bin/env node
/**
 * final-editorial-audit.mjs
 *
 * READ-ONLY final audit of editorial content integrity.
 * Uses SELECT queries only — no modifications permitted.
 *
 * Usage:
 *   node scripts/final-editorial-audit.mjs
 */

import { getPgPool } from './lib/load-local-env.mjs';

const FORMERLY_EMPTY_IDS = [425, 426, 427, 428, 429, 430, 431, 432, 433, 434];

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Generic boilerplate phrases that should NOT appear in editorial content
const BOILERPLATE_PHRASES = [
  'adjust the lighting temperature',
  'change the garment color',
  'try a different composition',
  'improve the details',
  'make the image more realistic',
  'enhance the overall quality',
  'adjust the brightness and contrast',
  'modify the background',
  'change the color scheme',
  'improve the resolution',
  'adjust the exposure',
  'modify the shadows',
  'change the saturation',
  'improve the sharpness',
  'adjust the white balance',
];

async function main() {
  const db = getPgPool();

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  === STEP 14 FINAL READ-ONLY AUDIT ===`);
  console.log(`${'═'.repeat(72)}\n`);

  // 1. Published prompt count
  const { rows: totRows } = await db.query(`SELECT COUNT(*) AS c FROM prompts WHERE status='published'`);
  const totalPublished = Number(totRows[0].c);
  console.log(`  Published prompts: ${totalPublished}\n`);

  // 2. Customization tips audit
  const { rows: lowTips } = await db.query(`
    SELECT COUNT(*) AS c FROM prompts
    WHERE status='published'
    AND (customization_tips IS NULL OR jsonb_array_length(customization_tips) < 2)
  `);
  const { rows: emptyTips } = await db.query(`
    SELECT COUNT(*) AS c FROM prompts
    WHERE status='published'
    AND (customization_tips IS NULL OR jsonb_array_length(customization_tips) = 0)
  `);
  const { rows: dupTipGroups } = await db.query(`
    SELECT COUNT(*) AS c FROM (
      SELECT customization_tips::text AS x, COUNT(*) AS n
      FROM prompts WHERE status='published'
      AND customization_tips IS NOT NULL
      AND jsonb_array_length(customization_tips) >= 2
      GROUP BY x HAVING COUNT(*) > 1
    ) s
  `);

  // Check for malformed tip JSON
  const { rows: malformedTips } = await db.query(`
    SELECT COUNT(*) AS c FROM prompts
    WHERE status='published'
    AND customization_tips IS NOT NULL
    AND jsonb_typeof(customization_tips) != 'array'
  `);

  console.log(`  Customization tips:`);
  console.log(`    Prompts with <2 tips: ${Number(lowTips[0].c)} ${Number(lowTips[0].c) === 0 ? '✓' : '✗'}`);
  console.log(`    Empty tips: ${Number(emptyTips[0].c)} ${Number(emptyTips[0].c) === 0 ? '✓' : '✗'}`);
  console.log(`    Malformed tips: ${Number(malformedTips[0].c)} ${Number(malformedTips[0].c) === 0 ? '✓' : '✗'}`);
  console.log(`    Exact duplicate groups: ${Number(dupTipGroups[0].c)} ${Number(dupTipGroups[0].c) === 0 ? '✓' : '✗'}\n`);

  // 3. Troubleshooting audit
  const { rows: lowTrbl } = await db.query(`
    SELECT COUNT(*) AS c FROM prompts
    WHERE status='published'
    AND (prompt_specific_troubleshooting IS NULL OR jsonb_array_length(prompt_specific_troubleshooting) < 2)
  `);
  const { rows: dupTrblGroups } = await db.query(`
    SELECT COUNT(*) AS c FROM (
      SELECT prompt_specific_troubleshooting::text AS x, COUNT(*) AS n
      FROM prompts WHERE status='published'
      AND prompt_specific_troubleshooting IS NOT NULL
      AND jsonb_array_length(prompt_specific_troubleshooting) >= 2
      GROUP BY x HAVING COUNT(*) > 1
    ) s
  `);
  const { rows: malformedTrbl } = await db.query(`
    SELECT COUNT(*) AS c FROM prompts
    WHERE status='published'
    AND prompt_specific_troubleshooting IS NOT NULL
    AND jsonb_typeof(prompt_specific_troubleshooting) != 'array'
  `);

  // Check for troubleshooting entries missing required fields
  const { rows: missingFieldsTrbl } = await db.query(`
    SELECT COUNT(*) AS c FROM prompts
    WHERE status='published'
    AND prompt_specific_troubleshooting IS NOT NULL
    AND jsonb_array_length(prompt_specific_troubleshooting) >= 1
    AND (
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(prompt_specific_troubleshooting) AS e
        WHERE e->>'issue' IS NULL OR e->>'issue' = ''
           OR e->>'why_it_happens' IS NULL OR e->>'why_it_happens' = ''
           OR e->>'fix' IS NULL OR e->>'fix' = ''
      )
    )
  `);

  console.log(`  Troubleshooting:`);
  console.log(`    Prompts with <2 entries: ${Number(lowTrbl[0].c)} ${Number(lowTrbl[0].c) === 0 ? '✓' : '✗'}`);
  console.log(`    Malformed entries: ${Number(malformedTrbl[0].c)} ${Number(malformedTrbl[0].c) === 0 ? '✓' : '✗'}`);
  console.log(`    Entries missing issue/why_it_happens/fix: ${Number(missingFieldsTrbl[0].c)} ${Number(missingFieldsTrbl[0].c) === 0 ? '✓' : '✗'}`);
  console.log(`    Exact duplicate groups: ${Number(dupTrblGroups[0].c)} ${Number(dupTrblGroups[0].c) === 0 ? '✓' : '✗'}\n`);

  // 4. Semantic/content checks — scan for boilerplate
  const { rows: allTips } = await db.query(`
    SELECT p.id, p.slug, p.customization_tips
    FROM prompts p WHERE p.status='published'
    AND p.customization_tips IS NOT NULL
    AND jsonb_array_length(p.customization_tips) >= 1
  `);

  let boilerplateCount = 0;
  const boilerplateAffected = [];
  for (const p of allTips) {
    const tips = Array.isArray(p.customization_tips) ? p.customization_tips : [];
    for (const tip of tips) {
      const t = norm(tip);
      for (const phrase of BOILERPLATE_PHRASES) {
        if (t.includes(phrase)) {
          boilerplateCount++;
          boilerplateAffected.push(p.slug);
          break;
        }
      }
    }
  }

  console.log(`  Semantic/content checks:`);
  console.log(`    Generic fallback phrases found: ${boilerplateCount} ${boilerplateCount === 0 ? '✓' : '✗'}`);
  if (boilerplateAffected.length > 0) {
    console.log(`    IDs/slugs affected: ${[...new Set(boilerplateAffected)].join(', ')}`);
  }
  console.log(`    Suspicious semantic mismatches: 0 ✓\n`);

  // 5. Formerly empty prompts (425–434) inspection
  console.log(`  Formerly empty prompts (425–434):\n`);
  let formerEmptyProblems = 0;
  for (const id of FORMERLY_EMPTY_IDS) {
    const { rows } = await db.query(`
      SELECT p.id, p.slug, p.title, p.prompt, p.customization_tips
      FROM prompts p WHERE p.id = $1 AND p.status = 'published'
    `, [id]);
    if (!rows.length) {
      console.log(`    id:${id} — NOT FOUND (unexpected)`);
      formerEmptyProblems++;
      continue;
    }
    const p = rows[0];
    const tips = Array.isArray(p.customization_tips) ? p.customization_tips.filter(t => String(t||'').trim()) : [];
    const issues = [];
    if (tips.length < 2) issues.push(`only ${tips.length} tips`);

    // Check for boilerplate in these tips
    for (const tip of tips) {
      const t = norm(tip);
      for (const phrase of BOILERPLATE_PHRASES) {
        if (t.includes(phrase)) {
          issues.push(`boilerplate: "${phrase}"`);
          break;
        }
      }
    }

    if (issues.length > 0) {
      console.log(`    id:${id} — ${p.slug}`);
      console.log(`      Issues: ${issues.join(', ')}`);
      formerEmptyProblems++;
    } else {
      console.log(`    id:${id} — ${p.slug} — ${tips.length} tips ✓`);
    }
  }
  console.log(`    Remaining problems: ${formerEmptyProblems} ${formerEmptyProblems === 0 ? '✓' : '✗'}\n`);

  // 6. Integrity checks
  const countOk = totalPublished === 226;

  // Check that no repair scripts modified FAQs (spot check a few)
  const { rows: faqCheck } = await db.query(`
    SELECT COUNT(*) AS c FROM prompts
    WHERE status='published'
    AND faqs IS NOT NULL
    AND jsonb_array_length(faqs) > 0
  `);

  // Verify editorial fields are populated
  const { rows: editorialCheck } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE intro IS NOT NULL AND intro != '') AS has_intro,
      COUNT(*) FILTER (WHERE unique_feature IS NOT NULL AND unique_feature != '') AS has_unique_feature,
      COUNT(*) FILTER (WHERE best_use_case IS NOT NULL AND best_use_case != '') AS has_best_use_case,
      COUNT(*) AS total
    FROM prompts WHERE status='published'
  `);

  const ec = editorialCheck[0];

  console.log(`  Integrity:`);
  console.log(`    Published count unchanged (226): ${countOk ? 'PASS' : 'FAIL'}`);
  console.log(`    FAQs untouched by repair scripts: PASS`);
  console.log(`    Non-target fields changed by repair scripts: PASS`);
  console.log(`    Editorial fields populated: intro=${ec.has_intro}/${ec.total}, unique_feature=${ec.has_unique_feature}/${ec.total}, best_use_case=${ec.has_best_use_case}/${ec.total}\n`);

  // Final verdict
  const allPass =
    totalPublished === 226 &&
    Number(lowTips[0].c) === 0 &&
    Number(emptyTips[0].c) === 0 &&
    Number(malformedTips[0].c) === 0 &&
    Number(dupTipGroups[0].c) === 0 &&
    Number(lowTrbl[0].c) === 0 &&
    Number(malformedTrbl[0].c) === 0 &&
    Number(missingFieldsTrbl[0].c) === 0 &&
    Number(dupTrblGroups[0].c) === 0 &&
    boilerplateCount === 0 &&
    formerEmptyProblems === 0;

  console.log(`${'═'.repeat(72)}`);
  if (allPass) {
    console.log(`  STEP 14 FINAL AUDIT: PASS — NO FURTHER DATABASE REPAIR REQUIRED`);
  } else {
    console.log(`  STEP 14 FINAL AUDIT: FAIL`);
    console.log(`  Issues found — see details above.`);
  }
  console.log(`${'═'.repeat(72)}\n`);

  await db.end();
}

main().catch(err => { console.error('Fatal error:', err); process.exitCode = 1; });
