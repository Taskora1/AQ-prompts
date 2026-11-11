import Link from 'next/link';
import { Cookie } from 'lucide-react';

import CookieSettingsButton from '@/components/CookieSettingsButton';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import { buildStaticPageMetadata, buildStaticPageSchema } from '@/lib/metadata';

export const dynamic = 'force-static';
export const revalidate = false;

const LAST_UPDATED = 'November 11, 2026';

export function generateMetadata() {
  return buildStaticPageMetadata('cookiePolicy');
}

export default function CookiePolicyPage() {
  const categories = [
    {
      title: 'Necessary storage',
      text: 'Used for consent choices, security, signed-in account sessions, newsletter status, and short session safeguards. Free public prompt copying does not require an email unlock. Necessary storage supports services you request and cannot be disabled through the optional-cookie controls.',
    },
    {
      title: 'Analytics storage',
      text: 'Allows Google Analytics 4, Microsoft Clarity, and consent-aware first-party prompt-view measurement. These services and automatic view measurement remain off until analytics consent is granted.',
    },
    {
      title: 'Preference and functionality storage',
      text: 'Can remember theme, saved prompts, recent prompt history, likes, ratings, and an anonymous interaction identifier. Without preference consent, these choices can work temporarily but may not persist between visits.',
    },
    {
      title: 'Advertising storage',
      text: (
        <>
          Optional advertising is off unless you grant advertising consent. If enabled, Adsterra Native Banner ads may
          load in the homepage feed, after the third content section in selected blog articles, and below the main
          copy button on prompt detail pages. Adsterra banner ads may load after the fifth and tenth prompts in the
          prompt library and below prompt detail images. These ads load only after advertising consent. The providers may process technical, device,
          approximate-location, and usage data to deliver and measure ads. Review the{' '}
          <a href="https://adsterra.com/privacy-policy/" target="_blank" rel="noopener noreferrer" className="font-bold text-[#c2410c] hover:underline">
            Adsterra Privacy Policy
          </a>.
        </>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <JsonLd data={buildStaticPageSchema('cookiePolicy')} />
      <Header />
      <main id="main-content">
        <section className="border-b border-[#ff6b35]/15 bg-[#fffaf7] py-16 dark:bg-[#09090f] sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <Cookie className="h-12 w-12 text-[#c2410c]" aria-hidden="true" />
            <p className="mt-5 text-sm font-black uppercase tracking-[0.2em] text-[#c2410c]">Browser storage</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Cookie Policy</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">
              This page explains the cookies, local storage, session storage, and similar technologies used by AQPrompts.
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>
          </div>
        </section>

        <section className="bg-slate-50 py-12 dark:bg-[#09090f] sm:py-16">
          <div className="mx-auto max-w-4xl space-y-5 px-4 sm:px-6 lg:px-8">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#111118] sm:p-8">
              <h2 className="text-2xl font-black">What cookies and browser storage are</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
                <p>Cookies are small data files a website or service can store through your browser. Local storage can retain settings until it is cleared, while session storage normally lasts for the current browser tab or session.</p>
                <p>AQPrompts uses these technologies for sign-in, consent, requested features, preferences, and—only with permission—analytics. Third-party services may create their own storage after the relevant service is allowed or opened.</p>
              </div>
            </article>

            {categories.map((category) => (
              <article key={category.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#111118] sm:p-8">
                <h2 className="text-2xl font-black">{category.title}</h2>
                <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{category.text}</p>
              </article>
            ))}

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#111118] sm:p-8">
              <h2 className="text-2xl font-black">Account services</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
                <p>AQPrompts uses a signed, HTTP-only session cookie after successful passwordless sign-in. This cookie is necessary to keep the account session secure.</p>
              </div>
            </article>

            <article className="rounded-2xl border border-[#ff6b35]/25 bg-[#fff4ef] p-6 shadow-sm dark:bg-[#1b1514] sm:p-8">
              <h2 className="text-2xl font-black">Manage or change your choices</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
                <p>New visitors can accept all optional categories, reject optional categories, or choose categories individually. Optional categories are not preselected, and rejecting them does not block access to public content.</p>
                <p>You can reopen the controls at any time. Browser settings can also block or delete cookies and site storage, but doing so may sign you out or remove saved preferences.</p>
                <CookieSettingsButton className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#ff6b35] px-5 text-sm font-black text-white hover:bg-[#e85d28]" />
                <p>For more information, read the <Link href="/privacy" className="font-bold text-[#c2410c] hover:underline">Privacy Policy</Link> or email <a href="mailto:hello@aqprompts.com" className="font-bold text-[#c2410c] hover:underline">hello@aqprompts.com</a>.</p>
              </div>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
