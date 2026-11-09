import { NextResponse } from 'next/server';

import {
  getCurrentAdminUser,
  isSuperAdmin,
} from '@/lib/admin-session';
import {
  createAdminUser,
  validateNewAdminUser,
} from '@/lib/admin-users-db';

export async function POST(request) {
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isSuperAdmin(currentUser)) {
    return NextResponse.json(
      { error: 'Only a Super Admin can create administrator accounts.' },
      { status: 403 },
    );
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const validation = validateNewAdminUser(input);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Check the highlighted fields.', fields: validation.errors },
      { status: 400 },
    );
  }

  try {
    const user = await createAdminUser(validation.data);
    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    if (error?.code === '23505') {
      return NextResponse.json(
        {
          error: 'An account with that email already exists.',
          fields: { email: 'Email addresses must be unique.' },
        },
        { status: 409 },
      );
    }

    console.error('Admin user creation error:', error);
    return NextResponse.json(
      { error: 'The administrator account could not be created.' },
      { status: 500 },
    );
  }
}
