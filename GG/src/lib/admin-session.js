import { cookies } from 'next/headers';

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
} from './admin-session-core.js';
import { verifyAdminSessionWithRevocation } from './admin-users-db.js';

export async function createAdminSession(user) {
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    maxAge: 0,
  });
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const loaded = await verifyAdminSessionWithRevocation(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
  );
  // Role and email come from the database (see verifyAdminSessionWithRevocation).
  return loaded?.session ?? null;
}

export async function getCurrentAdminUser() {
  const cookieStore = await cookies();
  const loaded = await verifyAdminSessionWithRevocation(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
  );
  return loaded?.user ?? null;
}

export async function hasAdminSession() {
  return Boolean(await getCurrentAdminUser());
}

export function isSuperAdmin(user) {
  return user?.role === 'super_admin';
}
