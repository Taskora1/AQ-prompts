import { redirect } from 'next/navigation';

import { isValidAuthorizationId, loadOAuthConsent } from '@/lib/oauth-consent';
import {
  createSupabaseAuthServerClient,
  SupabaseAuthConfigurationError,
} from '@/lib/supabase-auth-server';

export const dynamic = 'force-dynamic';

function ConsentError({ children }) {
  return (
    <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {children}
    </p>
  );
}

export default async function OAuthConsentPage({ searchParams }) {
  const params = await searchParams;
  const authorizationId = params?.authorization_id;
  let consent;

  try {
    const supabase = await createSupabaseAuthServerClient({ readOnlyCookies: true });
    consent = await loadOAuthConsent(supabase, authorizationId);
  } catch (error) {
    if (!(error instanceof SupabaseAuthConfigurationError)) throw error;
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-bold">AQPrompts authorization</h1>
        <ConsentError>Supabase authentication is not configured for this environment.</ConsentError>
      </main>
    );
  }

  if (consent.status === 'redirect') redirect(consent.redirectUrl);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16 text-slate-950">
      <h1 className="text-3xl font-bold">AQPrompts authorization</h1>
      {consent.status === 'unauthenticated' ? (
        <div>
          <ConsentError>
            Sign in with a Supabase Auth session to review this request. Local account and administrator sign-ins do not apply here.
          </ConsentError>
          {isValidAuthorizationId(authorizationId) ? (
            <a
              href={`/oauth/sign-in?authorization_id=${encodeURIComponent(authorizationId)}`}
              className="mt-5 inline-flex rounded-lg bg-orange-600 px-5 py-3 font-semibold text-white"
            >
              Sign in with Supabase
            </a>
          ) : null}
        </div>
      ) : consent.status !== 'consent' ? (
        <ConsentError>This authorization request is missing, expired, or invalid.</ConsentError>
      ) : (
        <section className="mt-6 rounded-xl border border-slate-200 p-6">
          <h2 className="text-xl font-semibold">Allow {consent.clientName}?</h2>
          {consent.clientId ? (
            <p className="mt-2 text-sm text-slate-600">Client ID: {consent.clientId}</p>
          ) : null}
          {consent.clientUri ? (
            <p className="mt-2 break-all text-sm text-slate-600">Application: {consent.clientUri}</p>
          ) : null}
          {consent.redirectUri ? (
            <p className="mt-2 break-all text-sm text-slate-600">Redirect URI: {consent.redirectUri}</p>
          ) : null}
          <p className="mt-4">This application is requesting the following scopes:</p>
          {consent.scopes.length ? (
            <ul className="mt-2 list-inside list-disc">
              {consent.scopes.map((scope) => <li key={scope}>{scope}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No scopes were requested.</p>
          )}
          <form action="/oauth/consent/decision" method="post" className="mt-6 flex gap-3">
            <input type="hidden" name="authorization_id" value={params.authorization_id} />
            <button
              type="submit"
              name="decision"
              value="approve"
              className="rounded-lg bg-orange-600 px-5 py-3 font-semibold text-white"
            >
              Approve
            </button>
            <button
              type="submit"
              name="decision"
              value="deny"
              className="rounded-lg border border-slate-300 px-5 py-3 font-semibold"
            >
              Deny
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
