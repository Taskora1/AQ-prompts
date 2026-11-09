import fs from 'node:fs/promises';
import path from 'node:path';
import { getPromptEligibilityFlags } from '../src/lib/prompts-db.js';

const promptsFile = path.join(process.cwd(), 'public', 'data', 'prompts-index.json');
let getPgPool;

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function jsonArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

async function loadPrompts() {
  const raw = await fs.readFile(promptsFile, 'utf8');
  const payload = JSON.parse(raw);

  if (!Array.isArray(payload.prompts)) {
    throw new Error('public/data/prompts-index.json does not contain a prompts array.');
  }

  const invalidRows = payload.prompts
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => !optionalText(item.title) || !optionalText(item.prompt) || !optionalText(item.slug));

  if (invalidRows.length > 0) {
    const indexes = invalidRows.map(({ index }) => index).join(', ');
    throw new Error(`Prompt rows are missing title, prompt, or slug at indexes: ${indexes}`);
  }

  const slugs = payload.prompts.map((item) => optionalText(item.slug));
  const duplicateSlugs = [...new Set(slugs.filter((slug, index) => slugs.indexOf(slug) !== index))];

  if (duplicateSlugs.length > 0) {
    throw new Error(`Duplicate prompt slugs found: ${duplicateSlugs.join(', ')}`);
  }

  return payload.prompts;
}

async function ensurePromptsSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS prompts (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      image TEXT,
      images JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(images) = 'array'),
      category TEXT,
      categories JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(categories) = 'array'),
      use_case TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(tags) = 'array'),
      created_at DATE,
      intro TEXT,
      unique_feature TEXT,
      best_use_case TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_public_eligible BOOLEAN NOT NULL DEFAULT false
    )
  `);

  await db.query('CREATE INDEX IF NOT EXISTS prompts_category_idx ON prompts (category)');
  await db.query('CREATE INDEX IF NOT EXISTS prompts_created_at_idx ON prompts (created_at DESC)');

  await db.query(`
    CREATE OR REPLACE FUNCTION set_prompts_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await db.query('DROP TRIGGER IF EXISTS prompts_set_updated_at ON prompts');
  await db.query(`
    CREATE TRIGGER prompts_set_updated_at
    BEFORE UPDATE ON prompts
    FOR EACH ROW
    EXECUTE FUNCTION set_prompts_updated_at()
  `);
}

async function migratePrompts(db, prompts) {
  const insertPrompt = `
    INSERT INTO prompts (
      title,
      prompt,
      slug,
      image,
      images,
      category,
      categories,
      use_case,
      tags,
      created_at,
      intro,
      unique_feature,
      best_use_case,
      is_public_eligible
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5::jsonb,
      $6,
      $7::jsonb,
      $8,
      $9::jsonb,
      $10,
      $11,
      $12,
      $13,
      $14
    )
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title,
      prompt = EXCLUDED.prompt,
      image = EXCLUDED.image,
      images = EXCLUDED.images,
      category = EXCLUDED.category,
      categories = EXCLUDED.categories,
      use_case = EXCLUDED.use_case,
      tags = EXCLUDED.tags,
      created_at = EXCLUDED.created_at,
      intro = EXCLUDED.intro,
      unique_feature = EXCLUDED.unique_feature,
      best_use_case = EXCLUDED.best_use_case,
      is_public_eligible = EXCLUDED.is_public_eligible
  `;

  await db.query('BEGIN');

  try {
    for (const item of prompts) {
      const eligibility = getPromptEligibilityFlags(item);
      await db.query(insertPrompt, [
        optionalText(item.title),
        optionalText(item.prompt),
        optionalText(item.slug),
        optionalText(item.image),
        jsonArray(item.images),
        optionalText(item.category),
        jsonArray(item.categories),
        optionalText(item.useCase),
        jsonArray(item.tags),
        optionalText(item.createdAt),
        optionalText(item.intro),
        optionalText(item.uniqueFeature),
        optionalText(item.bestUseCase),
        eligibility.isPublicEligible,
      ]);
    }

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const prompts = await loadPrompts();
  const verifyOnly = process.argv.includes('--verify-only');
  const paddleStore = await import('../src/lib/db.js');
  getPgPool = paddleStore.getPgPool;
  const db = getPgPool();

  if (!verifyOnly) {
    await ensurePromptsSchema(db);
    await migratePrompts(db, prompts);
  }

  const countResult = await db.query('SELECT COUNT(*)::int AS count FROM prompts');
  const sampleResult = await db.query(`
    SELECT
      id,
      title,
      slug,
      category,
      created_at::text AS "createdAt",
      image,
      updated_at::text AS "updatedAt"
    FROM prompts
    ORDER BY id
    LIMIT 3
  `);
  const databaseCount = countResult.rows[0]?.count ?? 0;

  if (databaseCount !== prompts.length) {
    throw new Error(
      `Migration validation failed: JSON contains ${prompts.length} prompts but the database contains ${databaseCount}.`,
    );
  }

  const action = verifyOnly ? 'verification' : 'migration';
  console.log(`Prompt ${action} complete: ${databaseCount} rows match ${prompts.length} JSON prompts.`);
  console.log('Sample rows:');
  console.log(JSON.stringify(sampleResult.rows, null, 2));
}

main()
  .catch((error) => {
    const errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`Prompt migration failed (${errorCode}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration failed before initialization.
    }
  });
