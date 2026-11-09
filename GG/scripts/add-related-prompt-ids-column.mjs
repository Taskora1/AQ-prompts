let getPgPool;

async function main() {
  const store = await import('../src/lib/db.js');
  getPgPool = store.getPgPool;
  const db = getPgPool();

  await db.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS related_prompt_ids JSONB NOT NULL DEFAULT '[]'::jsonb
  `);

  const verification = await db.query(`
    SELECT
      COUNT(*)::int AS prompts,
      COUNT(*) FILTER (
        WHERE related_prompt_ids = '[]'::jsonb
      )::int AS empty_overrides,
      COUNT(*) FILTER (
        WHERE jsonb_typeof(related_prompt_ids) <> 'array'
      )::int AS invalid_values
    FROM prompts
  `);

  console.log('Related prompt schema ready:', verification.rows[0]);
}

main()
  .catch((error) => {
    console.error(`Related prompt schema failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration fails before initialization.
    }
  });
