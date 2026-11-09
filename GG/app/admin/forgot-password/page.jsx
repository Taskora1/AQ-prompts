import Link from 'next/link';

const ERROR_MESSAGE = 'Something went wrong. Please try again.';

export default async function ForgotPasswordPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error === '1';
  const sent = params?.sent === '1';

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
            <h1 className="text-2xl font-bold tracking-tight">Reset password</h1>
          </div>
        </div>

        <p className="mt-6 text-sm leading-6 text-[#646970]">
          Enter your admin account email and we&apos;ll send you a verification code to reset your password.
        </p>

        {error ? (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {ERROR_MESSAGE}
          </div>
        ) : null}

        {sent ? (
          <div
            role="status"
            className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
          >
            If an account exists with that email, a verification code has been sent. Please check your inbox.
          </div>
        ) : null}

        <form action="/admin/forgot-password/submit" method="post" className="mt-6 space-y-5">
          <div>
            <label htmlFor="reset-email" className="block text-sm font-semibold text-[#1d2327]">
              Email address
            </label>
            <input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              placeholder="admin@example.com"
              className="mt-2 h-12 w-full rounded-lg border border-[#8c8f94] bg-white px-3 text-base outline-none transition focus:border-[#2271b1] focus:ring-2 focus:ring-[#2271b1]/20"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96] focus:outline-none focus:ring-2 focus:ring-[#2271b1] focus:ring-offset-2"
          >
            Send reset code
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
