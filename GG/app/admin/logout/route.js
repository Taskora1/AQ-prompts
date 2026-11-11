import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-session-core';
import { bumpAdminSessionVersion } from '@/lib/admin-users-db';
import { clearAdminSession } from '@/lib/admin-session';

export async function POST(request) {
  // Revoke the session server-side first: bumping the user's
  // session_version invalidates this token (and any other token issued
  // to the same user) even if the cookie is kept or replayed. The
  // userId comes from the HMAC-verified token, so no database read is
  // needed to know whose version to bump.
  const cookieStore = await cookies();
  const session = verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (session) {
    // Best-effort: if the bump fails the cookie is still cleared below,
    // so the user is logged out locally either way.
    try {
      await bumpAdminSessionVersion(session.userId);
    } catch (error) {
      console.error('[admin-logout] Failed to revoke session version:', error?.message || error);
    }
  }

  await clearAdminSession();
  return NextResponse.redirect(new URL('/admin/login', request.url), 303);
}
