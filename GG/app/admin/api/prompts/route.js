import { after, NextResponse } from 'next/server';

import { revalidatePromptContent } from '@/lib/admin-prompt-revalidation';
import { getCurrentAdminUser } from '@/lib/admin-session';
import { clearPromptsCache } from '@/lib/prompts-db';
import { getPgPool } from '@/lib/db';
import { shouldNoIndexPrompt } from '@/lib/prompt-constants';
import { submitToIndexNow } from '@/lib/indexnow';
import { SITE_URL } from '@/lib/seo';
import {
  insertAdminPrompt,
  validateAdminPromptInput,
} from '@/lib/prompts-admin-db';

/**
 * Recompute and persist should_noindex for a prompt after create/update.
 * Uses the validated data that was just written to the database.
 */
async function recomputePromptNoindex(promptId, data) {
  const shouldNoindex = shouldNoIndexPrompt({
    slug: data.slug || '',
    title: data.title || '',
    prompt: data.prompt || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    image: data.image || '',
    images: Array.isArray(data.images) ? data.images : [],
    ogImage: data.ogImage || '',
    intro: data.intro || '',
  });
  await getPgPool().query(
    'UPDATE prompts SET should_noindex = $1 WHERE id = $2',
    [shouldNoindex, promptId],
  );
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

  const validation = validateAdminPromptInput(input);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Check the highlighted fields.', fields: validation.errors },
      { status: 400 },
    );
  }

  try {
    const created = await insertAdminPrompt(validation.data);
    await recomputePromptNoindex(created.id, validation.data);
    await clearPromptsCache();
    revalidatePromptContent({
      nextPrompt: created,
      mutation: 'create',
    });
    if (created.status === 'published') {
      after(() =>
        submitToIndexNow([
          `${SITE_URL}/tools/ai-image-prompts/p/${created.slug}`,
        ]).catch((error) => {
          console.error('IndexNow prompt submission error:', error);
        })
      );
    }
    return NextResponse.json({ success: true, prompt: created }, { status: 201 });
  } catch (error) {
    if (error?.code === 'INVALID_CATEGORY_SELECTION') {
      return NextResponse.json(
        {
          error: error.message,
          fields: { categoryIds: error.message },
        },
        { status: 400 },
      );
    }

    if (error?.code === '23505') {
      return NextResponse.json(
        {
          error: 'That slug is already in use.',
          fields: { slug: 'Choose a unique slug.' },
        },
        { status: 409 },
      );
    }

    console.error('Admin prompt creation error:', error);
    return NextResponse.json(
      { error: 'The prompt could not be saved.' },
      { status: 500 },
    );
  }
}
