import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { buildMetadata } from '@/lib/metadata';

export const dynamic = 'force-static';
export const revalidate = false;

export const metadata = buildMetadata({
  title: 'Welcome',
  description: 'Welcome to AQPrompts after subscribing.',
  path: '/welcome',
  noIndex: true,
});

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <Header />
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-16 sm:px-6">
        <section className="mx-auto max-w-2xl text-center">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="mt-6 text-4xl font-black tracking-normal text-slate-950 dark:text-white sm:text-5xl">
            Welcome to AQPrompts
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
            Your membership is being confirmed. This normally takes only a few seconds.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/account/sign-in"
              className="btn-premium inline-flex h-12 items-center justify-center rounded-full bg-[#ff6b35] px-6 text-sm font-black text-white transition hover:bg-[#e85d28]"
            >
              Access my account
            </Link>
            <Link
              href="/tools/ai-image-prompts"
              className="inline-flex h-12 items-center justify-center rounded-full border border-slate-200 bg-white px-6 text-sm font-black text-slate-900 transition hover:border-[#ff6b35] hover:text-[#c2410c] dark:border-white/10 dark:bg-[#111118] dark:text-white"
            >
              Explore Prompts
            </Link>
          </div>
          <p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-slate-500 dark:text-slate-400">
            Sign in using the email address associated with your account.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
