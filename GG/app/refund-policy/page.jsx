import Link from 'next/link';
import { ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import { buildMetadata } from '@/lib/metadata';

export const dynamic = 'force-static';
export const revalidate = false;

export const metadata = buildMetadata({
  title: 'Refund Policy',
  description: 'Read the AQPrompts refund policy for digital AI prompt memberships and creator resources.',
  path: '/refund-policy',
  noIndex: true,
  noFollow: false,
  keywords: ['AQPrompts refund policy', 'AI prompts refund', 'Promptshe membership refund'],
});

const policySections = [
  {
    title: 'Digital product policy',
    body: 'AQPrompts sells digital AI prompt access, memberships, community resources, and creator workflows. Because digital access can be delivered immediately, refunds are reviewed carefully and are not automatic after substantial use of the product.',
  },
  {
    title: 'When refunds may be approved',
    body: 'A refund may be approved if you were charged in error, purchased twice by mistake, could not access the product due to a technical issue we could not resolve, or contacted us shortly after purchase before meaningful use of the membership.',
  },
  {
    title: 'When refunds may be declined',
    body: 'Refunds may be declined for change of mind after using premium prompts, downloaded or copied digital content, misuse of the membership, or requests made after the relevant billing period has already been used.',
  },
  {
    title: 'Cancellation',
    body: 'Monthly and yearly memberships can be cancelled before the next renewal. Cancelling prevents future renewal charges but does not automatically refund a previous paid period.',
  },
  {
    title: 'How to request help',
    body: 'Email hello@aqprompts.com with your name, purchase email, order details, and a short explanation. We usually reply within 24-48 hours on business days.',
  },
];

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Refund Policy',
          url: 'https://aqprompts.com/refund-policy',
          isPartOf: { '@type': 'WebSite', name: 'AQPrompts', url: 'https://aqprompts.com' },
        }}
      />
      <Header />
      <main>
        <section className="relative isolate overflow-hidden border-b border-[#e5e7eb] bg-white py-16 dark:border-white/10 dark:bg-[#0a0a0f] sm:py-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,107,53,0.14),rgba(255,107,53,0.04)_28%,rgba(255,255,255,0)_64%)]" />
          <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#ff6b35]/10 text-[#c2410c] ring-1 ring-[#ff6b35]/20">
              <RotateCcw className="h-6 w-6" />
            </span>
            <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-[#c2410c]">Policy</p>
            <h1 className="mt-3 text-4xl font-black tracking-normal text-slate-950 sm:text-5xl dark:text-white">Refund Policy</h1>
            <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8 dark:text-slate-300">
              This policy explains how refunds and cancellations work for AQPrompts digital memberships and prompt resources.
            </p>
            <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Last updated: July 11, 2026</p>
          </div>
        </section>

        <section className="bg-white py-14 dark:bg-[#0a0a0f] sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="space-y-4">
              {policySections.map((section) => (
                <article key={section.title} className="card-premium rounded-[1.5rem] border border-[#e5e7eb] bg-[#f9fafb] p-6 shadow-sm dark:border-white/10 dark:bg-[#111118]">
                  <div className="flex gap-3">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#c2410c]" />
                    <div>
                      <h2 className="text-xl font-black tracking-normal text-slate-950 dark:text-white">{section.title}</h2>
                      <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">{section.body}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-8 rounded-[1.5rem] border border-[#ff6b35]/25 bg-[#fff4ef] p-6 shadow-[0_18px_50px_rgba(255,107,53,0.12)] dark:bg-[#1b1514]">
              <h2 className="text-xl font-black tracking-normal text-slate-950 dark:text-white">Need billing support?</h2>
              <p className="mt-3 leading-7 text-slate-700 dark:text-slate-200">
                Contact us before opening a dispute so we can help with access, cancellation, or billing questions.
              </p>
              <Link href="/contact" className="btn-premium mt-5 inline-flex items-center gap-2 rounded-full bg-[#ff6b35] px-5 py-3 text-sm font-black text-white hover:bg-[#e85d28]">
                Contact support
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
