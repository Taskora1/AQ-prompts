import { NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { getPgPool } from '@/lib/db.js';

function cleanText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export async function GET(request, { params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await params;
  try {
    const pool = getPgPool();
    const result = await pool.query(
      `SELECT id, name, slug, description, type, prompt_ids AS "promptIds",
              published, created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM prompt_collections WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Collection not found.' }, { status: 404 });
    }
    return NextResponse.json({ collection: result.rows[0] });
  } catch (error) {
    console.error('Collection fetch error:', error);
    return NextResponse.json({ error: 'Could not fetch collection.' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await params;
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    const pool = getPgPool();
    const result = await pool.query(
      `UPDATE prompt_collections SET
         name = COALESCE($1, name),
         slug = COALESCE($2, slug),
         description = COALESCE($3, description),
         type = COALESCE($4, type),
         prompt_ids = COALESCE($5, prompt_ids),
         published = COALESCE($6, published),
         updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, slug, description, type, prompt_ids AS "promptIds",
                 published, created_at::text AS "createdAt", updated_at::text AS "updatedAt"`,
      [
        input.name ? cleanText(input.name) : null,
        input.slug ? cleanText(input.slug) : null,
        input.description !== undefined ? cleanText(input.description) : null,
        input.type ? cleanText(input.type) : null,
        Array.isArray(input.promptIds) ? input.promptIds : null,
        typeof input.published === 'boolean' ? input.published : null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Collection not found.' }, { status: 404 });
    }

    return NextResponse.json({ collection: result.rows[0] });
  } catch (error) {
    console.error('Collection update error:', error);
    return NextResponse.json({ error: 'Could not update collection.' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await params;
  try {
    const pool = getPgPool();
    await pool.query('DELETE FROM prompt_collections WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Collection delete error:', error);
    return NextResponse.json({ error: 'Could not delete collection.' }, { status: 500 });
  }
}