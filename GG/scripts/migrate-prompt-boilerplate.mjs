#!/usr/bin/env node

/**
 * Migrate prompt boilerplate to prompt-specific content
 * Generates unique customization_tips and prompt_specific_troubleshooting for each prompt
 * based on that prompt's actual content (title, description, tags, prompt text)
 */

import { getPgPool } from '../src/lib/db.js';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function generatePromptGuidance(prompt) {
  const systemPrompt = `You are an expert AI prompt engineer. Your task is to generate practical, specific guidance for users working with an AI image generation prompt.

For each prompt, you will generate:
1. customizationTips: 2-4 specific, actionable tips for how users can modify this prompt
2. commonOutputProblems: 2-3 common issues users may encounter with specific fixes

CRITICAL: Your suggestions MUST be specific to this particular prompt's subject matter, not generic boilerplate.
Each suggestion should reference specific elements from the prompt or its domain.
Do NOT repeat the same advice across different prompts.

Return ONLY valid JSON, no markdown formatting, no code blocks.`;

  const userPrompt = `Generate guidance for this AI image generation prompt:

Title: "${prompt.title}"
Tags: ${Array.isArray(prompt.tags) ? prompt.tags.join(', ') : '(none)'}
Prompt text: "${prompt.prompt.substring(0, 500)}${prompt.prompt.length > 500 ? '...' : ''}"

Return this exact JSON structure (no markdown, just raw JSON):
{
  "customizationTips": ["tip1", "tip2", "tip3 or tip4"],
  "commonProblems": [
    {
      "issue": "Problem title",
      "why_it_happens": "Brief explanation of root cause",
      "fix": "Specific fix for this prompt"
    }
  ]
}`;

  const message = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error(`Unexpected response type: ${content.type}`);
  }

  try {
    const parsed = JSON.parse(content.text);
    return {
      customizationTips: Array.isArray(parsed.customizationTips) ? parsed.customizationTips.slice(0, 4) : [],
      commonProblems: Array.isArray(parsed.commonProblems) ? parsed.commonProblems.slice(0, 3) : [],
    };
  } catch (error) {
    console.error(`Failed to parse response for prompt ${prompt.id}:`, content.text);
    throw error;
  }
}

async function migratePrompts(dryRun = true) {
  const pool = getPgPool();

  try {
    // Get all prompts that need migration (both fields empty)
    const result = await pool.query(`
      SELECT
        id,
        title,
        slug,
        prompt,
        tags,
        customization_tips,
        prompt_specific_troubleshooting
      FROM prompts
      WHERE status = 'published'
        AND (customization_tips IS NULL OR customization_tips::text = '[]')
        AND (prompt_specific_troubleshooting IS NULL OR prompt_specific_troubleshooting::text = '[]')
      ORDER BY id
    `);

    const prompts = result.rows;
    console.log(`\n=== PROMPT BOILERPLATE MIGRATION ===\n`);
    console.log(`Found ${prompts.length} prompts needing migration`);
    console.log(`Dry run: ${dryRun ? 'YES (no changes will be made)' : 'NO (changes will be committed)'}\n`);

    const updates = [];
    const sampleBefore = [];
    const sampleAfter = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      console.log(`[${i + 1}/${prompts.length}] Generating guidance for: ${prompt.title}`);

      try {
        const guidance = await generatePromptGuidance(prompt);

        // Collect sample before/after for first 5
        if (i < 5) {
          sampleBefore.push({
            id: prompt.id,
            title: prompt.title,
            slug: prompt.slug,
            oldCustomizationTips: prompt.customization_tips || [],
            oldProblems: prompt.prompt_specific_troubleshooting || [],
          });

          sampleAfter.push({
            id: prompt.id,
            title: prompt.title,
            slug: prompt.slug,
            newCustomizationTips: guidance.customizationTips,
            newProblems: guidance.commonProblems,
          });
        }

        if (!dryRun) {
          updates.push({
            id: prompt.id,
            customizationTips: guidance.customizationTips,
            troubleshooting: guidance.commonProblems,
          });
        }
      } catch (error) {
        console.error(`  ERROR: ${error.message}`);
        // Continue with next prompt on error
      }

      // Add a small delay to avoid rate limiting
      if (i < prompts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Apply updates if not dry run
    if (!dryRun && updates.length > 0) {
      console.log(`\nApplying ${updates.length} updates to database...`);
      for (const update of updates) {
        await pool.query(
          `UPDATE prompts
           SET customization_tips = $2::jsonb,
               prompt_specific_troubleshooting = $3::jsonb
           WHERE id = $1`,
          [
            update.id,
            JSON.stringify(update.customizationTips),
            JSON.stringify(update.troubleshooting),
          ],
        );
      }
      console.log(`✓ Updated ${updates.length} prompts`);
    }

    // Output sample for review
    console.log('\n=== SAMPLE BEFORE/AFTER (First 5 Prompts) ===\n');
    for (let i = 0; i < sampleBefore.length; i++) {
      const before = sampleBefore[i];
      const after = sampleAfter[i];

      console.log(`\n--- Prompt ${i + 1}: ${before.title} ---`);
      console.log(`Slug: ${before.slug}`);

      console.log('\nBEFORE (auto-generated boilerplate):');
      console.log(`  Customization tips: ${before.oldCustomizationTips.length === 0 ? '(empty - using fallback)' : JSON.stringify(before.oldCustomizationTips)}`);
      console.log(`  Problems: ${before.oldProblems.length === 0 ? '(empty - using fallback)' : JSON.stringify(before.oldProblems)}`);

      console.log('\nAFTER (prompt-specific):');
      console.log(`  Customization tips:`);
      after.newCustomizationTips.forEach((tip, idx) => {
        console.log(`    ${idx + 1}. ${tip}`);
      });
      console.log(`  Common problems:`);
      after.newProblems.forEach((problem, idx) => {
        console.log(`    ${idx + 1}. ${problem.issue}`);
        console.log(`       Why: ${problem.why_it_happens}`);
        console.log(`       Fix: ${problem.fix}`);
      });
    }

    return {
      total: prompts.length,
      updated: updates.length,
      sampleBefore,
      sampleAfter,
    };
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run with dry-run by default, pass --apply to actually migrate
const shouldApply = process.argv.includes('--apply');
migratePrompts(!shouldApply)
  .then((result) => {
    console.log(`\n=== MIGRATION COMPLETE ===`);
    console.log(`Total prompts: ${result.total}`);
    console.log(`Updated: ${result.updated}`);
    if (!shouldApply) {
      console.log(`\nTo apply changes, run: npm run db:migrate:boilerplate -- --apply`);
    }
  })
  .catch(console.error);
