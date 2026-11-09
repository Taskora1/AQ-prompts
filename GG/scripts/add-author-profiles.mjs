import { pathToFileURL } from 'node:url';
import { getPgPool } from '../src/lib/db.js';
import { isMigrationRunnerAuthorized } from './lib/database-migration-safety.mjs';

let pool;

export async function applyAuthorProfilesMigration(client) {
  await client.query('BEGIN');
  try {
    const readOnly = await client.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only !== 'off') {
      throw new Error('The migration requires a writable database connection.');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.author_profiles (
        id BIGSERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role_title TEXT NOT NULL DEFAULT '',
        bio TEXT NOT NULL DEFAULT '',
        avatar_url TEXT NOT NULL DEFAULT '',
        social_links JSONB NOT NULL DEFAULT '[]'::jsonb
          CONSTRAINT author_profiles_social_links_array_check
          CHECK (jsonb_typeof(social_links) = 'array'),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      INSERT INTO public.author_profiles
        (slug, name, role_title, bio, avatar_url, social_links)
      VALUES (
        'abdul-qudoos',
        'Abdul Qudoos',
        'Founder and Editor, AQPrompts',
        'Abdul Qudoos creates and reviews AQPrompts guides and prompt-library content for creators using AI image tools.',
        '/images/founder-aqprompts.webp',
        $1::jsonb
      )
      ON CONFLICT (slug) DO NOTHING
    `, [JSON.stringify([
      { name: 'Instagram', href: 'https://www.instagram.com/aqprompt_s/' },
      { name: 'TikTok', href: 'https://www.tiktok.com/@portraitprompts' },
      { name: 'Facebook', href: 'https://www.facebook.com/growthguide.prompts/' },
    ])]);

    const verification = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE slug = 'abdul-qudoos')::int AS founder_profile
      FROM public.author_profiles
    `);
    if (Number(verification.rows[0]?.founder_profile) !== 1) {
      throw new Error('Author profile migration verification failed.');
    }
    await client.query('COMMIT');
    return verification.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function migrate() {
  pool = getPgPool();
  const client = await pool.connect();
  try {
    console.log('Author profile migration complete:', await applyAuthorProfilesMigration(client));
  } finally {
    client.release();
  }
}

if (isMigrationRunnerAuthorized()) {
  migrate()
    .catch((error) => {
      console.error(`Author profile migration failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool?.end();
    });
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error('Run this migration through scripts/run-database-migration.mjs with an explicit target and environment file.');
  process.exitCode = 1;
}
