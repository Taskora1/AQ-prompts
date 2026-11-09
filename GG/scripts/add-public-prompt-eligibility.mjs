import { getPgPool } from '../src/lib/db.js';

let pool;

async function migrate() {
  pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const readOnly = await client.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only !== 'off') {
      throw new Error('The migration requires a writable database connection.');
    }

    await client.query(`
      ALTER TABLE public.prompts
      ADD COLUMN IF NOT EXISTS is_public_eligible BOOLEAN NOT NULL DEFAULT false
    `);
    await client.query('COMMIT');
    console.log('Public prompt eligibility columns are ready.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

migrate()
  .catch((error) => {
    console.error(`Public prompt eligibility migration failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end();
  });
