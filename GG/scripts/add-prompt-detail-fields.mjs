import { getPgPool, isDatabaseMigrationConnectionAllowed } from '../src/lib/db.js';

export async function applyPromptDetailFieldsMigration(db) {
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  const ownsClient = client !== db;

  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE prompts
        ADD COLUMN IF NOT EXISTS variations JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS recommended_tool TEXT,
        ADD COLUMN IF NOT EXISTS tool_note TEXT,
        ADD COLUMN IF NOT EXISTS how_to_use JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS tools JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'prompts_variations_array_check'
            AND conrelid = 'prompts'::regclass
        ) THEN
          ALTER TABLE prompts
            ADD CONSTRAINT prompts_variations_array_check
            CHECK (jsonb_typeof(variations) = 'array');
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'prompts_how_to_use_array_check'
            AND conrelid = 'prompts'::regclass
        ) THEN
          ALTER TABLE prompts
            ADD CONSTRAINT prompts_how_to_use_array_check
            CHECK (jsonb_typeof(how_to_use) = 'array');
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'prompts_tools_array_check'
            AND conrelid = 'prompts'::regclass
        ) THEN
          ALTER TABLE prompts
            ADD CONSTRAINT prompts_tools_array_check
            CHECK (jsonb_typeof(tools) = 'array');
        END IF;
      END
      $$;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
}

async function main() {
  await applyPromptDetailFieldsMigration(getPgPool());
  console.log('Prompt detail fields schema ready.');
}

if (isDatabaseMigrationConnectionAllowed('run-database-migration.mjs')) {
  main()
    .catch((error) => {
      const errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
      console.error(`Prompt detail fields schema failed (${errorCode}): ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await getPgPool().end();
      } catch {
        // Pool may not exist if configuration failed before initialization.
      }
    });
}
