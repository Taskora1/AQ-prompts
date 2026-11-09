/**
 * Audit for minor/age references in prompt and blog post content.
 * Outputs matching rows to a JSON file for manual review.
 *
 * Run: node scripts/audit-age-references.mjs
 *
 * This script ONLY reads — it does not modify any data.
 * Review the output file (tmp/age-references-audit.json) before making changes.
 */

import './lib/load-local-env.mjs';
import { getPgPool } from './lib/load-local-env.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_PATH = path.join(process.cwd(), 'tmp', 'age-references-audit.json');

// Case-insensitive patterns to search for
const AGE_PATTERNS = [
  'teen', 'teenager', 'teens',
  '16 years', '17 years', '16-year', '17-year',
  '16-18', '16 to 18', '17 to 18',
  'minor', 'child', 'children',
  'under 18', 'under eighteen',
];

/**
 * Build a regex that matches any of the age patterns (case-insensitive).
 */
function buildAgeRegex() {
  const escaped = AGE_PATTERNS.map((p) =>
    p.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'),
  );
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}

/**
 * Check if a text value contains any age reference pattern.
 */
function findAgeMatches(text, regex) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];
  let match;
  // Reset lastIndex for global regex
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      term: match[0],
      index: match.index,
      context: text.slice(
        Math.max(0, match.index - 60),
        Math.min(text.length, match.index + match[0].length + 60),
      ),
    });
  }
  return matches;
}

async function main() {
  const db = getPgPool();
  const regex = buildAgeRegex();
  const results = [];

  console.log('=== Age Reference Audit ===\n');
  console.log(`Patterns: ${AGE_PATTERNS.join(', ')}\n`);

  // ─── 1. Prompts table ──────────────────────────────────────────────────────
  console.log('1. Scanning prompts table...\n');

  const { rows: prompts } = await db.query(`
    SELECT
      id,
      slug,
      title,
      intro,
      prompt,
      best_use_case AS "bestUseCase",
      unique_feature AS "uniqueFeature",
      tags,
      category,
      categories,
      use_case AS "useCase"
    FROM prompts
    WHERE status = 'published'
    ORDER BY id
  `);

  console.log(`   Total published prompts: ${prompts.length}\n`);

  let promptMatches = 0;

  for (const p of prompts) {
    const fields = [
      { name: 'title', value: p.title },
      { name: 'intro', value: p.intro },
      { name: 'prompt', value: p.prompt },
      { name: 'bestUseCase', value: p.bestUseCase },
      { name: 'uniqueFeature', value: p.uniqueFeature },
      { name: 'category', value: p.category },
      { name: 'useCase', value: p.useCase },
    ];

    // Also check tags array
    if (Array.isArray(p.tags)) {
      for (let i = 0; i < p.tags.length; i++) {
        fields.push({ name: `tags[${i}]`, value: p.tags[i] });
      }
    }

    // Also check categories array
    if (Array.isArray(p.categories)) {
      for (let i = 0; i < p.categories.length; i++) {
        fields.push({ name: `categories[${i}]`, value: p.categories[i] });
      }
    }

    for (const field of fields) {
      const matches = findAgeMatches(field.value, regex);
      if (matches.length > 0) {
        promptMatches++;
        results.push({
          type: 'prompt',
          id: p.id,
          slug: p.slug,
          title: p.title,
          field: field.name,
          matches,
        });
        console.log(`   ✗ ${p.slug} — field "${field.name}": ${matches.map((m) => m.term).join(', ')}`);
        for (const m of matches) {
          console.log(`     context: "...${m.context}..."`);
        }
      }
    }
  }

  console.log(`\n   Prompt matches found: ${promptMatches}\n`);

  // ─── 2. Blog posts table ────────────────────────────────────────────────────
  console.log('2. Scanning blog_posts table...\n');

  const { rows: blogPosts } = await db.query(`
    SELECT
      id,
      slug,
      title,
      excerpt,
      content_text AS "contentText",
      seo_title AS "seoTitle",
      seo_description AS "seoDescription"
    FROM blog_posts
    WHERE status = 'published'
    ORDER BY id
  `);

  console.log(`   Total published blog posts: ${blogPosts.length}\n`);

  let blogMatches = 0;

  for (const p of blogPosts) {
    const fields = [
      { name: 'title', value: p.title },
      { name: 'excerpt', value: p.excerpt },
      { name: 'contentText', value: p.contentText },
      { name: 'seoTitle', value: p.seoTitle },
      { name: 'seoDescription', value: p.seoDescription },
    ];

    for (const field of fields) {
      const matches = findAgeMatches(field.value, regex);
      if (matches.length > 0) {
        blogMatches++;
        results.push({
          type: 'blog_post',
          id: p.id,
          slug: p.slug,
          title: p.title,
          field: field.name,
          matches,
        });
        console.log(`   ✗ ${p.slug} — field "${field.name}": ${matches.map((m) => m.term).join(', ')}`);
        for (const m of matches) {
          console.log(`     context: "...${m.context}..."`);
        }
      }
    }
  }

  console.log(`\n   Blog post matches found: ${blogMatches}\n`);

  // ─── 3. Summary ─────────────────────────────────────────────────────────────
  console.log('=== Summary ===\n');
  console.log(`   Total matches: ${results.length}`);
  console.log(`   - Prompts: ${promptMatches}`);
  console.log(`   - Blog posts: ${blogMatches}`);

  // ─── 4. Write output file ───────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n   Results written to: ${OUTPUT_PATH}`);
  console.log('\n=== Audit Complete ===');
  console.log('\nNext steps:');
  console.log('  1. Review the JSON output file for false positives');
  console.log('  2. Rewrite flagged sentences to remove age references');
  console.log('  3. Run UPDATE queries only after manual approval\n');
}

main()
  .catch((error) => {
    console.error(`Audit failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { getPgPool().end(); } catch {}
  });
