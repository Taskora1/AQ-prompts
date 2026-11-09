import { NextResponse } from 'next/server';

import {
  getCurrentAdminUser,
  isSuperAdmin,
} from '@/lib/admin-session';
import {
  clearCategoriesCache,
  createCategory,
  validateCategoryInput,
} from '@/lib/categories-db';

export async function POST(request) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isSuperAdmin(adminUser)) {
    return NextResponse.json(
      { error: 'Only a Super Admin can create categories.' },
      { status: 403 },
    );
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const validation = validateCategoryInput(input);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Check the highlighted fields.', fields: validation.errors },
      { status: 400 },
    );
  }

  try {
    const category = await createCategory(validation.data);
    clearCategoriesCache();
    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (error) {
    if (error?.code === '23505') {
      return NextResponse.json(
        {
          error: 'A category with that name or slug already exists.',
          fields: {
            name: 'Name must be unique.',
            slug: 'Slug must be unique.',
          },
        },
        { status: 409 },
      );
    }

    console.error('Admin category creation error:', error);
    return NextResponse.json(
      { error: 'The category could not be created.' },
      { status: 500 },
    );
  }
}
