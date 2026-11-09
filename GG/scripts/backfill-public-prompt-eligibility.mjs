import { getPgPool } from '../src/lib/db.js';
import { isIndexablePrompt } from '../src/lib/prompt-constants.js';
import {
  getPromptEligibilityFlags,
  normalizePromptSlim,
} from '../src/lib/prompts-db.js';

let pool;

function promptPolicyInput(row) {
  return {
    slug: row.slug,
    title: row.title,
    prompt: row.prompt,
    intro: row.intro || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    useCase: row.use_case || '',
    image: row.image || '',
    images: Array.isArray(row.images) ? row.images : [],
    ogImage: row.og_image || '',
  };
}

async function backfill() {
  pool = getPgPool();
  const client = await pool.connect();

  try {
    const columns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'prompts'
        AND column_name = ANY($1::text[])
    `, [['is_public_eligible']]);
    if (columns.rowCount !== 1) {
      throw new Error('Run add-public-prompt-eligibility.mjs before this backfill.');
    }

    const result = await client.query(`
      SELECT
        p.id, p.library_type, p.status, p.should_noindex,
        p.title, p.prompt, p.slug, p.image, p.images, p.category, p.categories,
        p.use_case, p.tags, p.og_image, p.intro,
        COALESCE(assigned.names, p.categories, '[]'::jsonb) AS "assignedCategoryNames"
      FROM public.prompts p
      LEFT JOIN LATERAL (
        SELECT JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names
        FROM prompt_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.prompt_id = p.id
      ) assigned ON true
      ORDER BY p.id
    `);

    const updates = [];
    let matches = 0;
    let comparisons = 0;
    const mismatches = [];

    for (const row of result.rows) {
      const policyInput = promptPolicyInput(row);
      let isPublicEligible;

      if (row.library_type === 'photo') {
        const legacyDirectoryPrompt = normalizePromptSlim({
          ...policyInput,
          category: row.category,
          categories: row.assignedCategoryNames,
        }, { resolveLegacyMedia: true });
        const legacyDirectoryEligible = isIndexablePrompt(legacyDirectoryPrompt);
        const computed = getPromptEligibilityFlags({
          ...policyInput,
          category: row.category,
          categories: row.assignedCategoryNames,
        });

        comparisons += 1;
        if (computed.isPublicEligible === legacyDirectoryEligible) matches += 1;
        else mismatches.push({ id: row.id, policy: 'directory' });
        ({ isPublicEligible } = computed);
      } else {
        const legacyTextEligible = row.status === 'published'
          && !row.should_noindex
          && isIndexablePrompt(policyInput);
        isPublicEligible = isIndexablePrompt(policyInput);
        const computedTextEligible = row.status === 'published'
          && !row.should_noindex
          && isPublicEligible;
        comparisons += 1;
        if (computedTextEligible === legacyTextEligible) matches += 1;
        else mismatches.push({ id: row.id, policy: 'text-library' });
      }

      updates.push({
        id: row.id,
        is_public_eligible: isPublicEligible,
      });
    }

    console.log(`Total prompt rows: ${result.rowCount}`);
    console.log(`Eligibility comparisons: ${comparisons}`);
    console.log(`Matches: ${matches}`);
    console.log(`Mismatches: ${mismatches.length}`);
    if (mismatches.length) {
      console.error('Backfill stopped; no flags were written. Mismatched IDs/policies:', mismatches);
      throw new Error('Eligibility equivalence must be 100% before backfill.');
    }

    await client.query('BEGIN');
    for (let offset = 0; offset < updates.length; offset += 500) {
      await client.query(`
        UPDATE public.prompts AS prompt
        SET is_public_eligible = update_row.is_public_eligible
        FROM jsonb_to_recordset($1::jsonb) AS update_row(
          id bigint,
          is_public_eligible boolean
        )
        WHERE prompt.id = update_row.id
      `, [JSON.stringify(updates.slice(offset, offset + 500))]);
    }
    await client.query('COMMIT');
    console.log(`Updated eligibility flags for ${updates.length} prompts.`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(`Backfill rollback failed: ${rollbackError.message}`);
    }
    throw error;
  } finally {
    client.release();
  }
}

backfill()
  .catch((error) => {
    console.error(`Public prompt eligibility backfill failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end();
  });
