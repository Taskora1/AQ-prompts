import Link from 'next/link';
import { CreditCard, LockKeyhole } from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { getSignedInUser } from '@/lib/auth';
import { buildMetadata } from '@/lib/metadata';


export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'Account',
  description: 'Access your AQPrompts account settings.',
  path: '/account',
  noIndex: true,
});

export default async function AccountPage() {
  let user;

  try {
    user = await getSignedInUser();
  } catch {
    user = null;
  }

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="rounded-[1.5rem] border border-[#e5e7eb] bg-[#f9fafb] p-6 shadow-sm dark:border-white/10 dark:bg-[#111118] sm:p-8">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#ff6b35]/10 text-[#c2410c] ring-1 ring-[#ff6b35]/20">
            <CreditCard className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-3xl font-black tracking-normal text-slate-950 dark:text-white sm:text-4xl">Account</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
            All prompts in the AQPrompts library are currently free to browse and copy.
          </p>

          {!user ? (
            <div className="mt-6 rounded-2xl border border-[#e5e7eb] bg-white px-5 py-5 text-sm leading-6 text-slate-600 dark:border-white/10 dark:bg-[#0a0a0f] dark:text-slate-300">
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#c2410c]" aria-hidden="true" />
                <p>Sign in with your account email to access your account settings.</p>
              </div>
              <Link href="/account/sign-in" className="btn-premium mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#ff6b35] px-5 text-sm font-black text-white transition hover:bg-[#e85d28]">
                Sign in securely
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-3 text-sm font-bold text-slate-700 dark:text-slate-200 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 dark:border-white/10 dark:bg-[#0a0a0f]">Email: {user.email}</div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <form action="/api/auth/sign-out" method="post">
                  <button type="submit" className="inline-flex h-12 items-center justify-center rounded-full border border-[#e5e7eb] bg-white px-6 text-sm font-black text-slate-800 transition hover:border-[#ff6b35] hover:text-[#c2410c] dark:border-white/10 dark:bg-[#0a0a0f] dark:text-white">
                    Sign out
                  </button>
                </form>
              </div>
            </>
          )}

          <Link href="/tools/ai-image-prompts" className="mt-6 inline-flex text-sm font-black text-[#c2410c] hover:text-[#e85d28]">
            Browse free prompts
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
