'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

const MIN_PASSWORD_LENGTH = 12;

const ERROR_MESSAGES = {
  invalid: 'This reset link is invalid or has expired. Please request a new code.',
  short: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  mismatch: 'Passwords do not match.',
};

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const errorKey = searchParams.get('error') || '';

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(ERROR_MESSAGES[errorKey] || '');

  if (!token) {
    return (
      <main
        id="main-content"
        className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-12 text-[#111118]"
      >
        <section className="w-full max-w-md rounded-2xl border border-[#dcdcde] bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.12)] sm:p-9">
          <div className="text-center">
            <p className="text-sm text-red-600">Invalid reset link. Please request a new code.</p>
            <Link href="/admin/forgot-password" className="mt-4 inline-block text-sm font-semibold text-[#2271b1] hover:underline">
              ← Go to forgot password
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-12 text-[#111118]"
    >
      <section className="w-full max-w-md rounded-2xl border border-[#dcdcde] bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.12)] sm:p-9">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff6b35] text-sm font-black text-white">
            AQ
          </span>
          <div>
            <p className="text-sm font-semibold text-[#50575e]">AQPrompts</p>
            <h1 className="text-2xl font-bold tracking-tight">Set new password</h1>
          </div>
        </div>

        <p className="mt-6 text-sm leading-6 text-[#646970]">
          Enter your new password below. Make sure it&apos;s at least {MIN_PASSWORD_LENGTH} characters.
        </p>

        {error ? (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        <form action="/admin/reset-password/submit" method="post" className="mt-6 space-y-5">
          <input type="hidden" name="token" value={token} />
          {/* New Password */}
          <div>
            <label htmlFor="new-password" className="block text-sm font-semibold text-[#1d2327]">
              New password
            </label>
            <div className="relative mt-2">
              <input
                id="new-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoFocus
                className="h-12 w-full rounded-lg border border-[#8c8f94] bg-white px-3 pr-12 text-base outline-none transition focus:border-[#2271b1] focus:ring-2 focus:ring-[#2271b1]/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#374151] transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-semibold text-[#1d2327]">
              Confirm new password
            </label>
            <div className="relative mt-2">
              <input
                id="confirm-password"
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                className="h-12 w-full rounded-lg border border-[#8c8f94] bg-white px-3 pr-12 text-base outline-none transition focus:border-[#2271b1] focus:ring-2 focus:ring-[#2271b1]/20"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#374151] transition-colors"
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              >
                <EyeIcon open={showConfirm} />
              </button>
            </div>

          </div>

          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96] focus:outline-none focus:ring-2 focus:ring-[#2271b1] focus:ring-offset-2"
          >
            Reset password
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/admin/login"
            className="text-sm font-semibold text-[#2271b1] hover:underline"
          >
            ← Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

function LoadingFallback() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-12 text-[#111118]"
    >
      <section className="w-full max-w-md rounded-2xl border border-[#dcdcde] bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.12)] sm:p-9">
        <div className="text-center">
          <p className="text-sm text-[#6b7280]">Loading...</p>
        </div>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
