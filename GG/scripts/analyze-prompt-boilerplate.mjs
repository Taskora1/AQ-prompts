#!/usr/bin/env node

/**
 * Analyze prompt data to find boilerplate duplication
 * Shows how many prompts have empty customization_tips and prompt_specific_troubleshooting
 */

import { getPgPool } from '../src/lib/db.js';

async function analyzePromptBoilerplate() {
  const pool = getPgPool();

  try {
    // Query all prompts with their customization and troubleshooting data
    const result = await pool.query(`
      SELECT
        id,
        title,
        slug,
        prompt,
        tags,
        customization_tips,
        prompt_specific_troubleshooting,
        CASE
          WHEN customization_tips IS NULL OR customization_tips::text = '[]' THEN true
          ELSE false
        END AS has_empty_customization_tips,
        CASE
          WHEN prompt_specific_troubleshooting IS NULL OR prompt_specific_troubleshooting::text = '[]' THEN true
          ELSE false
        END AS has_empty_troubleshooting
      FROM prompts
      WHERE status = 'published'
      ORDER BY id
    `);

    const prompts = result.rows;
    const emptyCustomizationCount = prompts.filter(p => p.has_empty_customization_tips).length;
    const emptyTroubleshootingCount = prompts.filter(p => p.has_empty_troubleshooting).length;
    const bothEmptyCount = prompts.filter(p => p.has_empty_customization_tips && p.has_empty_troubleshooting).length;

    console.log('\n=== BOILERPLATE ANALYSIS ===\n');
    console.log(`Total published prompts: ${prompts.length}`);
    console.log(`Prompts with empty customization_tips: ${emptyCustomizationCount} (${Math.round(emptyCustomizationCount / prompts.length * 100)}%)`);
    console.log(`Prompts with empty prompt_specific_troubleshooting: ${emptyTroubleshootingCount} (${Math.round(emptyTroubleshootingCount / prompts.length * 100)}%)`);
    console.log(`Prompts with BOTH fields empty: ${bothEmptyCount} (${Math.round(bothEmptyCount / prompts.length * 100)}%)`);

    // Sample a few prompts to show what's stored
    console.log('\n=== SAMPLE PROMPTS ===\n');
    const samples = prompts.slice(0, 5);
    for (const sample of samples) {
      console.log(`ID ${sample.id}: ${sample.title}`);
      console.log(`  Customization tips: ${sample.customization_tips ? JSON.stringify(sample.customization_tips) : '(empty)'}`);
      console.log(`  Troubleshooting: ${sample.prompt_specific_troubleshooting ? JSON.stringify(sample.prompt_specific_troubleshooting) : '(empty)'}`);
      console.log('');
    }

    // Show how many would be affected by migration
    console.log(`\n=== MIGRATION SCOPE ===\n`);
    console.log(`Prompts needing migration: ${bothEmptyCount}`);
    console.log(`These prompts currently fall back to auto-generated boilerplate from buildPromptGuidance().`);

    return {
      total: prompts.length,
      needsMigration: bothEmptyCount,
      prompts: prompts.filter(p => p.has_empty_customization_tips && p.has_empty_troubleshooting)
    };
  } catch (error) {
    console.error('Error analyzing prompts:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

analyzePromptBoilerplate().catch(console.error);
