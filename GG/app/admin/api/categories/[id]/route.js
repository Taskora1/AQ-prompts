import { NextResponse } from 'next/server';

import { revalidateCategoryContent } from '@/lib/admin-prompt-revalidation';
import {
  getCurrentAdminUser,
  isSuperAdmin,
} from '@/lib/admin-session';
import {
  clearCategoriesCache,
  deleteCategory,
  getCategoryById,
  updateCategory,
  validateCategoryInput,
} from '@/lib/categories-db';

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request, { params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isSuperAdmin(adminUser)) {
    return NextResponse.json(
      { error: 'Only a Super Admin can rename categories.' },
      { status: 403 },
    );
  }

  const routeParams = await params;
  const id = parseId(routeParams?.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid category ID.' }, { status: 400 });
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
    const existing = await getCategoryById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    }

    const category = await updateCategory(id, validation.data);
    clearCategoriesCache();
    revalidateCategoryContent({
      previousCategory: existing,
      nextCategory: category,
    });
    return NextResponse.json({ success: true, category });
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

    console.error('Admin category update error:', error);
    return NextResponse.json(
      { error: 'The category could not be updated.' },
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
      { error: 'Only a Super Admin can delete categories.' },
      { status: 403 },
    );
  }

  const routeParams = await params;
  const id = parseId(routeParams?.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid category ID.' }, { status: 400 });
  }

  try {
    const result = await deleteCategory(id);
    clearCategoriesCache();
    if (result.reason === 'not_found') {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    }
    if (result.reason === 'public_page') {
      return NextResponse.json(
        { error: 'This category has a public page and cannot be deleted here.' },
        { status: 409 },
      );
    }
    if (result.reason === 'in_use') {
      const count = result.category.promptCount;
      return NextResponse.json(
        {
          error: `${count} prompt${count === 1 ? '' : 's'} use this category — reassign them first.`,
          promptCount: count,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin category deletion error:', error);
    return NextResponse.json(
      { error: 'The category could not be deleted.' },
      { status: 500 },
    );
  }
}
