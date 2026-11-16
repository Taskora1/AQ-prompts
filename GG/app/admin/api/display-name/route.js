import { NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { updateAdminDisplayName } from '@/lib/admin-users-db';

// Lets a signed-in admin set ONLY their own display name for the agent
// chat. The id always comes from the session — the request body carries
// just the name, so nobody can set another admin's name. The email stays
// the identity; the display name is display-only. An empty name clears
// it back to null (the chat then falls back to the email).
export async function POST(request) {
  try {
    const adminUser = await getCurrentAdminUser();
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const updated = await updateAdminDisplayName(adminUser.id, body?.displayName ?? '');

    if (!updated) {
      return NextResponse.json({ error: 'Admin user not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, displayName: updated.displayName });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to save display name.' },
      { status: 400 },
    );
  }
}
