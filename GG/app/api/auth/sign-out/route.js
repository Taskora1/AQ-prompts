import { NextResponse } from 'next/server';

import { clearSignedInSession } from '@/lib/auth';

export async function POST(request) {
  await clearSignedInSession();
  return NextResponse.redirect(new URL('/account/sign-in', request.url), 303);
}
