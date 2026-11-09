import { NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { revalidateTextPromptLibrary } from '@/lib/text-prompt-revalidation';
import {
  insertTextPrompt,
  validateTextPromptInput,
} from '@/lib/text-prompts-admin-db';

export async function POST(request) {
  if (!await getCurrentAdminUser()) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

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
    const created = await insertTextPrompt(validation.data);
    if (created.status === 'published') revalidateTextPromptLibrary();
    return NextResponse.json({ success: true, prompt: created }, { status: 201 });
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
    console.error('Admin Text prompt creation error:', error);
    return NextResponse.json({ error: 'The Text prompt could not be saved.' }, { status: 500 });
  }
}