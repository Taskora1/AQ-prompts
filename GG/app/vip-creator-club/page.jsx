import Link from 'next/link';
import { CheckCircle2, Crown, Sparkles, Wand2 } from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import NewsletterSignup from '@/components/NewsletterSignup';
import { buildMetadata } from '@/lib/metadata';

export const dynamic = 'force-static';
export const revalidate = false;

const benefits = [
  'Premium AI prompts',
  'Weekly prompt drops',
  '20 prompt requests',
  'Priority support',
  'AI editing workflows',
  'Creator community access',
];

const featureCards = [
  {
    title: 'Premium prompt library',
    detail: 'Unlock premium image prompt packs for portraits, fashion, lifestyle, posters, and social media content.',
  },
  {
    title: 'Weekly creator drops',
    detail: 'Get fresh prompt ideas every week so your content does not feel repetitive.',
  },
  {
    title: 'Custom request support',
    detail: 'Request prompt styles for your niche, brand, product, or creator workflow.',
  },
];

const faqs = [
  ['Is VIP available now?', 'No. VIP membership and paid checkout are currently paused while AQPrompts focuses on its free prompt library.'],
  ['Are prompts free while VIP is paused?', 'Yes. All public prompts are currently free to browse and copy without an account or payment.'],
  ['How does the community preview work?', 'The current 3-day WhatsApp community access is free. No payment is collected on the community form.'],
  ['How will I know if VIP returns?', 'Join the free newsletter for new prompts and future product announcements. Any future paid offer will show its terms clearly before checkout.'],
  ['Can I use prompts commercially?', 'Yes, prompts can be used for personal and commercial creator projects, subject to the AI platform terms you use.'],
];

export const metadata = buildMetadata({
  title: 'Promptshe VIP Membership Paused | AQPrompts',
  description: 'Promptshe VIP membership is currently paused while AQPrompts focuses on its free AI image prompt library.',
  path: '/vip-creator-club',
  noIndex: true,
  noFollow: false,
  keywords: ['Promptshe VIP Creator Club', 'premium AI prompts', 'AI prompts membership'],
});

export default function VipCreatorClubPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: 'Promptshe VIP Creator Club by AQPrompts',
          provider: { '@type': 'Organization', name: 'AQPrompts' },
          serviceType: 'Digital AI prompt membership',
          description: 'Membership is currently paused. The public AQPrompts prompt library is free to use.',
        }}
      />
      <Header />
      <main>
        <section className="relative isolate overflow-hidden border-b border-[#e5e7eb] bg-white dark:border-white/10 dark:bg-[#0a0a0f]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,107,53,0.18),rgba(255,107,53,0.06)_28%,rgba(255,255,255,0)_64%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#ff6b35]/25 bg-[#ff6b35]/10 px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#c2410c]">
                <Crown className="h-4 w-4" />
                Currently paused
              </span>
              <h1 className="mt-6 text-4xl font-black leading-tight tracking-normal text-slate-950 sm:text-5xl dark:text-white">
                Promptshe VIP Creator Club by AQPrompts
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8 dark:text-slate-300">
                VIP is not accepting new paid memberships right now. AQPrompts is focused on audience building, and all public prompts are free to browse and copy.
              </p>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                If membership returns later, access, pricing, and billing terms will be published clearly before checkout is enabled.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/tools/ai-image-prompts" className="inline-flex h-14 items-center justify-center rounded-full bg-[#ff6b35] px-7 text-base font-black text-white transition hover:bg-[#e85d28]">
                  Browse free prompts
                </Link>
              </div>
            </div>

            <div className="card-premium rounded-[1.5rem] border border-[#e5e7eb] bg-[#f9fafb] p-6 shadow-[0_20px_55px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#111118]">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ff6b35]/10 text-[#c2410c] ring-1 ring-[#ff6b35]/20">
                  <Wand2 className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#c2410c]">Future membership concept</p>
                  <p className="text-3xl font-black tracking-normal text-slate-950 dark:text-white">No checkout available</p>
                </div>
              </div>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex gap-3 rounded-xl border border-[#e5e7eb] bg-white p-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-[#0a0a0f] dark:text-slate-200">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#c2410c]" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 rounded-xl border border-[#ff6b35]/20 bg-[#fff4ef] p-4 text-sm font-semibold leading-6 text-slate-700 dark:bg-[#1b1514] dark:text-slate-200">
                These features are shown only as a possible future direction. They are not an active offer, and no payment can be started on this page.
              </p>
              <div className="mt-5">
                <NewsletterSignup variant="vip-updates" />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-14 dark:bg-[#0a0a0f] sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-5 md:grid-cols-3">
              {featureCards.map((card) => (
                <article key={card.title} className="card-premium rounded-[1.5rem] border border-[#e5e7eb] bg-[#f9fafb] p-6 shadow-sm dark:border-white/10 dark:bg-[#111118]">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#ff6b35]/10 text-[#c2410c] ring-1 ring-[#ff6b35]/20">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <h2 className="mt-4 text-xl font-black tracking-normal text-slate-950 dark:text-white">{card.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{card.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f9fafb] py-14 dark:bg-[#111118] sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#ff6b35]/10 text-[#c2410c] ring-1 ring-[#ff6b35]/20">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-3xl font-black tracking-normal text-slate-950 dark:text-white">FAQ</h2>
              <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">Quick answers about access, billing, refunds, and commercial use.</p>
            </div>
            <div className="mt-8 overflow-hidden rounded-[1.5rem] border border-[#e5e7eb] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-[#0a0a0f]">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group border-b border-[#e5e7eb] last:border-b-0 dark:border-white/10">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-left font-black text-slate-950 transition hover:bg-[#fff7f2] hover:text-[#c2410c] dark:text-white dark:hover:bg-[#1b1514] [&::-webkit-details-marker]:hidden">
                    <span>{question}</span>
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-lg leading-none text-[#c2410c] transition-transform group-open:rotate-45 dark:border-white/10 dark:bg-[#111118]" aria-hidden="true">+</span>
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
