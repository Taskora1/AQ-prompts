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

    const existingColumn = await client.query(`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'prompts'
        AND column_name = 'library_type'
    `);

    if (existingColumn.rowCount === 0) {
      await client.query(`
        ALTER TABLE public.prompts
        ADD COLUMN library_type TEXT NOT NULL DEFAULT 'photo'
      `);
    } else {
      const column = existingColumn.rows[0];
      if (
        column.data_type !== 'text'
        || column.is_nullable !== 'NO'
        || String(column.column_default || '').replace(/\s+/g, '') !== "'photo'::text"
      ) {
        throw new Error('Existing library_type column is incompatible; no schema changes were applied.');
      }
    }

    const existingConstraint = await client.query(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'public.prompts'::regclass
        AND conname = 'prompts_library_type_check'
    `);

    if (existingConstraint.rowCount === 0) {
      await client.query(`
        ALTER TABLE public.prompts
        ADD CONSTRAINT prompts_library_type_check
        CHECK (library_type IN ('photo', 'text'))
      `);
    } else {
      const definition = String(existingConstraint.rows[0].definition || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[()]/g, '');
      const expectedDefinition = "checklibrary_type=anyarray['photo'::text,'text'::text]";
      if (definition !== expectedDefinition) {
        throw new Error('Existing library_type constraint is incompatible; no schema changes were applied.');
      }
    }

    const verification = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE library_type = 'photo')::int AS photo,
        COUNT(*) FILTER (WHERE library_type = 'text')::int AS text,
        COUNT(*) FILTER (
          WHERE library_type IS NULL
            OR library_type NOT IN ('photo', 'text')
        )::int AS invalid
      FROM public.prompts
    `);
    if (verification.rows[0].invalid !== 0) {
      throw new Error('library_type verification failed; no changes were committed.');
    }

    await client.query('COMMIT');
    console.log('Prompt library type migration complete:', verification.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

migrate()
  .catch((error) => {
    console.error(`Prompt library type migration failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end();
  });
