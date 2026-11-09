#!/usr/bin/env node

/**
 * Regenerate boilerplate-free prompt guidance
 * Creates unique, prompt-specific customization tips and troubleshooting entries
 * using Claude API based on each prompt's actual content
 */

import { getPgPool } from '../src/lib/db.js';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function generatePromptGuidance(prompt) {
  const systemPrompt = `You are an expert AI image generation prompt engineer with deep knowledge of:
- How different AI models interpret visual instructions
- Common failure modes and workarounds
- Specific techniques for different subjects (portraits, products, scenes, etc.)

Your task: Generate practical, specific guidance for users working with ONE particular AI prompt.

CRITICAL REQUIREMENTS:
1. Customization tips MUST reference specific elements from THIS prompt (words, subjects, techniques)
2. Common problems MUST be realistic issues this specific prompt would face
3. Do NOT generate generic boilerplate that could apply to any prompt
4. Do NOT repeat solutions already in the tip list in the problem fixes
5. Each tip and problem should be genuinely specific to this prompt's unique aspects

Return ONLY valid JSON, no markdown, no code blocks, no explanations.`;

  const userPrompt = `Generate unique, specific guidance for this SINGLE AI image generation prompt:

TITLE: "${prompt.title}"
TAGS: ${Array.isArray(prompt.tags) && prompt.tags.length > 0 ? prompt.tags.join(', ') : 'none'}
PROMPT TEXT: "${prompt.prompt.substring(0, 800)}${prompt.prompt.length > 800 ? '...' : ''}"

Return this exact JSON (no markdown backticks):
{
  "customizationTips": [
    "Tip 1 specific to this prompt",
    "Tip 2 specific to this prompt",
    "Tip 3 specific to this prompt",
    "Tip 4 specific to this prompt (optional)"
  ],
  "troubleshootingEntries": [
    {
      "issue": "Specific problem users might see with THIS prompt",
      "why_it_happens": "Why AI models struggle with this particular aspect",
      "fix": "Specific workaround for THIS prompt's unique elements"
    }
  ]
}`;

  const message = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 1200,
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
      customizationTips: Array.isArray(parsed.customizationTips)
        ? parsed.customizationTips.filter(t => String(t).trim()).slice(0, 4)
        : [],
      troubleshootingEntries: Array.isArray(parsed.troubleshootingEntries)
        ? parsed.troubleshootingEntries
          .filter(e => e.issue && e.why_it_happens && e.fix)
          .slice(0, 3)
        : [],
    };
  } catch (error) {
    console.error(`Failed to parse response for prompt "${prompt.title}":`, content.text.substring(0, 200));
    throw error;
  }
}

async function migratePrompts(dryRun = true, sampleOnly = false) {
  const pool = getPgPool();

  try {
    // Get all published prompts
    let query = `
      SELECT
        id,
        title,
        slug,
        prompt,
        tags,
        customization_tips,
        prompt_specific_troubleshooting,
        intro,
        best_use_case
      FROM prompts
      WHERE status = 'published'
      ORDER BY id
    `;

    if (sampleOnly) {
      query += ' LIMIT 5';
    }

    const result = await pool.query(query);
    const prompts = result.rows;

    console.log(`\n=== PROMPT BOILERPLATE REGENERATION ===\n`);
    console.log(`Target: ${prompts.length} prompts`);
    console.log(`Mode: ${sampleOnly ? 'SAMPLE (5 prompts only)' : 'FULL (all prompts)'}`);
    console.log(`Dry run: ${dryRun ? 'YES (no changes)' : 'NO (will update DB)'}\n`);

    const updates = [];
    const beforeAfter = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      process.stdout.write(`[${i + 1}/${prompts.length}] ${prompt.title.substring(0, 50)}... `);

      try {
        const guidance = await generatePromptGuidance(prompt);

        beforeAfter.push({
          id: prompt.id,
          title: prompt.title,
          slug: prompt.slug,
          before: {
            customizationTips: prompt.customization_tips || [],
            troubleshooting: prompt.prompt_specific_troubleshooting || [],
          },
          after: {
            customizationTips: guidance.customizationTips,
            troubleshooting: guidance.troubleshootingEntries,
          },
        });

        if (!dryRun) {
          updates.push({
            id: prompt.id,
            customizationTips: guidance.customizationTips,
            troubleshooting: guidance.troubleshootingEntries,
          });
        }

        console.log('✓');
      } catch (error) {
        console.log(`✗ ERROR: ${error.message.substring(0, 60)}`);
      }

      // Rate limiting
      if (i < prompts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    // Apply updates to database
    if (!dryRun && updates.length > 0) {
      console.log(`\n\nApplying ${updates.length} updates to database...\n`);
      for (let i = 0; i < updates.length; i++) {
        const update = updates[i];
        await pool.query(
          `UPDATE prompts
           SET customization_tips = $2::jsonb,
               prompt_specific_troubleshooting = $3::jsonb,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            update.id,
            JSON.stringify(update.customizationTips),
            JSON.stringify(update.troubleshooting),
          ],
        );
        if ((i + 1) % 20 === 0) {
          console.log(`  Updated ${i + 1}/${updates.length}...`);
        }
      }
      console.log(`✓ Successfully updated ${updates.length} prompts`);
    }

    // Show before/after samples
    console.log('\n\n=== BEFORE/AFTER SAMPLES ===\n');
    for (const item of beforeAfter) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`PROMPT: ${item.title}`);
      console.log(`SLUG: ${item.slug}`);
      console.log(`${'='.repeat(70)}`);

      console.log('\n📋 CUSTOMIZATION TIPS:');
      console.log('\nBEFORE (boilerplate):');
      if (item.before.customizationTips.length === 0) {
        console.log('  (none - would use auto-generated fallback)');
      } else {
        item.before.customizationTips.forEach((tip, i) => {
          console.log(`  ${i + 1}. ${tip.substring(0, 80)}${tip.length > 80 ? '...' : ''}`);
        });
      }

      console.log('\nAFTER (prompt-specific):');
      item.after.customizationTips.forEach((tip, i) => {
        console.log(`  ${i + 1}. ${tip}`);
      });

      console.log('\n🔧 TROUBLESHOOTING:');
      console.log('\nBEFORE (boilerplate):');
      if (item.before.troubleshooting.length === 0) {
        console.log('  (none - would use auto-generated fallback)');
      } else {
        item.before.troubleshooting.forEach((entry, i) => {
          console.log(`  ${i + 1}. Issue: ${entry.issue.substring(0, 60)}${entry.issue.length > 60 ? '...' : ''}`);
        });
      }

      console.log('\nAFTER (prompt-specific):');
      item.after.troubleshooting.forEach((entry, i) => {
        console.log(`  ${i + 1}. Issue: ${entry.issue}`);
        console.log(`     Why: ${entry.why_it_happens}`);
        console.log(`     Fix: ${entry.fix}`);
      });
    }

    return {
      total: prompts.length,
      updated: updates.length,
      samples: beforeAfter,
    };
  } catch (error) {
    console.error('\n\nMigration error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// CLI: node script.mjs [--apply] [--sample]
const shouldApply = process.argv.includes('--apply');
const sampleOnly = process.argv.includes('--sample');

migratePrompts(!shouldApply, sampleOnly)
  .then((result) => {
    console.log(`\n\n${'='.repeat(70)}`);
    console.log(`MIGRATION COMPLETE`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Prompts processed: ${result.total}`);
    console.log(`Prompts updated: ${result.updated}`);
    if (!shouldApply) {
      console.log(`\n💡 This was a DRY RUN. To apply changes: npm run db:migrate:boilerplate -- --apply`);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n\nFATAL ERROR:', error);
    process.exit(1);
  });
