import { NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { getPgPool } from '@/lib/db.js';

function cleanText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// Guard so the DDL below runs at most once per process lifetime instead of
// on every request (same pattern as ensurePromptEditorialSchema in prompts-db.js).
let collectionsTableDone = false;

async function ensureCollectionsTable() {
  if (collectionsTableDone) return;

  const pool = getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prompt_collections (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      type TEXT DEFAULT 'curated',
      prompt_ids INTEGER[] DEFAULT '{}',
      published BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  collectionsTableDone = true;
}

export async function GET() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const pool = getPgPool();
    const result = await pool.query(`
      SELECT
        id, name, slug, description, type, prompt_ids AS "promptIds",
        published, created_at::text AS "createdAt", updated_at::text AS "updatedAt"
      FROM prompt_collections
      ORDER BY created_at DESC
    `);
    return NextResponse.json({ collections: result.rows });
  } catch (error) {
    console.error('Collections fetch error:', error);
    return NextResponse.json({ collections: [] });
  }
}

export async function POST(request) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = cleanText(input.name);
  const slug = cleanText(input.slug) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }

  try {
    const pool = getPgPool();

    // Ensure table exists (no-op after first successful run in this process)
    await ensureCollectionsTable();

    const result = await pool.query(
      `INSERT INTO prompt_collections (name, slug, description, type, prompt_ids, published)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, slug, description, type, prompt_ids AS "promptIds",
                 published, created_at::text AS "createdAt", updated_at::text AS "updatedAt"`,
      [
        name,
        slug,
        cleanText(input.description || ''),
        cleanText(input.type || 'curated'),
        Array.isArray(input.promptIds) ? input.promptIds : [],
        input.published !== false,
      ]
    );

    return NextResponse.json({ collection: result.rows[0] }, { status: 201 });
  } catch (error) {
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'A collection with that slug already exists.' },
        { status: 409 }
      );
    }
    console.error('Collection creation error:', error);
    return NextResponse.json({ error: 'Could not create collection.' }, { status: 500 });
  }
}