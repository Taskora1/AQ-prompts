#!/usr/bin/env node

/**
 * Detect duplicate sentences across prompts in customization_tips and prompt_specific_troubleshooting
 * This ensures the migration produced unique content per prompt
 */

import { getPgPool } from '../src/lib/db.js';

async function checkDuplicates() {
  const pool = getPgPool();

  try {
    // Get all published prompts with their guidance content
    const result = await pool.query(`
      SELECT
        id,
        title,
        slug,
        customization_tips,
        prompt_specific_troubleshooting
      FROM prompts
      WHERE status = 'published'
      ORDER BY id
    `);

    const prompts = result.rows;
    console.log(`\n=== DUPLICATE DETECTION ===\n`);
    console.log(`Checking ${prompts.length} published prompts for duplicate sentences...\n`);

    // Extract all sentences from customization tips
    const customizationSentences = new Map(); // sentence -> [{promptId, title, index}]
    const troubleshootingSentences = new Map(); // sentence -> [{promptId, title, type}]

    for (const prompt of prompts) {
      // Check customization tips
      const tips = prompt.customization_tips || [];
      tips.forEach((tip, index) => {
        const normalized = tip.trim().toLowerCase();
        if (!customizationSentences.has(normalized)) {
          customizationSentences.set(normalized, []);
        }
        customizationSentences.get(normalized).push({
          promptId: prompt.id,
          title: prompt.title,
          slug: prompt.slug,
          index: index + 1,
        });
      });

      // Check troubleshooting entries
      const problems = prompt.prompt_specific_troubleshooting || [];
      problems.forEach((problem, pIndex) => {
        ['issue', 'why_it_happens', 'fix'].forEach(field => {
          const text = (problem[field] || '').trim();
          if (text) {
            const normalized = text.toLowerCase();
            const key = `${field}:${normalized}`;
            if (!troubleshootingSentences.has(key)) {
              troubleshootingSentences.set(key, {
                original: text,
                field,
                prompts: [],
              });
            }
            troubleshootingSentences.get(key).prompts.push({
              promptId: prompt.id,
              title: prompt.title,
              slug: prompt.slug,
              index: pIndex + 1,
            });
          }
        });
      });
    }

    // Find duplicates in customization tips
    const customizationDuplicates = [];
    for (const [sentence, matches] of customizationSentences.entries()) {
      if (matches.length > 1) {
        customizationDuplicates.push({
          sentence: matches[0].sentence || sentence,
          count: matches.length,
          prompts: matches,
        });
      }
    }

    // Find duplicates in troubleshooting
    const troubleshootingDuplicates = [];
    for (const [key, data] of troubleshootingSentences.entries()) {
      if (data.prompts.length > 1) {
        troubleshootingDuplicates.push({
          field: data.field,
          sentence: data.original,
          count: data.prompts.length,
          prompts: data.prompts,
        });
      }
    }

    // Report results
    console.log(`\n=== CUSTOMIZATION TIPS DUPLICATES ===\n`);
    if (customizationDuplicates.length === 0) {
      console.log(`✓ No duplicate sentences found in customization tips`);
    } else {
      console.log(`✗ Found ${customizationDuplicates.length} duplicate sentences:\n`);
      customizationDuplicates.forEach((dup, i) => {
        console.log(`${i + 1}. "${dup.sentence.substring(0, 100)}${dup.sentence.length > 100 ? '...' : ''}"`);
        console.log(`   Appears in ${dup.count} prompts:`);
        dup.prompts.slice(0, 5).forEach(p => {
          console.log(`     - ID ${p.promptId}: ${p.title}`);
        });
        if (dup.prompts.length > 5) {
          console.log(`     ... and ${dup.prompts.length - 5} more`);
        }
        console.log('');
      });
    }

    console.log(`\n=== TROUBLESHOOTING DUPLICATES ===\n`);
    if (troubleshootingDuplicates.length === 0) {
      console.log(`✓ No duplicate sentences found in troubleshooting entries`);
    } else {
      console.log(`✗ Found ${troubleshootingDuplicates.length} duplicate sentences:\n`);
      troubleshootingDuplicates.forEach((dup, i) => {
        console.log(`${i + 1}. [${dup.field}] "${dup.sentence.substring(0, 100)}${dup.sentence.length > 100 ? '...' : ''}"`);
        console.log(`   Appears in ${dup.count} prompts:`);
        dup.prompts.slice(0, 5).forEach(p => {
          console.log(`     - ID ${p.promptId}: ${p.title}`);
        });
        if (dup.prompts.length > 5) {
          console.log(`     ... and ${dup.prompts.length - 5} more`);
        }
        console.log('');
      });
    }

    // Summary
    console.log(`\n=== SUMMARY ===\n`);
    const totalDuplicates = customizationDuplicates.length + troubleshootingDuplicates.length;
    if (totalDuplicates === 0) {
      console.log(`✓ PASS: All prompts have unique guidance content`);
      console.log(`  Customization tips checked: ${customizationSentences.size} unique sentences`);
      console.log(`  Troubleshooting entries checked: ${troubleshootingSentences.size} unique sentences`);
    } else {
      console.log(`✗ FAIL: Found ${totalDuplicates} duplicate sentences across prompts`);
      console.log(`  Customization tip duplicates: ${customizationDuplicates.length}`);
      console.log(`  Troubleshooting duplicates: ${troubleshootingDuplicates.length}`);
      console.log(`\nRecommendation: Re-run migration with improved prompts to generate more unique content.`);
    }

    return {
      customizationDuplicates: customizationDuplicates.length,
      troubleshootingDuplicates: troubleshootingDuplicates.length,
      totalDuplicates,
      passed: totalDuplicates === 0,
    };
  } catch (error) {
    console.error('Duplicate detection error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkDuplicates()
  .then((result) => {
    process.exit(result.passed ? 0 : 1);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
