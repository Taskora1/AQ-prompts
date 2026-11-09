import { headers } from 'next/headers';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import NewsletterSignup from '@/components/NewsletterSignup';

import { VIP_MEMBERSHIP_PAUSED } from '@/lib/membership';
import { buildMetadata } from '@/lib/metadata';


const faqs = [
  ['Is VIP membership available now?', 'No. Starter, Pro, and VIP checkout are currently paused while AQPrompts focuses on the free prompt library.'],
  ['Are the prompts free?', 'Yes. All prompts in the public AQPrompts library are currently free to browse and copy without a paid membership.'],
  ['Will VIP return?', 'It may return later after the membership and entitlement experience is ready. Join the free newsletter if you would like product updates.'],
  ['Can I be charged while membership is paused?', 'No. Checkout is disabled and no new paid subscription can be started from AQPrompts while VIP is paused.'],
  ['Is the WhatsApp community preview free?', 'Yes. The current 3-day Promptshe WhatsApp community access is free and does not collect payment.'],
];

export const metadata = buildMetadata({
  title: 'VIP Membership Paused | AQPrompts',
  description: 'AQPrompts VIP membership is currently paused. All public AI image prompts are free to browse and copy right now.',
  path: '/pricing',
  noIndex: true,
  noFollow: false,
  keywords: ['AQPrompts free prompts', 'Promptshe membership', 'AI image prompts'],
});

export default async function PricingPage() {
  void headers();

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: 'Promptshe VIP Creator Club by AQPrompts',
          description: 'A future creator membership that is currently paused. AQPrompts public prompts are free to use.',
          provider: { '@type': 'Organization', name: 'AQPrompts' },
        }}
      />
      <Header />
      <main>
        <section className="relative isolate overflow-hidden border-b border-[#e5e7eb] bg-white py-16 text-center dark:border-white/10 dark:bg-[#0a0a0f] sm:py-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,107,53,0.16),rgba(255,107,53,0.05)_28%,rgba(255,255,255,0)_64%)]" />
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#c2410c]">Membership status</p>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-normal text-slate-950 sm:text-5xl dark:text-white">
              VIP membership is currently paused
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8 dark:text-slate-300">
              We are focusing on building the AQPrompts audience and free library. All public prompts are free to browse and copy right now, and no paid checkout is available.
            </p>
          </div>
        </section>

        <section className="bg-white py-14 dark:bg-[#0a0a0f] sm:py-20" aria-labelledby="pricing-paused-title">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 sm:p-8">
              <h2 id="pricing-paused-title" className="text-2xl font-black text-emerald-950 dark:text-emerald-100">Use the complete prompt library for free</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-emerald-900 dark:text-emerald-100/80 sm:text-base">
                There is no countdown or limited-time offer. If VIP returns later, we will publish clear access, pricing, and billing details before accepting payments.
              </p>
              <Link href="/tools/ai-image-prompts" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-[#ff6b35] px-6 text-sm font-black text-white transition hover:bg-[#e85d28]">
                Browse free prompts
              </Link>
            </div>
            <div className="mt-8">
              <p className="mb-4 text-center text-sm font-semibold text-slate-600 dark:text-slate-300">Join the free newsletter for new prompts and future product announcements.</p>
              <NewsletterSignup variant="membership-updates" />
            </div>
          </div>
        </section>

        <section className="bg-[#f9fafb] py-14 dark:bg-[#111118] sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#ff6b35]/10 text-[#c2410c] ring-1 ring-[#ff6b35]/20">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-3xl font-black tracking-normal text-slate-950 dark:text-white">Membership FAQ</h2>
              <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">Clear answers about the current free-library phase.</p>
            </div>
            <div className="mt-8 overflow-hidden rounded-[1.5rem] border border-[#e5e7eb] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-[#0a0a0f]">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group border-b border-[#e5e7eb] last:border-b-0 dark:border-white/10">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-left font-black text-slate-950 transition hover:bg-[#fff7f2] hover:text-[#c2410c] dark:text-white dark:hover:bg-[#1b1514] [&::-webkit-details-marker]:hidden">
                    <span>{question}</span>
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-lg leading-none text-[#c2410c] transition-transform group-open:rotate-45 dark:border-white/10 dark:bg-[#111118]" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-7 text-slate-600 sm:text-base dark:text-slate-300">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

