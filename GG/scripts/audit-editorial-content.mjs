#!/usr/bin/env node

/**
 * READ-ONLY editorial content audit.
 *
 * Queries the Neon database for all published prompts and reports:
 *   - Completeness of editorial fields
 *   - Exact duplicate customization tips
 *   - Exact duplicate troubleshooting entries
 *   - Near-duplicate detection (conservative)
 *   - Prompts that would trigger frontend regex fallback
 *
 * SAFETY: This script contains ZERO write queries.
 *         Every database call is SELECT-only.
 */

import { getPgPool } from './lib/load-local-env.mjs';

/* ─── helpers ──────────────────────────────────────────────────────── */

function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function pct(n, total) {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function short(s, max = 120) {
  const t = String(s || '').trim();
  return t.length <= max ? t : t.slice(0, max - 3) + '...';
}

/* similarity: simple Levenshtein-based ratio */
function editDistance(a, b) {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[la][lb];
}

function similarity(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - editDistance(na, nb) / maxLen;
}

/* ─── frontend fallback logic (extracted from PromptPages.jsx) ──────── */

const FALLBACK_PATTERNS = [
  { name: 'reference/identity', re: /reference|identity|same face|facial/ },
  { name: 'fashion/outfit',    re: /fashion|outfit|shirt|dress|suit|jacket|kurta|sweater|trousers/ },
  { name: 'couple/multi',      re: /couple|two people|pair|duo/ },
  { name: 'poster/text',       re: /poster|text|username|word|logo|magazine|typography/ },
  { name: 'setting/background', re: /beach|street|cafe|office|hotel|garden|city|studio|background|rooftop|coastal/ },
  { name: 'lighting',          re: /golden hour|neon|rim light|window light|studio light|chiaroscuro|lighting/ },
  { name: 'portrait/face',     re: /portrait|headshot|selfie|face/ },
];

function matchedPatterns(prompt) {
  const source = [
    prompt.title, prompt.prompt, prompt.intro,
    prompt.best_use_case || prompt.bestUseCase,
    ...(Array.isArray(prompt.tags) ? prompt.tags : []),
  ].join(' ').toLowerCase();
  return FALLBACK_PATTERNS.filter(p => p.re.test(source)).map(p => p.name);
}

/* ─── main ─────────────────────────────────────────────────────────── */

async function main() {
  const db = getPgPool();

  /* ── 1. fetch all published prompts ── */
  const { rows: prompts } = await db.query(`
    SELECT
      p.id,
      p.title,
      p.slug,
      p.prompt,
      p.intro,
      p.tags,
      p.status,
      p.customization_tips,
      p.prompt_specific_troubleshooting,
      p.faqs,
      p.prompt_breakdown,
      p.recommended_aspect_ratio,
      p.aspect_ratio_reason,
      p.reviewed_at::text    AS reviewed_at,
      p.generation_tested,
      p.best_use_case        AS "bestUseCase"
    FROM prompts p
    WHERE p.status = 'published'
    ORDER BY p.id
  `);

  const total = prompts.length;
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  EDITORIAL CONTENT AUDIT — ${total} published prompts`);
  console.log(`${'═'.repeat(72)}\n`);

  /* ═══════════════════════════════════════════════════════════════════
     TASK 1 — Completeness
     ═══════════════════════════════════════════════════════════════════ */

  let tips0 = 0, tipsLT2 = 0;
  let trbl0 = 0, trblLT2 = 0;
  let faq0 = 0;
  let reviewedMissing = 0;
  let aspectReasonMissing = 0;
  let breakdownMissing = 0;
  let genTestedFalse = 0;

  for (const p of prompts) {
    const tips = Array.isArray(p.customization_tips) ? p.customization_tips.filter(t => String(t || '').trim()) : [];
    const trbl = Array.isArray(p.prompt_specific_troubleshooting) ? p.prompt_specific_troubleshooting.filter(e => e && e.issue && e.fix) : [];
    const faqs = Array.isArray(p.faqs) ? p.faqs.filter(f => f && f.question && f.answer) : [];

    if (tips.length === 0) tips0++;
    if (tips.length < 2) tipsLT2++;
    if (trbl.length === 0) trbl0++;
    if (trbl.length < 2) trblLT2++;
    if (faqs.length === 0) faq0++;
    if (!p.reviewed_at) reviewedMissing++;
    if (!p.aspect_ratio_reason) aspectReasonMissing++;
    if (!p.prompt_breakdown) breakdownMissing++;
    if (!p.generation_tested) genTestedFalse++;
  }

  console.log('A. EDITORIAL COMPLETENESS\n');
  const compTable = [
    ['Field', 'Complete', 'Missing / <2', '% Complete'],
    ['─'.repeat(32), '─'.repeat(10), '─'.repeat(12), '─'.repeat(12)],
    ['customization_tips ≥ 2',      `${total - tipsLT2}`,  `${tipsLT2}`,  pct(total - tipsLT2, total)],
    ['customization_tips = 0',       `${total - tips0}`,   `${tips0}`,    pct(total - tips0, total)],
    ['troubleshooting ≥ 2',          `${total - trblLT2}`, `${trblLT2}`, pct(total - trblLT2, total)],
    ['troubleshooting = 0',          `${total - trbl0}`,   `${trbl0}`,    pct(total - trbl0, total)],
    ['faqs > 0',                     `${total - faq0}`,    `${faq0}`,     pct(total - faq0, total)],
    ['reviewed_at present',          `${total - reviewedMissing}`, `${reviewedMissing}`, pct(total - reviewedMissing, total)],
    ['aspect_ratio_reason present',  `${total - aspectReasonMissing}`, `${aspectReasonMissing}`, pct(total - aspectReasonMissing, total)],
    ['prompt_breakdown present',     `${total - breakdownMissing}`, `${breakdownMissing}`, pct(total - breakdownMissing, total)],
    ['generation_tested = true',     `${total - genTestedFalse}`, `${genTestedFalse}`, pct(total - genTestedFalse, total)],
  ];
  console.log(compTable.map(r => `  ${r[0].padEnd(34)} ${r[1].padStart(8)} ${r[2].padStart(10)} ${r[3].padStart(10)}`).join('\n'));
  console.log();

  /* ═══════════════════════════════════════════════════════════════════
     TASK 2 — Exact duplicate customization tips
     ═══════════════════════════════════════════════════════════════════ */

  console.log('B. EXACT DUPLICATE CUSTOMIZATION TIPS\n');

  // Map: normalized tip → [{ slug, title }]
  const tipMap = new Map();
  // Map: normalized array key → [{ slug, title }]
  const tipArrayMap = new Map();
  let tipsWithDupes = 0;
  let tipsDupeInstances = 0;

  for (const p of prompts) {
    const tips = Array.isArray(p.customization_tips) ? p.customization_tips.filter(t => String(t || '').trim()) : [];
    // individual tip tracking
    for (const tip of tips) {
      const key = norm(tip);
      if (!key) continue;
      if (!tipMap.has(key)) tipMap.set(key, []);
      tipMap.get(key).push({ slug: p.slug, title: p.title });
    }
    // full array tracking
    if (tips.length > 0) {
      const arrKey = tips.map(t => norm(t)).join(' ||| ');
      if (!tipArrayMap.has(arrKey)) tipArrayMap.set(arrKey, []);
      tipArrayMap.get(arrKey).push({ slug: p.slug, title: p.title });
    }
  }

  const individualDupeTips = [...tipMap.entries()]
    .filter(([, arr]) => arr.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  if (individualDupeTips.length === 0) {
    console.log('  ✓ No exact duplicate individual tips found.\n');
  } else {
    console.log(`  Found ${individualDupeTips.length} tips appearing in 2+ prompts:\n`);
    for (const [tip, prompts] of individualDupeTips.slice(0, 30)) {
      tipsDupeInstances += prompts.length;
      tipsWithDupes++;
      console.log(`  ── Tip (${prompts.length} occurrences) ──`);
      console.log(`     "${short(tip, 150)}"`);
      for (const p of prompts.slice(0, 5)) {
        console.log(`       - ${p.slug} — ${short(p.title, 60)}`);
      }
      if (prompts.length > 5) console.log(`       ... and ${prompts.length - 5} more`);
      console.log();
    }
    if (individualDupeTips.length > 30) {
      console.log(`  ... and ${individualDupeTips.length - 30} more duplicate tip groups\n`);
    }
  }

  const arrayDupeGroups = [...tipArrayMap.entries()]
    .filter(([, arr]) => arr.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  if (arrayDupeGroups.length > 0) {
    console.log(`  FULL ARRAY DUPLICATES: ${arrayDupeGroups.length} groups share identical customization_tips arrays:\n`);
    for (const [arrKey, prompts] of arrayDupeGroups.slice(0, 10)) {
      console.log(`  ── Array group (${prompts.length} prompts) ──`);
      for (const p of prompts.slice(0, 5)) {
        console.log(`       ${p.slug} — ${short(p.title, 60)}`);
      }
      if (prompts.length > 5) console.log(`       ... and ${prompts.length - 5} more`);
      const sampleTips = arrKey.split(' ||| ');
      console.log(`     Tips: ${sampleTips.map(t => short(t, 70)).join(' | ')}`);
      console.log();
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     TASK 3 — Exact duplicate troubleshooting entries
     ═══════════════════════════════════════════════════════════════════ */

  console.log('C. EXACT DUPLICATE TROUBLESHOOTING ENTRIES\n');

  const issueMap = new Map();
  const whyMap = new Map();
  const fixMap = new Map();
  const fullEntryMap = new Map();

  for (const p of prompts) {
    const entries = Array.isArray(p.prompt_specific_troubleshooting)
      ? p.prompt_specific_troubleshooting.filter(e => e && (e.issue || e.fix))
      : [];
    for (const e of entries) {
      const iKey = norm(e.issue);
      const wKey = norm(e.why_it_happens);
      const fKey = norm(e.fix);
      if (iKey) { if (!issueMap.has(iKey)) issueMap.set(iKey, []); issueMap.get(iKey).push({ slug: p.slug, title: p.title, entry: e }); }
      if (fKey) { if (!fixMap.has(fKey)) fixMap.set(fKey, []); fixMap.get(fKey).push({ slug: p.slug, title: p.title, entry: e }); }
      const fullKey = `${iKey}|||${wKey}|||${fKey}`;
      if (iKey || fKey) { if (!fullEntryMap.has(fullKey)) fullEntryMap.set(fullKey, []); fullEntryMap.get(fullKey).push({ slug: p.slug, title: p.title, entry: e }); }
    }
  }

  const dupeIssues = [...issueMap.entries()].filter(([, a]) => a.length > 1).sort((a, b) => b[1].length - a[1].length);
  const dupeFixes = [...fixMap.entries()].filter(([, a]) => a.length > 1).sort((a, b) => b[1].length - a[1].length);
  const dupeFullEntries = [...fullEntryMap.entries()].filter(([, a]) => a.length > 1).sort((a, b) => b[1].length - a[1].length);

  if (dupeIssues.length === 0 && dupeFixes.length === 0) {
    console.log('  ✓ No exact duplicate troubleshooting entries found.\n');
  } else {
    if (dupeIssues.length > 0) {
      console.log(`  Duplicate ISSUE text: ${dupeIssues.length} groups\n`);
      for (const [issue, items] of dupeIssues.slice(0, 15)) {
        console.log(`  ── Issue (${items.length} occurrences) ──`);
        console.log(`     "${short(issue, 120)}"`);
        for (const it of items.slice(0, 5)) {
          console.log(`       - ${it.slug} — ${short(it.title, 50)}`);
        }
        if (items.length > 5) console.log(`       ... and ${items.length - 5} more`);
        console.log();
      }
    }
    if (dupeFixes.length > 0) {
      console.log(`  Duplicate FIX text: ${dupeFixes.length} groups\n`);
      for (const [fix, items] of dupeFixes.slice(0, 15)) {
        console.log(`  ── Fix (${items.length} occurrences) ──`);
        console.log(`     "${short(fix, 120)}"`);
        for (const it of items.slice(0, 5)) {
          console.log(`       - ${it.slug} — ${short(it.title, 50)}`);
        }
        if (items.length > 5) console.log(`       ... and ${items.length - 5} more`);
        console.log();
      }
    }
    if (dupeFullEntries.length > 0) {
      console.log(`  Full entry duplicates (issue+why+fix all match): ${dupeFullEntries.length} groups\n`);
      for (const [key, items] of dupeFullEntries.slice(0, 15)) {
        const e = items[0].entry;
        console.log(`  ── Full entry (${items.length} occurrences) ──`);
        console.log(`     Issue: "${short(e.issue, 100)}"`);
        console.log(`     Fix:   "${short(e.fix, 100)}"`);
        for (const it of items.slice(0, 5)) {
          console.log(`       - ${it.slug} — ${short(it.title, 50)}`);
        }
        if (items.length > 5) console.log(`       ... and ${items.length - 5} more`);
        console.log();
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     TASK 4 — Near-duplicate detection (conservative, ≥ 85%)
     ═══════════════════════════════════════════════════════════════════ */

  console.log('D. NEAR-DUPLICATE DETECTION (≥ 85% similarity, conservative)\n');

  const THRESHOLD = 0.85;

  function findNearDuplicates(collection, label) {
    // Only compare items that are at least 20 chars to avoid false positives on short strings
    const items = collection.filter(x => norm(x.text).length >= 20);
    const groups = [];
    const visited = new Set();

    for (let i = 0; i < items.length; i++) {
      if (visited.has(i)) continue;
      const group = [items[i]];
      for (let j = i + 1; j < items.length; j++) {
        if (visited.has(j)) continue;
        if (similarity(items[i].text, items[j].text) >= THRESHOLD) {
          group.push(items[j]);
          visited.add(j);
        }
      }
      if (group.length > 1) {
        visited.add(i);
        groups.push(group);
      }
    }
    return groups;
  }

  // Collect all tips
  const allTips = [];
  const allIssues = [];
  const allWhys = [];
  const allFixes = [];

  for (const p of prompts) {
    const tips = Array.isArray(p.customization_tips) ? p.customization_tips.filter(t => String(t || '').trim()) : [];
    for (const t of tips) allTips.push({ text: t, slug: p.slug, title: p.title });

    const entries = Array.isArray(p.prompt_specific_troubleshooting)
      ? p.prompt_specific_troubleshooting.filter(e => e && (e.issue || e.fix))
      : [];
    for (const e of entries) {
      if (e.issue) allIssues.push({ text: e.issue, slug: p.slug, title: p.title });
      if (e.why_it_happens) allWhys.push({ text: e.why_it_happens, slug: p.slug, title: p.title });
      if (e.fix) allFixes.push({ text: e.fix, slug: p.slug, title: p.title });
    }
  }

  const tipGroups = findNearDuplicates(allTips, 'tip');
  const issueGroups = findNearDuplicates(allIssues, 'issue');
  const whyGroups = findNearDuplicates(allWhys, 'why');
  const fixGroups = findNearDuplicates(allFixes, 'fix');

  function reportNearDupe(groups, label) {
    if (groups.length === 0) {
      console.log(`  ${label}: ✓ No near-duplicates found.\n`);
      return;
    }
    console.log(`  ${label}: ${groups.length} near-duplicate group(s)\n`);
    for (const group of groups.slice(0, 10)) {
      // compute max similarity in group
      let maxSim = 0;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const s = similarity(group[i].text, group[j].text);
          if (s > maxSim) maxSim = s;
        }
      }
      console.log(`  ── Group (~${Math.round(maxSim * 100)}% similar, ${group.length} items) ──`);
      for (const item of group.slice(0, 4)) {
        console.log(`     ${item.slug}: "${short(item.text, 90)}"`);
      }
      if (group.length > 4) console.log(`     ... and ${group.length - 4} more`);
      console.log();
    }
    if (groups.length > 10) console.log(`  ... and ${groups.length - 10} more groups\n`);
  }

  reportNearDupe(tipGroups, 'Customization tips');
  reportNearDupe(issueGroups, 'Troubleshooting issues');
  reportNearDupe(whyGroups, 'Troubleshooting "why"');
  reportNearDupe(fixGroups, 'Troubleshooting fixes');

  /* ═══════════════════════════════════════════════════════════════════
     TASK 5 — Prompts relying on frontend fallback
     ═══════════════════════════════════════════════════════════════════ */

  console.log('E. PROMPTS TRIGGERING FRONTEND FALLBACK\n');

  let fallbackTipsOnly = 0;
  let fallbackTrblOnly = 0;
  let fallbackBoth = 0;
  const fallbackPrompts = [];

  for (const p of prompts) {
    const tips = Array.isArray(p.customization_tips) ? p.customization_tips.filter(t => String(t || '').trim()) : [];
    const trbl = Array.isArray(p.prompt_specific_troubleshooting) ? p.prompt_specific_troubleshooting.filter(e => e && e.issue && e.fix) : [];
    const hasFallbackTips = tips.length === 0;
    const hasFallbackTrbl = trbl.length < 1;

    if (hasFallbackTips && hasFallbackTrbl) {
      fallbackBoth++;
      fallbackPrompts.push(p);
    } else if (hasFallbackTips) {
      fallbackTipsOnly++;
      fallbackPrompts.push(p);
    } else if (hasFallbackTrbl) {
      fallbackTrblOnly++;
      fallbackPrompts.push(p);
    }
  }

  console.log(`  Total prompts with some fallback: ${fallbackTipsOnly + fallbackTrblOnly + fallbackBoth}`);
  console.log(`    Tips fallback only: ${fallbackTipsOnly}`);
  console.log(`    Troubleshooting fallback only: ${fallbackTrblOnly}`);
  console.log(`    Both fallbacks: ${fallbackBoth}\n`);

  if (fallbackPrompts.length > 0) {
    console.log(`  Details for each affected prompt:\n`);
    for (const p of fallbackPrompts) {
      const tips = Array.isArray(p.customization_tips) ? p.customization_tips.filter(t => String(t || '').trim()) : [];
      const trbl = Array.isArray(p.prompt_specific_troubleshooting) ? p.prompt_specific_troubleshooting.filter(e => e && e.issue && e.fix) : [];
      const patterns = matchedPatterns(p);

      console.log(`  ── ${p.slug} — ${short(p.title, 60)} ──`);
      console.log(`     DB tips: ${tips.length === 0 ? 'EMPTY → fallback will generate' : tips.length + ' present'}`);
      console.log(`     DB troubleshooting: ${trbl.length < 1 ? 'EMPTY → fallback will generate' : trbl.length + ' present'}`);
      console.log(`     Matching fallback patterns: ${patterns.length > 0 ? patterns.join(', ') : 'none (generic catch-all)'}`);

      if (tips.length === 0 && patterns.length > 0) {
        console.log(`     → Fallback tips would be generated from: ${patterns.join(', ')}`);
      }
      if (trbl.length < 1 && patterns.length > 0) {
        console.log(`     → Fallback troubleshooting would be generated from: ${patterns.join(', ')}`);
      }
      if (tips.length === 0 && patterns.length === 0) {
        console.log(`     → Falls through to generic catch-all fallback`);
      }
      console.log();
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     SUMMARY
     ═══════════════════════════════════════════════════════════════════ */

  console.log(`${'═'.repeat(72)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(72)}`);
  console.log(`  Total published prompts:              ${total}`);
  console.log(`  Tips complete (≥ 2):                  ${total - tipsLT2} (${pct(total - tipsLT2, total)})`);
  console.log(`  Troubleshooting complete (≥ 2):       ${total - trblLT2} (${pct(total - trblLT2, total)})`);
  console.log(`  Prompts with FAQs:                    ${total - faq0} (${pct(total - faq0, total)})`);
  console.log(`  Prompts with reviewed_at:             ${total - reviewedMissing} (${pct(total - reviewedMissing, total)})`);
  console.log(`  Exact duplicate tip groups:           ${individualDupeTips.length}`);
  console.log(`  Full-array duplicate groups:          ${arrayDupeGroups.length}`);
  console.log(`  Exact duplicate troubleshooting:      ${dupeFullEntries.length} full entries`);
  console.log(`  Near-duplicate tip groups:            ${tipGroups.length}`);
  console.log(`  Near-duplicate fix groups:            ${fixGroups.length}`);
  console.log(`  Prompts on frontend fallback:         ${fallbackPrompts.length}`);
  console.log(`${'═'.repeat(72)}\n`);

  await db.end();
}

main().catch((error) => {
  console.error('Audit failed:', error.message);
  process.exitCode = 1;
});
