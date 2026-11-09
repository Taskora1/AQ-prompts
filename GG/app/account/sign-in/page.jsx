import { LockKeyhole } from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import AccountSignInForm from '@/components/account/AccountSignInForm';
import { buildMetadata } from '@/lib/metadata';

export const metadata = buildMetadata({
  title: 'Account sign in',
  description: 'Securely sign in to your AQPrompts account. New VIP memberships are currently paused.',
  path: '/account/sign-in',
  noIndex: true,
});

const errorMessages = {
  invalid: 'This sign-in link is invalid. Request a fresh link below.',
  expired: 'This sign-in link has expired or was already used. Request a fresh link below.',
  unavailable: 'Sign-in is temporarily unavailable. Please request a fresh link.',
};

export default async function AccountSignInPage({ searchParams }) {
  const params = await searchParams;
  const errorMessage = errorMessages[params?.error];

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <Header />
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-16 sm:px-6">
        <section className="w-full max-w-xl rounded-[1.75rem] border border-slate-200 bg-[#f9fafb] p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-[#111118] sm:p-9">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#ff6b35]/10 text-[#c2410c] ring-1 ring-[#ff6b35]/20">
            <LockKeyhole className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-3xl font-black tracking-normal sm:text-4xl">Secure account sign in</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">
            Enter your AQPrompts account email. No password is needed, and new VIP memberships are currently paused.
          </p>
          {errorMessage ? (
            <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {errorMessage}
            </p>
          ) : null}
          <AccountSignInForm />
          <p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            The link is single-use. AQPrompts never asks for your card details by email.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
