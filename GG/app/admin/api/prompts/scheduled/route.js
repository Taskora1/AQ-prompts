import { after, NextResponse } from 'next/server';

import { revalidatePromptContent } from '@/lib/admin-prompt-revalidation';
import { getCurrentAdminUser } from '@/lib/admin-session';
import { getPgPool } from '@/lib/db.js';
import { getPromptEligibilityFlags } from '@/lib/prompts-db';
import { submitToIndexNow } from '@/lib/indexnow';
import { SITE_URL } from '@/lib/seo';

// Guard so the DDL below runs at most once per process lifetime instead of
// on every request (same pattern as ensurePromptEditorialSchema in prompts-db.js).
let scheduledAtSchemaDone = false;

async function ensureScheduledAtColumn() {
  if (scheduledAtSchemaDone) return;

  const pool = getPgPool();
  await pool.query(`
    ALTER TABLE prompts
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ
  `);
  scheduledAtSchemaDone = true;
}

/**
 * GET: List prompts with scheduled publish dates
 * POST: Auto-publish any prompts whose scheduled date has passed
 */
export async function GET() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const pool = getPgPool();

    // Ensure column exists (no-op after first successful run in this process)
    await ensureScheduledAtColumn();

    const result = await pool.query(`
      SELECT id, title, slug, status, scheduled_at::text AS "scheduledAt",
             created_at::text AS "createdAt"
      FROM prompts
      WHERE scheduled_at IS NOT NULL
        AND scheduled_at > NOW()
        AND status = 'draft'
        AND library_type = 'photo'
      ORDER BY scheduled_at ASC
      LIMIT 50
    `);

    return NextResponse.json({ scheduled: result.rows });
  } catch (error) {
    console.error('Scheduled prompts fetch error:', error);
    return NextResponse.json({ scheduled: [] });
  }
}

export async function POST() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const pool = getPgPool();

    // Ensure column exists (no-op after first successful run in this process)
    await ensureScheduledAtColumn();

    // FOR UPDATE OF p stays in the SQL: it is a no-op on the Neon HTTP
    // driver and the D1 adapter strips it. The UPDATE below re-checks
    // the draft/scheduled conditions per row, so a prompt published
    // concurrently is simply not returned — same as the original
    // single-statement form.
    const duePrompts = await pool.query(`
      SELECT
        p.id, p.title, p.prompt, p.slug, p.image, p.images, p.category,
        p.use_case AS "useCase", p.tags, p.og_image AS "ogImage", p.intro,
        COALESCE((SELECT JSONB_AGG(c.name ORDER BY pc.position, c.id)
          FROM prompt_categories pc
          JOIN categories c ON c.id = pc.category_id
          WHERE pc.prompt_id = p.id), p.categories, '[]'::jsonb) AS categories
      FROM prompts p
      WHERE p.status = 'draft'
        AND p.scheduled_at IS NOT NULL
        AND p.scheduled_at <= NOW()
        AND p.library_type = 'photo'
      ORDER BY p.id
      FOR UPDATE OF p
    `);
    const eligibility = duePrompts.rows.map((prompt) => ({
      id: prompt.id,
      ...getPromptEligibilityFlags(prompt),
    }));

    // Publish the due prompts. The original single UPDATE joined the
    // eligibility flags in with jsonb_to_recordset, which has no SQLite
    // equivalent; instead each due prompt gets a guarded UPDATE (the
    // WHERE re-checks the draft/scheduled conditions, so a prompt that
    // changed state since the SELECT above is skipped) and all of them
    // run as one atomic batch via runTransaction — the same atomicity
    // the single statement had.
    let result = { rows: [] };
    if (eligibility.length > 0) {
      const updates = eligibility.map((item) => ({
        text: `
          UPDATE prompts
          SET status = 'published',
              scheduled_at = NULL,
              updated_at = NOW(),
              is_public_eligible = $2
          WHERE id = $1
            AND status = 'draft'
            AND scheduled_at IS NOT NULL
            AND scheduled_at <= NOW()
            AND library_type = 'photo'
          RETURNING id, title, slug
        `,
        values: [item.id, item.isPublicEligible],
      }));
      const updateResults = await pool.runTransaction(updates);
      result = { rows: updateResults.flatMap((update) => update.rows) };
    }

    // Revalidate cache for each published prompt
    for (const prompt of result.rows) {
      revalidatePromptContent({
        nextPrompt: prompt,
        mutation: 'update',
      });
    }
    if (result.rows.length > 0) {
      after(() =>
        submitToIndexNow(
          result.rows.map((prompt) =>
            `${SITE_URL}/tools/ai-image-prompts/p/${prompt.slug}`
          ),
        ).catch((error) => {
          console.error('IndexNow scheduled prompt submission error:', error);
        })
      );
    }

    return NextResponse.json({
      published: result.rows.length,
      prompts: result.rows,
    });
  } catch (error) {
    console.error('Auto-publish error:', error);
    return NextResponse.json({ error: 'Auto-publish failed.' }, { status: 500 });
  }
}