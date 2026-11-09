import { getPgPool } from '../src/lib/db.js';
import { isMigrationRunnerAuthorized } from './lib/database-migration-safety.mjs';

let pool;

export async function applyPromptLibraryCategoriesMigration(client) {
  await client.query('BEGIN');
  try {
    const readOnly = await client.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only !== 'off') {
      throw new Error('The migration requires a writable database connection.');
    }

    await client.query(`
      ALTER TABLE public.categories
      ADD COLUMN IF NOT EXISTS library_type TEXT NOT NULL DEFAULT 'photo'
    `);

    const existingConstraint = await client.query(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'public.categories'::regclass
        AND conname = 'categories_library_type_check'
    `);
    if (existingConstraint.rowCount === 0) {
      await client.query(`
        ALTER TABLE public.categories
        ADD CONSTRAINT categories_library_type_check
        CHECK (library_type IN ('photo', 'text'))
      `);
    } else {
      const definition = String(existingConstraint.rows[0].definition || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[()]/g, '');
      const expectedDefinition = "checklibrary_type=anyarray['photo'::text,'text'::text]";
      if (definition !== expectedDefinition) {
        throw new Error('Existing category library_type constraint is incompatible.');
      }
    }

    await client.query('ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_slug_key');
    await client.query('DROP INDEX IF EXISTS public.categories_name_lower_unique');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS categories_library_type_slug_unique
      ON public.categories (library_type, slug)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS categories_library_type_name_lower_unique
      ON public.categories (library_type, LOWER(name))
    `);

    await client.query(`
      INSERT INTO public.categories (name, slug, library_type)
      SELECT source.name, source.slug, 'text'
      FROM (
        SELECT c.name, c.slug
        FROM public.categories c
        JOIN public.prompt_categories pc ON pc.category_id = c.id
        JOIN public.prompts p ON p.id = pc.prompt_id
        WHERE p.library_type = 'text'
        UNION
        SELECT c.name, c.slug
        FROM public.categories c
        JOIN public.prompts p ON p.primary_category_id = c.id
        WHERE p.library_type = 'text'
      ) AS source
      ON CONFLICT (library_type, slug) DO NOTHING
    `);

    await client.query(`
      INSERT INTO public.prompt_categories (prompt_id, category_id, position)
      SELECT pc.prompt_id, text_category.id, pc.position
      FROM public.prompt_categories pc
      JOIN public.prompts p ON p.id = pc.prompt_id AND p.library_type = 'text'
      JOIN public.categories photo_category
        ON photo_category.id = pc.category_id AND photo_category.library_type = 'photo'
      JOIN public.categories text_category
        ON text_category.library_type = 'text'
        AND text_category.slug = photo_category.slug
      ON CONFLICT (prompt_id, category_id) DO NOTHING
    `);

    await client.query(`
      UPDATE public.prompts p
      SET primary_category_id = text_category.id
      FROM public.categories photo_category
      JOIN public.categories text_category
        ON text_category.library_type = 'text'
        AND text_category.slug = photo_category.slug
      WHERE p.library_type = 'text'
        AND p.primary_category_id = photo_category.id
        AND photo_category.library_type = 'photo'
    `);

    await client.query(`
      DELETE FROM public.prompt_categories pc
      USING public.prompts p, public.categories c
      WHERE pc.prompt_id = p.id
        AND pc.category_id = c.id
        AND p.library_type = 'text'
        AND c.library_type = 'photo'
    `);

    const verification = await client.query(`
      SELECT
        (SELECT COUNT(*)::int
         FROM public.categories
         WHERE library_type NOT IN ('photo', 'text')) AS invalid_categories,
        (SELECT COUNT(*)::int
         FROM public.prompt_categories pc
         JOIN public.prompts p ON p.id = pc.prompt_id
         JOIN public.categories c ON c.id = pc.category_id
         WHERE p.library_type <> c.library_type) AS mismatched_assignments,
        (SELECT COUNT(*)::int
         FROM public.prompts p
         JOIN public.categories c ON c.id = p.primary_category_id
         WHERE p.library_type <> c.library_type) AS mismatched_primary_categories
    `);
    const counts = verification.rows[0];
    if (
      Number(counts.invalid_categories) !== 0
      || Number(counts.mismatched_assignments) !== 0
      || Number(counts.mismatched_primary_categories) !== 0
    ) {
      throw new Error('Category scope verification failed.');
    }

    await client.query('COMMIT');
    return counts;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function migrate() {
  pool = getPgPool();
  const client = await pool.connect();
  try {
    const result = await applyPromptLibraryCategoriesMigration(client);
    console.log('Prompt library category migration complete:', result);
  } finally {
    client.release();
  }
}

if (isMigrationRunnerAuthorized()) {
  migrate()
    .catch((error) => {
      console.error(`Prompt library category migration failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool?.end();
    });
} else if (process.argv[1]?.replaceAll('\\', '/').endsWith('/separate-prompt-library-categories.mjs')) {
  console.error('Run this migration through scripts/run-database-migration.mjs with an explicit target and environment file.');
  process.exitCode = 1;
}
