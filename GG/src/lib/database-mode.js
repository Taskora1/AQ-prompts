import { NextResponse } from 'next/server';

// Keep public write traffic off by default while preserving admin operations.
export function isAdminOnlyDatabaseMode() {
  return process.env.DATABASE_ADMIN_ONLY_MODE !== 'false';
}

export function adminOnlyResponse() {
  return NextResponse.json(
    {
      error: 'This action is temporarily unavailable while the site is in read-only mode.',
    },
    {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export function rejectPublicWriteWhenAdminOnly() {
  return isAdminOnlyDatabaseMode() ? adminOnlyResponse() : null;
}
