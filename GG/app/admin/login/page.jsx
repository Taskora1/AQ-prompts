import { redirect } from 'next/navigation';

import { hasAdminSession } from '@/lib/admin-session';

const ERROR_MESSAGES = {
  invalid: 'The email or password you entered is incorrect.',
  limited: 'Too many incorrect sign-in attempts from this network. Try again after 24 hours.',
  missing: 'Enter your email and password to continue.',
};
const SUCCESS_MESSAGES = {
  reset: 'Your password has been reset successfully. Please sign in with your new password.',
};

function safeNextPath(value) {
  const path = String(value || '');
  return path.startsWith('/admin') && !path.startsWith('//') ? path : '/admin';
}

export default async function AdminLoginPage({ searchParams }) {
  if (await hasAdminSession()) redirect('/admin');

  const params = await searchParams;
  const error = ERROR_MESSAGES[params?.error] || '';
  const success = SUCCESS_MESSAGES[params?.reset] || '';
  const nextPath = safeNextPath(params?.next);

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
            <h1 className="text-2xl font-bold tracking-tight">Admin sign in</h1>
          </div>
        </div>

        <p className="mt-6 text-sm leading-6 text-[#646970]">
          Sign in with your administrator account to manage prompts.
        </p>

        {error ? (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        {success ? (
          <div
            className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
          >
            {success}
          </div>
        ) : null}

        <form action="/admin/login/submit" method="post" className="mt-6 space-y-5">
          <input type="hidden" name="next" value={nextPath} />
          <div>
            <label htmlFor="admin-email" className="block text-sm font-semibold text-[#1d2327]">
              Email
            </label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              className="mt-2 h-12 w-full rounded-lg border border-[#8c8f94] bg-white px-3 text-base outline-none transition focus:border-[#2271b1] focus:ring-2 focus:ring-[#2271b1]/20"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-sm font-semibold text-[#1d2327]">
              Password
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-2 h-12 w-full rounded-lg border border-[#8c8f94] bg-white px-3 text-base outline-none transition focus:border-[#2271b1] focus:ring-2 focus:ring-[#2271b1]/20"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96] focus:outline-none focus:ring-2 focus:ring-[#2271b1] focus:ring-offset-2"
          >
            Sign in
          </button>

          <div className="text-center">
            <a
              href="/admin/forgot-password"
              className="text-sm font-semibold text-[#2271b1] hover:underline"
            >
              Forgot password?
            </a>
          </div>
        </form>
      </section>
    </main>
  );
}
