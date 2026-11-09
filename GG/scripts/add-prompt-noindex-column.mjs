#!/usr/bin/env node

/**
 * Migration: Add should_noindex column to prompts table and backfill it.
 *
 * This column caches the result of shouldNoIndexPrompt() so the sitemap
 * can filter noindexed prompts without loading full prompt content.
 *
 * Usage:
 *   node scripts/add-prompt-noindex-column.mjs            # dry run
 *   node scripts/add-prompt-noindex-column.mjs --apply    # apply migration
 */

import { getPgPool } from '../src/lib/db.js';
import { shouldNoIndexPrompt } from '../src/lib/prompt-constants.js';

async function migrate(dryRun = true) {
  const pool = getPgPool();

  try {
    console.log('=== ADD should_noindex COLUMN ===\n');
    console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'APPLY'}`);

    // Step 1: Add column if it doesn't exist
    console.log('\n[1/3] Adding should_noindex column...');
    if (!dryRun) {
      await pool.query(`
        ALTER TABLE prompts
        ADD COLUMN IF NOT EXISTS should_noindex BOOLEAN NOT NULL DEFAULT false
      `);
      console.log('  ✓ Column added (or already exists)');
    } else {
      const check = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'prompts' AND column_name = 'should_noindex'
        ) AS exists
      `);
      console.log(`  Column exists: ${check.rows[0].exists}`);
    }

    // Step 2: Fetch all prompts with full data for shouldNoIndexPrompt evaluation
    console.log('\n[2/3] Fetching all prompts for evaluation...');
    const result = await pool.query(`
      SELECT
        id, slug, title, prompt, tags, image, images, og_image, intro,
        status, should_noindex
      FROM prompts
      ORDER BY id
    `);

    const prompts = result.rows;
    console.log(`  Found ${prompts.length} prompts total`);

    // Step 3: Evaluate shouldNoIndexPrompt for each and compare
    console.log('\n[3/3] Evaluating shouldNoIndexPrompt for each prompt...\n');

    let noindexCount = 0;
    let indexableCount = 0;
    let changedCount = 0;
    const changes = [];

    for (const row of prompts) {
      const fullPrompt = {
        slug: row.slug,
        title: row.title,
        prompt: row.prompt,
        tags: Array.isArray(row.tags) ? row.tags : [],
        image: row.image || '',
        images: Array.isArray(row.images) ? row.images : [],
        ogImage: row.og_image || '',
        intro: row.intro || '',
      };

      const shouldNoindex = shouldNoIndexPrompt(fullPrompt);
      const currentNoindex = row.should_noindex;

      if (shouldNoindex) {
        noindexCount++;
      } else {
        indexableCount++;
      }

      if (shouldNoindex !== currentNoindex) {
        changedCount++;
        changes.push({
          id: row.id,
          slug: row.slug,
          title: row.title,
          from: currentNoindex,
          to: shouldNoindex,
        });

        if (changes.length <= 10) {
          console.log(`  [${row.id}] ${row.slug}`);
          console.log(`    Title: ${row.title}`);
          console.log(`    Current: ${currentNoindex}, New: ${shouldNoindex}`);
        }
      }
    }

    if (changes.length > 10) {
      console.log(`  ... and ${changes.length - 10} more changes`);
    }

    console.log('\n=== RESULTS ===');
    console.log(`  Total prompts: ${prompts.length}`);
    console.log(`  should_noindex = true: ${noindexCount}`);
    console.log(`  should_noindex = false: ${indexableCount}`);
    console.log(`  Changes needed: ${changedCount}`);

    // Apply changes if not dry run
    if (!dryRun && changes.length > 0) {
      console.log(`\nApplying ${changes.length} updates...`);
      for (const change of changes) {
        await pool.query(
          'UPDATE prompts SET should_noindex = $1 WHERE id = $2',
          [change.to, change.id],
        );
      }
      console.log(`✓ Updated ${changes.length} prompts`);
    }

    if (dryRun && changes.length > 0) {
      console.log(`\nTo apply changes, run: node scripts/add-prompt-noindex-column.mjs --apply`);
    }

    // Output full noindex list for verification
    console.log('\n=== ALL NOINDEXED PROMPTS ===\n');
    for (const row of prompts) {
      const fullPrompt = {
        slug: row.slug,
        title: row.title,
        prompt: row.prompt,
        tags: Array.isArray(row.tags) ? row.tags : [],
        image: row.image || '',
        images: Array.isArray(row.images) ? row.images : [],
        ogImage: row.og_image || '',
        intro: row.intro || '',
      };
      if (shouldNoIndexPrompt(fullPrompt)) {
        console.log(`  [${row.id}] ${row.slug} — ${row.title}`);
      }
    }

    return {
      total: prompts.length,
      noindexCount,
      indexableCount,
      changedCount,
      changes,
    };
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

const shouldApply = process.argv.includes('--apply');
migrate(!shouldApply)
  .then((result) => {
    console.log(`\n=== MIGRATION COMPLETE ===`);
    console.log(`Total: ${result.total}, Noindexed: ${result.noindexCount}, Changed: ${result.changedCount}`);
  })
  .catch(console.error);
