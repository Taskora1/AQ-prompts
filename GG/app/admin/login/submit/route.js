import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { createAdminSession } from '@/lib/admin-session';
import { authenticateAdminUserWithDailyIpLimit } from '@/lib/admin-users-db';

function safeNextPath(value) {
  const path = String(value || '');
  return path.startsWith('/admin') && !path.startsWith('//') ? path : '/admin';
}

function loginRedirect(request, error, nextPath) {
  const url = new URL('/admin/login', request.url);
  url.searchParams.set('error', error);
  if (nextPath !== '/admin') url.searchParams.set('next', nextPath);
  return NextResponse.redirect(url, 303);
}

export async function POST(request) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const nextPath = safeNextPath(formData.get('next'));

  if (!email || !password) {
    return loginRedirect(request, 'missing', nextPath);
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
  const ipFingerprint = crypto.createHash('sha256')
    .update(`${ip}:${process.env.AUTH_SECRET || ''}`)
    .digest('hex');
  const { user, limited } = await authenticateAdminUserWithDailyIpLimit(
    email,
    password,
    ipFingerprint,
  );
  if (!user) {
    return loginRedirect(request, limited ? 'limited' : 'invalid', nextPath);
  }

  await createAdminSession(user);
  return NextResponse.redirect(new URL(nextPath, request.url), 303);
}
