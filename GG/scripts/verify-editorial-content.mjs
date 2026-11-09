/**
 * Verify editorial content migration results (v2).
 * Run AFTER: node scripts/backfill-all-prompt-editorial.mjs
 *
 * Usage: node scripts/verify-editorial-content.mjs
 */

// Use the shared env-loading helper so DATABASE_URL is available
import { getPgPool } from './lib/load-local-env.mjs';

async function main() {
  const db = getPgPool();

  console.log('=== Editorial Content Verification (v2) ===\n');

  // ─── 1. Total published/indexable prompts ──────────────────────────────────
  const { rows: totalRows } = await db.query(`SELECT COUNT(*) AS total FROM prompts WHERE status = 'published'`);
  const total = Number(totalRows[0].total);
  console.log(`1. Total published prompts: ${total}\n`);

  // ─── 2-6. Field-by-field stats ──────────────────────────────────────────────
  const { rows: statsRows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE customization_tips IS NOT NULL AND jsonb_array_length(customization_tips) >= 2) AS has_tips,
      COUNT(*) FILTER (WHERE customization_tips IS NULL OR jsonb_array_length(customization_tips) < 2) AS missing_tips,
      COUNT(*) FILTER (WHERE prompt_specific_troubleshooting IS NOT NULL AND jsonb_array_length(prompt_specific_troubleshooting) >= 2) AS has_troubleshooting,
      COUNT(*) FILTER (WHERE prompt_specific_troubleshooting IS NULL OR jsonb_array_length(prompt_specific_troubleshooting) < 2) AS missing_troubleshooting,
      COUNT(*) FILTER (WHERE faqs IS NOT NULL AND jsonb_array_length(faqs) >= 3) AS has_faqs,
      COUNT(*) FILTER (WHERE faqs IS NULL OR jsonb_array_length(faqs) < 3) AS missing_faqs,
      COUNT(*) FILTER (WHERE aspect_ratio_reason IS NOT NULL AND length(aspect_ratio_reason) > 10) AS has_ar_reason,
      COUNT(*) FILTER (WHERE aspect_ratio_reason IS NULL OR length(aspect_ratio_reason) <= 10) AS missing_ar_reason,
      COUNT(*) FILTER (
        WHERE customization_tips IS NOT NULL AND jsonb_array_length(customization_tips) >= 2
        AND prompt_specific_troubleshooting IS NOT NULL AND jsonb_array_length(prompt_specific_troubleshooting) >= 2
        AND faqs IS NOT NULL AND jsonb_array_length(faqs) >= 3
        AND aspect_ratio_reason IS NOT NULL AND length(aspect_ratio_reason) > 10
      ) AS fully_editorial,
      COUNT(*) FILTER (
        WHERE customization_tips IS NULL OR jsonb_array_length(customization_tips) < 2
        OR prompt_specific_troubleshooting IS NULL OR jsonb_array_length(prompt_specific_troubleshooting) < 2
        OR faqs IS NULL OR jsonb_array_length(faqs) < 3
        OR aspect_ratio_reason IS NULL OR length(aspect_ratio_reason) <= 10
      ) AS incomplete
    FROM prompts
    WHERE status = 'published'
  `);

  const s = statsRows[0];
  console.log('2. Customization Tips:');
  console.log(`   Prompts with 2+ tips: ${s.has_tips}`);
  console.log(`   Missing/insufficient:  ${s.missing_tips}\n`);
  console.log('3. Common Problems:');
  console.log(`   Prompts with 2+ problems: ${s.has_troubleshooting}`);
  console.log(`   Missing/insufficient:     ${s.missing_troubleshooting}\n`);
  console.log('4. FAQs:');
  console.log(`   Prompts with 3+ FAQs: ${s.has_faqs}`);
  console.log(`   Missing/insufficient:  ${s.missing_faqs}\n`);
  console.log('5. Aspect Ratio Reason:');
  console.log(`   Prompts with valid reason: ${s.has_ar_reason}`);
  console.log(`   Missing/insufficient:      ${s.missing_ar_reason}\n`);
  console.log('6. Fully Editorial:');
  console.log(`   All 4 fields complete: ${s.fully_editorial}`);
  console.log(`   Incomplete:            ${s.incomplete}\n`);

  // ─── 8. Duplicate content audit ─────────────────────────────────────────────
  console.log('8. Duplicate Content Audit:\n');

  const { rows: tipDups } = await db.query(`
    SELECT customization_tips::text AS content, COUNT(*) AS cnt,
           ARRAY_AGG(slug ORDER BY slug) AS slugs
    FROM prompts
    WHERE status = 'published'
      AND customization_tips IS NOT NULL
      AND jsonb_array_length(customization_tips) >= 2
    GROUP BY customization_tips::text
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log(`   Identical customization tips: ${tipDups.length} groups`);

  const { rows: troubleDups } = await db.query(`
    SELECT prompt_specific_troubleshooting::text AS content, COUNT(*) AS cnt,
           ARRAY_AGG(slug ORDER BY slug) AS slugs
    FROM prompts
    WHERE status = 'published'
      AND prompt_specific_troubleshooting IS NOT NULL
      AND jsonb_array_length(prompt_specific_troubleshooting) >= 2
    GROUP BY prompt_specific_troubleshooting::text
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log(`   Identical troubleshooting:   ${troubleDups.length} groups`);

  const { rows: faqDups } = await db.query(`
    SELECT faqs::text AS content, COUNT(*) AS cnt,
           ARRAY_AGG(slug ORDER BY slug) AS slugs
    FROM prompts
    WHERE status = 'published'
      AND faqs IS NOT NULL
      AND jsonb_array_length(faqs) >= 3
    GROUP BY faqs::text
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log(`   Identical FAQs:              ${faqDups.length} groups`);

  const { rows: arDups } = await db.query(`
    SELECT aspect_ratio_reason AS content, COUNT(*) AS cnt,
           ARRAY_AGG(slug ORDER BY slug) AS slugs
    FROM prompts
    WHERE status = 'published'
      AND aspect_ratio_reason IS NOT NULL
      AND length(aspect_ratio_reason) > 10
    GROUP BY aspect_ratio_reason
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log(`   Identical aspect-ratio reasons: ${arDups.length} groups\n`);

  // ─── 9. Show duplicate groups detail ────────────────────────────────────────
  console.log('9. Duplicate Groups Detail:\n');

  for (const d of tipDups) {
    console.log(`   TIPS (${d.cnt} prompts): ${d.slugs.join(', ')}`);
    const tips = JSON.parse(d.content);
    tips.forEach((t, i) => console.log(`     [${i + 1}] ${t}`));
  }
  for (const d of troubleDups) {
    console.log(`   TROUBLESHOOTING (${d.cnt} prompts): ${d.slugs.join(', ')}`);
    const trouble = JSON.parse(d.content);
    trouble.forEach((t, i) => console.log(`     [${i + 1}] ${t.issue}: ${t.fix?.substring(0, 80)}...`));
  }
  for (const d of faqDups) {
    console.log(`   FAQ (${d.cnt} prompts): ${d.slugs.join(', ')}`);
    const faqs = JSON.parse(d.content);
    faqs.forEach((f, i) => console.log(`     [${i + 1}] Q: ${f.question}`));
  }
  for (const d of arDups) {
    console.log(`   AR-REASON (${d.cnt} prompts): ${d.slugs.join(', ')}`);
    console.log(`     "${d.content}"`);
  }
  console.log('');

  // ─── Entity-mismatch checks ─────────────────────────────────────────────────
  console.log('10. Entity-Mismatch Audit:\n');

  const { rows: allPrompts } = await db.query(`
    SELECT slug, title, prompt,
           customization_tips, prompt_specific_troubleshooting,
           faqs, aspect_ratio_reason
    FROM prompts
    WHERE status = 'published'
    ORDER BY id
  `);

  let entityMismatches = 0;
  let genericFaqCount = 0;

  // Generic FAQ questions that should NOT be reused across unrelated prompts
  const GENERIC_FAQ_PATTERNS = [
    'do i need to upload a reference photo to use this prompt',
    'which ai image generator works best',
    'what aspect ratio works best for this composition',
    'how do i adapt this for different social media platforms',
    'can i change the outfit or setting without breaking the prompt',
    'the skin looks too smooth or artificial',
  ];

  for (const p of allPrompts) {
    const text = String(p.prompt || '');

    // Check troubleshooting for entity mismatches
    const trouble = Array.isArray(p.prompt_specific_troubleshooting) ? p.prompt_specific_troubleshooting : [];
    for (const t of trouble) {
      const issue = String(t.issue || '').toLowerCase();
      const fix = String(t.fix || '').toLowerCase();

      // Mirror/reflection references without mirror in prompt
      if ((issue.includes('mirror') || issue.includes('reflection')) && !/mirror|reflection|reflected/i.test(text)) {
        console.log(`   ✗ ${p.slug}: troubleshooting mentions mirror/reflection but prompt has none`);
        entityMismatches++;
      }
      // Water references without water in prompt
      if ((issue.includes('water') || issue.includes('wave') || issue.includes('ocean')) && !/water|ocean|sea|river|lake|wave|waterfront|shoreline/i.test(text)) {
        console.log(`   ✗ ${p.slug}: troubleshooting mentions water/wave but prompt has none`);
        entityMismatches++;
      }
      // Text rendering references without text in prompt
      if ((issue.includes('text') && (issue.includes('misspelled') || issue.includes('garbled') || issue.includes('placeholder'))) && !/text|username|@\w+|typography|cursive|quote/i.test(text)) {
        console.log(`   ✗ ${p.slug}: troubleshooting mentions text rendering but prompt has no text`);
        entityMismatches++;
      }
      // Neon references without neon in prompt
      if ((issue.includes('neon') || issue.includes('glow')) && !/neon|glow|rim.?light|edge.?glow/i.test(text)) {
        console.log(`   ✗ ${p.slug}: troubleshooting mentions neon/glow but prompt has none`);
        entityMismatches++;
      }
      // Double exposure references without double exposure in prompt
      if ((issue.includes('double-exposure') || issue.includes('double exposure') || issue.includes('overlay appears')) && !/double.?exposure|ghost|overlay|semi.?transparent/i.test(text)) {
        console.log(`   ✗ ${p.slug}: troubleshooting mentions double-exposure but prompt has none`);
        entityMismatches++;
      }
      // Wind references without wind in prompt
      if ((issue.includes('wind') || issue.includes('breeze')) && !/wind|windblown|breeze|flowing|swept/i.test(text)) {
        console.log(`   ✗ ${p.slug}: troubleshooting mentions wind but prompt has none`);
        entityMismatches++;
      }
      // Couple references without couple in prompt
      if ((issue.includes('both people') || issue.includes('two subjects') || issue.includes('couple')) && !/couple|together|pair|two.?person|his.*her/i.test(text)) {
        console.log(`   ✗ ${p.slug}: troubleshooting mentions couple/two people but prompt is solo`);
        entityMismatches++;
      }
    }

    // Check aspect ratio reason for entity mismatches
    const arReason = String(p.aspect_ratio_reason || '').toLowerCase();
    if ((arReason.includes('two subjects') || arReason.includes('both faces')) && !/couple|together|pair|two.?person|his.*her/i.test(text)) {
      console.log(`   ✗ ${p.slug}: AR reason mentions "two subjects" but prompt is solo`);
      entityMismatches++;
    }
    if ((arReason.includes('mirror reflection')) && !/mirror|reflection/i.test(text)) {
      console.log(`   ✗ ${p.slug}: AR reason mentions mirror reflection but prompt has none`);
      entityMismatches++;
    }

    // Check for generic FAQ sets
    const faqs = Array.isArray(p.faqs) ? p.faqs : [];
    let genericCount = 0;
    for (const faq of faqs) {
      const qLower = String(faq.question || '').toLowerCase();
      for (const pattern of GENERIC_FAQ_PATTERNS) {
        if (qLower.includes(pattern)) {
          genericCount++;
          break;
        }
      }
    }
    if (genericCount >= 2) {
      console.log(`   ⚠ ${p.slug}: has ${genericCount} generic FAQ patterns`);
      genericFaqCount++;
    }
  }

  console.log(`\n   Entity-mismatch issues: ${entityMismatches}`);
  console.log(`   Prompts with generic FAQ sets (2+ generic): ${genericFaqCount}\n`);

  // ─── 11. Sample QA — 10 prompts from different categories ───────────────────
  console.log('11. Sample QA — 10 Prompts:\n');

  const { rows: s1 } = await db.query(`
    SELECT slug, title, customization_tips, prompt_specific_troubleshooting, faqs, aspect_ratio_reason
    FROM prompts WHERE status = 'published' ORDER BY id LIMIT 3
  `);
  const { rows: s2 } = await db.query(`
    SELECT slug, title, customization_tips, prompt_specific_troubleshooting, faqs, aspect_ratio_reason
    FROM prompts WHERE status = 'published'
    OFFSET (SELECT COUNT(*)/3 FROM prompts WHERE status='published') LIMIT 2
  `);
  const { rows: s3 } = await db.query(`
    SELECT slug, title, customization_tips, prompt_specific_troubleshooting, faqs, aspect_ratio_reason
    FROM prompts WHERE status = 'published'
    OFFSET (SELECT COUNT(*)*2/3 FROM prompts WHERE status='published') LIMIT 2
  `);
  const { rows: s4 } = await db.query(`
    SELECT slug, title, customization_tips, prompt_specific_troubleshooting, faqs, aspect_ratio_reason
    FROM prompts WHERE status = 'published' ORDER BY RANDOM() LIMIT 3
  `);

  const allSamples = [...s1, ...s2, ...s3, ...s4];
  for (const p of allSamples) {
    console.log(`--- ${p.slug} ---`);
    console.log(`  Title: ${p.title}`);
    console.log('  Tips:');
    (p.customization_tips || []).forEach((t, i) => console.log(`    [${i + 1}] ${t}`));
    console.log('  Problems:');
    (p.prompt_specific_troubleshooting || []).forEach((t, i) => console.log(`    [${i + 1}] ${t.issue}: ${(t.fix || '').substring(0, 100)}...`));
    console.log('  FAQs:');
    (p.faqs || []).forEach((f, i) => console.log(`    [${i + 1}] Q: ${f.question}`));
    console.log(`  AR Reason: ${p.aspect_ratio_reason}`);
    console.log('');
  }

  // ─── Safety checks ───────────────────────────────────────────────────────────
  console.log('=== Safety Checks ===\n');

  const { rows: safetyRows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE reviewed_at IS NOT NULL) AS has_reviewed_at,
      COUNT(*) FILTER (WHERE generation_tested = true) AS has_gen_tested
    FROM prompts WHERE status = 'published'
  `);
  console.log(`   Prompts with reviewedAt set:     ${safetyRows[0].has_reviewed_at} (should be 0)`);
  console.log(`   Prompts with generationTested:   ${safetyRows[0].has_gen_tested} (should be 0)\n`);

  // Check bespoke prompts
  const bespokeSlugs = [
    'professional-studio-double-exposure-south-asian-man-portrait',
    'creative-cinematic-beach-portrait',
    'aesthetic-south-asian-male-autumn-park-portrait',
    'all-white-luxury-riverside-aesthetic-male-portrait',
    'mirror-reflection-portrait-dual-tone-red-blue-lighting',
    'professional-studio-portrait-south-asian-man-in-white-textured-sweater',
    'urban-monochrome-south-asian-male-portrait-concrete-aesthetic',
    'silk-motion-editorial-high-intensity-portrait',
  ];

  const { rows: bespokeRows } = await db.query(`
    SELECT slug,
           jsonb_array_length(customization_tips) AS tip_count,
           jsonb_array_length(prompt_specific_troubleshooting) AS trouble_count,
           jsonb_array_length(faqs) AS faq_count,
           aspect_ratio_reason
    FROM prompts WHERE slug = ANY($1::text[])
  `, [bespokeSlugs]);

  console.log('   Bespoke prompts (8):');
  for (const b of bespokeRows) {
    const ok = b.tip_count >= 2 && b.trouble_count >= 2 && b.faq_count >= 3;
    console.log(`     ${ok ? '✓' : '✗'} ${b.slug} — tips:${b.tip_count} trouble:${b.trouble_count} faqs:${b.faq_count}`);
  }

  console.log('\n=== Verification Complete ===');
}

main()
  .catch((error) => {
    const errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`Verification failed (${errorCode}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { getPgPool().end(); } catch {
      // Pool may not exist if configuration failed before initialization.
    }
  });
