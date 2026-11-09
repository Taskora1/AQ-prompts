import { getPgPool } from '../src/lib/db.js';
import { isMigrationRunnerAuthorized } from './lib/database-migration-safety.mjs';

let pool;

export async function deleteTextPortraitCategories(client) {
  await client.query('BEGIN');
  try {
    const readOnly = await client.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only !== 'off') {
      throw new Error('The migration requires a writable database connection.');
    }

    const targets = await client.query(`
      SELECT id, name
      FROM public.categories
      WHERE library_type = 'text'
        AND name IN ('Business Portraits', 'Female Portraits')
      FOR UPDATE
    `);
    const targetIds = targets.rows.map((row) => Number(row.id));
    const promptUpdates = await client.query(`
      WITH affected AS (
        SELECT p.id
        FROM public.prompts p
        WHERE p.library_type = 'text'
          AND p.primary_category_id = ANY($1::bigint[])
        UNION
        SELECT pc.prompt_id
        FROM public.prompt_categories pc
        JOIN public.prompts p ON p.id = pc.prompt_id AND p.library_type = 'text'
        WHERE pc.category_id = ANY($1::bigint[])
      )
      UPDATE public.prompts p
      SET
        primary_category_id = remaining.primary_category_id,
        category = remaining.primary_category_name,
        categories = remaining.category_names
      FROM affected a
      LEFT JOIN LATERAL (
        SELECT
          (array_agg(c.id ORDER BY pc.position))[1] AS primary_category_id,
          (array_agg(c.name ORDER BY pc.position))[1] AS primary_category_name,
          COALESCE(jsonb_agg(c.name ORDER BY pc.position), '[]'::jsonb) AS category_names
        FROM public.prompt_categories pc
        JOIN public.categories c ON c.id = pc.category_id
        WHERE pc.prompt_id = a.id
          AND c.library_type = 'text'
          AND NOT (c.id = ANY($1::bigint[]))
      ) remaining ON TRUE
      WHERE p.id = a.id
    `, [targetIds]);

    const assignments = await client.query(`
      DELETE FROM public.prompt_categories pc
      USING public.prompts p
      WHERE pc.prompt_id = p.id
        AND p.library_type = 'text'
        AND pc.category_id = ANY($1::bigint[])
    `, [targetIds]);
    const categories = await client.query(`
      DELETE FROM public.categories
      WHERE id = ANY($1::bigint[])
        AND library_type = 'text'
      RETURNING id, name
    `, [targetIds]);

    const verification = await client.query(`
      SELECT
        (SELECT COUNT(*)::int
         FROM public.categories
         WHERE library_type = 'text'
           AND name IN ('Business Portraits', 'Female Portraits')) AS categories_remaining,
        (SELECT COUNT(*)::int
         FROM public.prompts p
         JOIN public.prompt_categories pc ON pc.prompt_id = p.id
         JOIN public.categories c ON c.id = pc.category_id
         WHERE p.library_type = 'text'
           AND c.name IN ('Business Portraits', 'Female Portraits')) AS assignments_remaining,
        (SELECT COUNT(*)::int
         FROM public.prompts p
         JOIN public.categories c ON c.id = p.primary_category_id
         WHERE p.library_type = 'text'
           AND c.name IN ('Business Portraits', 'Female Portraits')) AS primary_categories_remaining
    `);
    const counts = verification.rows[0];
    if (
      Number(counts.categories_remaining) !== 0
      || Number(counts.assignments_remaining) !== 0
      || Number(counts.primary_categories_remaining) !== 0
    ) {
      throw new Error('Text Portrait category deletion verification failed.');
    }

    await client.query('COMMIT');
    return {
      categoriesDeleted: categories.rowCount,
      promptsUpdated: promptUpdates.rowCount,
      assignmentsRemoved: assignments.rowCount,
      categoriesRemaining: Number(counts.categories_remaining),
      assignmentsRemaining: Number(counts.assignments_remaining),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function migrate() {
  pool = getPgPool();
  const client = await pool.connect();
  try {
    const result = await deleteTextPortraitCategories(client);
    console.log('Text Portrait category deletion complete:', result);
  } finally {
    client.release();
  }
}

if (isMigrationRunnerAuthorized()) {
  migrate()
    .catch((error) => {
      console.error(`Text Portrait category deletion failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool?.end();
    });
} else if (process.argv[1]?.replaceAll('\\', '/').endsWith('/delete-text-portrait-categories.mjs')) {
  console.error('Run this mutation through scripts/run-database-migration.mjs with an explicit target and environment file.');
  process.exitCode = 1;
}
