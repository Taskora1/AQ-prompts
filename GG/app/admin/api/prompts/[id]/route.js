import { after, NextResponse } from 'next/server';

import { revalidatePromptContent } from '@/lib/admin-prompt-revalidation';
import {
  getCurrentAdminUser,
  isSuperAdmin,
} from '@/lib/admin-session';
import { clearPromptsCache } from '@/lib/prompts-db';
import { getPgPool } from '@/lib/db';
import { shouldNoIndexPrompt } from '@/lib/prompt-constants';
import { submitToIndexNow } from '@/lib/indexnow';
import { SITE_URL } from '@/lib/seo';
import {
  deleteAdminPrompt,
  getAdminPromptById,
  updateAdminPrompt,
  validateAdminPromptInput,
} from '@/lib/prompts-admin-db';

/**
 * Recompute and persist should_noindex for a prompt after update.
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

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request, { params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const routeParams = await params;
  const id = parseId(routeParams?.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid prompt ID.' }, { status: 400 });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const validation = validateAdminPromptInput(input, { promptId: id });
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Check the highlighted fields.', fields: validation.errors },
      { status: 400 },
    );
  }

  try {
    const existing = await getAdminPromptById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Prompt not found.' }, { status: 404 });
    }

    const updated = await updateAdminPrompt(id, validation.data, { existing });
    await recomputePromptNoindex(id, validation.data);
    await clearPromptsCache();
    revalidatePromptContent({
      previousPrompt: existing,
      nextPrompt: updated,
      mutation: 'update',
    });
    if (updated.status !== 'draft' || existing.status !== 'draft') {
      const urls = [];
      if (updated.status !== 'draft') {
        urls.push(`${SITE_URL}/tools/ai-image-prompts/p/${updated.slug}`);
      }
      if (
        existing.status !== 'draft'
        && existing.slug !== updated.slug
      ) {
        urls.push(`${SITE_URL}/tools/ai-image-prompts/p/${existing.slug}`);
      }
      if (urls.length > 0) {
        after(() =>
          submitToIndexNow(urls).catch((error) => {
            console.error('IndexNow prompt submission error:', error);
          })
        );
      }
    }
    return NextResponse.json({ success: true, prompt: updated });
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

    console.error('Admin prompt update error:', error);
    return NextResponse.json(
      { error: 'The prompt could not be updated.' },
      { status: 500 },
    );
  }
}

export async function DELETE(_request, { params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isSuperAdmin(adminUser)) {
    return NextResponse.json(
      { error: 'Only a Super Admin can delete prompts.' },
      { status: 403 },
    );
  }

  const routeParams = await params;
  const id = parseId(routeParams?.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid prompt ID.' }, { status: 400 });
  }

  try {
    const deleted = await deleteAdminPrompt(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Prompt not found.' }, { status: 404 });
    }

    await clearPromptsCache();
    revalidatePromptContent({
      previousPrompt: deleted,
      mutation: 'delete',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin prompt deletion error:', error);
    return NextResponse.json(
      { error: 'The prompt could not be deleted.' },
      { status: 500 },
    );
  }
}
