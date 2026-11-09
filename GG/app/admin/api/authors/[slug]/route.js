import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import {
  getAuthorProfileBySlug,
  updateAuthorProfile,
  validateAuthorProfileInput,
} from '@/lib/author-profiles-db';

export async function PUT(request, { params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isSuperAdmin(adminUser)) {
    return NextResponse.json({ error: 'Only a Super Admin can manage author profiles.' }, { status: 403 });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { slug } = await params;
  const validation = validateAuthorProfileInput(input);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Check the highlighted fields.', fields: validation.errors },
      { status: 400 },
    );
  }
  if (validation.data.slug !== slug) {
    return NextResponse.json(
      { error: 'An author URL cannot be changed after creation.', fields: { slug: 'Author URLs are permanent.' } },
      { status: 400 },
    );
  }

  try {
    if (!await getAuthorProfileBySlug(slug)) {
      return NextResponse.json({ error: 'Author profile not found.' }, { status: 404 });
    }
    const author = await updateAuthorProfile(slug, validation.data);
    if (!author) {
      return NextResponse.json({ error: 'Author profile not found.' }, { status: 404 });
    }
    revalidatePath(`/author/${slug}`);
    revalidatePath('/author/[slug]', 'page');
    revalidatePath('/blog');
    revalidatePath('/blog/[slug]', 'page');
    revalidatePath('/sitemap.xml');
    return NextResponse.json({ success: true, author });
  } catch (error) {
    console.error('Author profile update error:', error);
    return NextResponse.json({ error: 'The author profile could not be updated.' }, { status: 500 });
  }
}
