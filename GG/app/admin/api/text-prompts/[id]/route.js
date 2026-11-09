import { NextResponse } from 'next/server';

import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import { revalidateTextPromptLibrary } from '@/lib/text-prompt-revalidation';
import {
  deleteTextPrompt,
  getTextPromptById,
  updateTextPrompt,
  validateTextPromptInput,
} from '@/lib/text-prompts-admin-db';

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request, { params }) {
  if (!await getCurrentAdminUser()) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const routeParams = await params;
  const id = parseId(routeParams?.id);
  if (!id) return NextResponse.json({ error: 'Invalid prompt ID.' }, { status: 400 });

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const validation = validateTextPromptInput(input);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Check the highlighted fields.', fields: validation.errors },
      { status: 400 },
    );
  }

  try {
    const existing = await getTextPromptById(id);
    if (!existing) return NextResponse.json({ error: 'Text prompt not found.' }, { status: 404 });
    const updated = await updateTextPrompt(id, validation.data);
    if (!updated) return NextResponse.json({ error: 'Text prompt not found.' }, { status: 404 });
    if (existing.status === 'published' || updated.status === 'published') {
      revalidateTextPromptLibrary();
    }
    return NextResponse.json({ success: true, prompt: updated });
  } catch (error) {
    if (error?.code === 'INVALID_CATEGORY_SELECTION') {
      return NextResponse.json(
        { error: error.message, fields: { categoryIds: error.message } },
        { status: 400 },
      );
    }
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'That slug is already in use.', fields: { slug: 'Choose a unique slug.' } },
        { status: 409 },
      );
    }
    console.error('Admin Text prompt update error:', error);
    return NextResponse.json({ error: 'The Text prompt could not be updated.' }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isSuperAdmin(adminUser)) {
    return NextResponse.json(
      { error: 'Only a Super Admin can delete Text prompts.' },
      { status: 403 },
    );
  }

  const routeParams = await params;
  const id = parseId(routeParams?.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid prompt ID.' }, { status: 400 });
  }

  try {
    const deleted = await deleteTextPrompt(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Text prompt not found.' }, { status: 404 });
    }
    revalidateTextPromptLibrary();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin Text prompt deletion error:', error);
    return NextResponse.json(
      { error: 'The Text prompt could not be deleted.' },
      { status: 500 },
    );
  }
}