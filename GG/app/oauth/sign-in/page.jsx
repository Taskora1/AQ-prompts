import { isValidAuthorizationId } from '@/lib/oauth-consent';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES = {
  invalid: 'The sign-in request is invalid or expired. Return to Claude and start again.',
  unavailable: 'Supabase sign-in is temporarily unavailable. Please try again.',
  sent: 'If this email belongs to an account in the test project, a sign-in link will arrive shortly.',
};

export default async function OAuthSignInPage({ searchParams }) {
  const params = await searchParams;
  const authorizationId = params?.authorization_id;
  const validAuthorization = isValidAuthorizationId(authorizationId);
  const error = ERROR_MESSAGES[params?.error] || '';

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-16 text-slate-950">
      <h1 className="text-3xl font-bold">Sign in to AQPrompts</h1>
      <p className="mt-3 text-slate-700">
        This separate sign-in uses the configured Supabase Auth project. AQPrompts account and administrator sessions are not used.
      </p>
      {error ? (
        <p role="status" className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
      {!validAuthorization ? (
        <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          The OAuth authorization request is missing or invalid. Return to Claude and start again.
        </p>
      ) : (
        <form action="/oauth/sign-in/submit" method="post" className="mt-6 space-y-5">
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <div>
            <label htmlFor="oauth-email" className="block text-sm font-semibold">Email</label>
            <input
              id="oauth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={320}
              className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3"
            />
          </div>
          <button type="submit" className="rounded-lg bg-orange-600 px-5 py-3 font-semibold text-white">
            Email me a Supabase sign-in link
          </button>
        </form>
      )}
    </main>
  );
}
