import { cookies } from 'next/headers';

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from './admin-session-core.js';
import { getAdminUserById } from './admin-users-db.js';

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
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function getCurrentAdminUser() {
  const session = await getAdminSession();
  if (!session) return null;

  return getAdminUserById(session.userId);
}

export async function hasAdminSession() {
  return Boolean(await getCurrentAdminUser());
}

export function isSuperAdmin(user) {
  return user?.role === 'super_admin';
}
