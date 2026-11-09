let getPgPool;

async function main() {
  const paddleStore = await import('../src/lib/db.js');
  getPgPool = paddleStore.getPgPool;
  const db = getPgPool();

  await db.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS faqs JSONB NOT NULL DEFAULT '[]'::jsonb
  `);

  await db.query(`
    UPDATE prompts
    SET faqs = '[]'::jsonb
    WHERE faqs IS NULL OR jsonb_typeof(faqs) <> 'array'
  `);

  await db.query(`
    ALTER TABLE prompts
    ALTER COLUMN faqs SET DEFAULT '[]'::jsonb,
    ALTER COLUMN faqs SET NOT NULL
  `);

  const constraint = await db.query(`
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prompts_faqs_array_check'
      AND conrelid = 'prompts'::regclass
  `);

  if (constraint.rowCount === 0) {
    await db.query(`
      ALTER TABLE prompts
      ADD CONSTRAINT prompts_faqs_array_check
      CHECK (jsonb_typeof(faqs) = 'array')
    `);
  }

  const verification = await db.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE jsonb_array_length(faqs) = 0)::int AS empty
    FROM prompts
  `);

  console.log('Prompts FAQ schema ready:', verification.rows[0]);
}

main()
  .catch((error) => {
    console.error(`Prompts FAQ schema failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration fails before initialization.
    }
  });
