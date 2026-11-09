import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from './src/lib/admin-session-core.js';

async function refreshSupabaseConsentSession(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });

  if (!url || !publishableKey) return response;

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers || {}).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

export async function proxy(request) {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/oauth/consent' || pathname === '/oauth/consent/decision') {
    return refreshSupabaseConsentSession(request);
  }

  const isLoginRoute = pathname === '/admin/login'
    || pathname.startsWith('/admin/login/');
  const isForgotPasswordRoute = pathname === '/admin/forgot-password'
    || pathname.startsWith('/admin/forgot-password/');
  const isResetPasswordRoute = pathname === '/admin/reset-password'
    || pathname.startsWith('/admin/reset-password/');
  const isOtpVerifyRoute = pathname === '/admin/otp-verify'
    || pathname.startsWith('/admin/otp-verify/');
  const isPublicRoute = isLoginRoute || isForgotPasswordRoute || isResetPasswordRoute || isOtpVerifyRoute;
  const resetParam = request.nextUrl.searchParams.get('reset');
  const shouldResetSession = isLoginRoute
    && (resetParam === '1' || resetParam === 'success');
  const session = verifyAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );

  if (isPublicRoute) {
    // Allow password-reset flow even if user is logged in
    // (they might be resetting their own password)
    if (isForgotPasswordRoute || isResetPasswordRoute || isOtpVerifyRoute) {
      return NextResponse.next();
    }

    if (isLoginRoute && shouldResetSession) {
      const response = NextResponse.next();
      response.cookies.set(ADMIN_SESSION_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/admin',
        maxAge: 0,
      });
      return response;
    }

    // Also allow login page when user has ?reset=success but the redirect came from form POST
    // In this case, clear session so login page renders instead of redirecting to /admin
    if (isLoginRoute && resetParam) {
      const response = NextResponse.next();
      response.cookies.set(ADMIN_SESSION_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/admin',
        maxAge: 0,
      });
      return response;
    }

    return session
      ? NextResponse.redirect(new URL('/admin', request.url))
      : NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const isUserManagementPage = pathname === '/admin/users'
    || pathname.startsWith('/admin/users/');
  if (isUserManagementPage && session.role !== 'super_admin') {
    return NextResponse.redirect(new URL('/admin?error=forbidden', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/oauth/consent', '/oauth/consent/decision'],
};
