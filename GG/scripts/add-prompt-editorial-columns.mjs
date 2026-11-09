// Use the shared env-loading helper so DATABASE_URL is available
import { getPgPool } from './lib/load-local-env.mjs';

async function main() {
  const db = getPgPool();

  // Keep the public and admin prompt queries compatible with older databases.
  await db.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS prompt_breakdown JSONB,
    ADD COLUMN IF NOT EXISTS prompt_specific_troubleshooting JSONB
  `);

  // customization_tips: JSONB array of 2-4 prompt-specific customization tips
  await db.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS customization_tips JSONB NOT NULL DEFAULT '[]'::jsonb
  `);

  await db.query(`
    UPDATE prompts
    SET customization_tips = '[]'::jsonb
    WHERE customization_tips IS NULL OR jsonb_typeof(customization_tips) <> 'array'
  `);

  // recommended_aspect_ratio: text like '4:5', '1:1', '9:16', '16:9'
  await db.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS recommended_aspect_ratio TEXT
  `);

  // aspect_ratio_reason: concise explanation for the recommended ratio
  await db.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS aspect_ratio_reason TEXT
  `);

  // reviewed_at: editorial review date
  await db.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS reviewed_at DATE
  `);

  // generation_tested: whether the prompt has been generation-tested
  await db.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS generation_tested BOOLEAN NOT NULL DEFAULT false
  `);

  // generation_tested_date: when the generation test was performed
  await db.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS generation_tested_date DATE
  `);

  // generation_tested_tool: which AI tool was used for testing (e.g. 'ChatGPT', 'Midjourney')
  await db.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS generation_tested_tool TEXT
  `);

  // Verify
  const verification = await db.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE customization_tips <> '[]'::jsonb)::int AS has_customization_tips,
      COUNT(*) FILTER (WHERE recommended_aspect_ratio IS NOT NULL)::int AS has_aspect_ratio,
      COUNT(*) FILTER (WHERE reviewed_at IS NOT NULL)::int AS has_reviewed_at,
      COUNT(*) FILTER (WHERE generation_tested)::int AS generation_tested_count
    FROM prompts
  `);

  console.log('Prompt editorial schema ready:', verification.rows[0]);
}

main()
  .catch((error) => {
    const errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`Prompt editorial schema failed (${errorCode}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      getPgPool().end();
    } catch {
      // Pool may not exist if configuration failed before initialization.
    }
  });
