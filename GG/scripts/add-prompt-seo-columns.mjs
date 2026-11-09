let getPgPool;

async function main() {
  const paddleStore = await import('../src/lib/db.js');
  getPgPool = paddleStore.getPgPool;
  const db = getPgPool();

  await db.query(`
    ALTER TABLE prompts
      ADD COLUMN IF NOT EXISTS meta_title TEXT,
      ADD COLUMN IF NOT EXISTS meta_description TEXT,
      ADD COLUMN IF NOT EXISTS og_image TEXT
  `);

  const verification = await db.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE meta_title IS NULL)::int AS "nullMetaTitles",
      COUNT(*) FILTER (WHERE meta_description IS NULL)::int AS "nullMetaDescriptions",
      COUNT(*) FILTER (WHERE og_image IS NULL)::int AS "nullOgImages"
    FROM prompts
  `);

  console.log('Prompt SEO schema ready:', verification.rows[0]);
}

main()
  .catch((error) => {
    console.error(`Prompt SEO schema failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration fails before initialization.
    }
  });
