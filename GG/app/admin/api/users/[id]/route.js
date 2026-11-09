import { NextResponse } from 'next/server';

import {
  getCurrentAdminUser,
  isSuperAdmin,
} from '@/lib/admin-session';
import {
  deleteAdminUser,
  updateAdminUserRole,
  validateAdminRole,
} from '@/lib/admin-users-db';

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function authorize() {
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) {
    return {
      response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }),
    };
  }
  if (!isSuperAdmin(currentUser)) {
    return {
      response: NextResponse.json(
        { error: 'Only a Super Admin can manage administrator accounts.' },
        { status: 403 },
      ),
    };
  }

  return { currentUser };
}

export async function PUT(request, { params }) {
  const authorization = await authorize();
  if (authorization.response) return authorization.response;

  const routeParams = await params;
  const id = parseId(routeParams?.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid user ID.' }, { status: 400 });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const validation = validateAdminRole(input);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Check the highlighted fields.', fields: validation.errors },
      { status: 400 },
    );
  }

  try {
    const result = await updateAdminUserRole(id, validation.data.role);
    if (result.reason === 'not_found') {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }
    if (result.reason === 'last_super_admin') {
      return NextResponse.json(
        { error: 'The last remaining Super Admin cannot be demoted.' },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, user: result.user });
  } catch (error) {
    console.error('Admin user role update error:', error);
    return NextResponse.json(
      { error: 'The account role could not be updated.' },
      { status: 500 },
    );
  }
}

export async function DELETE(_request, { params }) {
  const authorization = await authorize();
  if (authorization.response) return authorization.response;

  const routeParams = await params;
  const id = parseId(routeParams?.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid user ID.' }, { status: 400 });
  }

  try {
    const result = await deleteAdminUser(id);
    if (result.reason === 'not_found') {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }
    if (result.reason === 'last_super_admin') {
      return NextResponse.json(
        { error: 'The last remaining Super Admin cannot be removed.' },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin user deletion error:', error);
    return NextResponse.json(
      { error: 'The administrator account could not be removed.' },
      { status: 500 },
    );
  }
}
