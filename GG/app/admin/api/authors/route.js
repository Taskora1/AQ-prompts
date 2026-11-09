import { NextResponse } from 'next/server';

import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import { revalidateAuthorProfiles } from '@/lib/author-profile-revalidation';
import {
  createAuthorProfile,
  listAuthorProfileOptions,
  validateAuthorProfileInput,
} from '@/lib/author-profiles-db';

export async function GET() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    return NextResponse.json({ success: true, authors: await listAuthorProfileOptions() });
  } catch (error) {
    console.error('Author profile list error:', error);
    return NextResponse.json({ error: 'Author profiles could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request) {
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

  const validation = validateAuthorProfileInput(input);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Check the highlighted fields.', fields: validation.errors },
      { status: 400 },
    );
  }

  try {
    const author = await createAuthorProfile(validation.data);
    revalidateAuthorProfiles();
    return NextResponse.json({ success: true, author }, { status: 201 });
  } catch (error) {
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'That author URL is already in use.', fields: { slug: 'Choose a unique slug.' } },
        { status: 409 },
      );
    }
    console.error('Author profile creation error:', error);
    return NextResponse.json({ error: 'The author profile could not be created.' }, { status: 500 });
  }
}
