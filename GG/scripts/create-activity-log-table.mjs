let getPgPool;

async function main() {
  const paddleStore = await import('../src/lib/db.js');
  getPgPool = paddleStore.getPgPool;
  const db = getPgPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id BIGSERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id BIGINT,
      entity_label TEXT NOT NULL,
      details JSONB,
      actor TEXT NOT NULL DEFAULT 'Admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS activity_log_created_at_idx
    ON activity_log (created_at DESC, id DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS activity_log_action_idx
    ON activity_log (action)
  `);

  const verification = await db.query(`
    SELECT
      to_regclass('public.activity_log')::text AS table_name,
      COUNT(*)::int AS rows
    FROM activity_log
  `);

  console.log('Activity log schema ready:', verification.rows[0]);
}

main()
  .catch((error) => {
    console.error(`Activity log schema failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration fails before initialization.
    }
  });
