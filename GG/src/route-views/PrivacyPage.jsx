import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

import CookieSettingsButton from '@/components/CookieSettingsButton';
import Footer from '@/components/Footer';
import Header from '@/components/Header';

const LAST_UPDATED = 'November 11, 2026';

const sections = [
  {
    id: 'information-we-collect',
    title: '1. Information we collect',
    content: (
      <>
        <p>We collect information that you choose to provide and limited information generated when you use AQPrompts.</p>
        <ul>
          <li><strong>Contact requests:</strong> name, email address, subject, and message submitted through our Formspree-powered contact form.</li>
          <li><strong>Newsletter:</strong> the email address you voluntarily submit to receive prompt emails and updates. Free public prompt copying does not require an email address.</li>
          <li><strong>Account access:</strong> email address, short-lived sign-in-token records, request-security fingerprints, and a signed session cookie when you use passwordless account access.</li>
          <li><strong>Community preview:</strong> name, country code, and WhatsApp number submitted for the separate community-preview verification flow.</li>
          <li><strong>Technical information:</strong> IP address, browser and device information, referring page, pages viewed, approximate location, timestamps, and interaction data when the relevant service is used and permitted.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'browser-storage',
    title: '2. Cookies, local storage, and similar technologies',
    content: (
      <>
        <p>AQPrompts uses a signed cookie for account sessions and browser storage for consent choices and features you request.</p>
        <p>Depending on your choices and actions, local or session storage may remember theme, saved prompts, recent prompt history, newsletter status, likes, ratings, an anonymous interaction identifier, and whether a prompt view was already counted in the current session.</p>
        <p>Analytics storage is disabled until analytics consent is granted. Optional advertising storage is disabled unless you grant advertising consent and an advertising service is enabled.</p>
        <p>See the <Link href="/cookie-policy">Cookie Policy</Link> or reopen <CookieSettingsButton className="font-bold text-[#c2410c] hover:underline" />.</p>
      </>
    ),
  },
  {
    id: 'analytics',
    title: '3. Analytics services',
    content: (
      <>
        <p>Google Analytics 4 and Microsoft Clarity are configured on AQPrompts. Their scripts load only after analytics consent through the site’s consent controls.</p>
        <p>These services can process usage, device, browser, page, interaction, diagnostic, and approximate-location information. Analytics information is not described as completely anonymous. Google and Microsoft process information under their own privacy terms and may process it outside your country.</p>
        <p>
          Review the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a> and{' '}
          <a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noreferrer">Microsoft Privacy Statement</a>.
        </p>
      </>
    ),
  },
  {
    id: 'email-contact',
    title: '4. Email, contact, and account services',
    content: (
      <>
        <p>Resend is used to deliver welcome-prompt emails and secure account sign-in links. Formspree processes contact-form submissions. These providers receive the information needed to deliver the requested service and maintain their own operational records under their policies.</p>
        <p>Newsletter signup is optional and separate from free public prompt copying. Browser storage may remember a successful newsletter signup so the same signup form is not shown unnecessarily.</p>
        <p>Community-preview submissions are sent to the configured verification service, which is used to validate the submitted WhatsApp number and return the appropriate community response.</p>
      </>
    ),
  },
  {
    id: 'payments',
    title: '5. Payments and memberships',
    content: (
      <>
        <p>AQPrompts is a free library. There are no purchases, payments, or subscriptions, so no payment processor collects payment details from you.</p>
      </>
    ),
  },
  {
    id: 'advertising',
    title: '6. Advertising disclosures',
    content: (
      <>
        <p>AQPrompts may load Adsterra Native Banners in the homepage feed, selected blog articles, and below the main copy button on prompt detail pages. Adsterra display banners may appear after the fifth and tenth prompts in the prompt library and below prompt detail images. These advertising scripts load only after a visitor grants optional advertising consent. No ad tag is loaded when advertising consent is absent or rejected. AdSense ads are not part of this test.</p>
        <p>When enabled, Adsterra may process technical, device, approximate-location, and usage information such as IP address, browser/device details, page context, and ad interactions to deliver, limit, and measure ads. The native banner script loads asynchronously after advertising consent. Review <a href="https://adsterra.com/privacy-policy/" target="_blank" rel="noreferrer">Adsterra’s Privacy Policy</a>. Users can change their choice at any time using Cookie Settings.</p>
      </>
    ),
  },
  {
    id: 'purposes-bases',
    title: '7. Why we use information and legal bases',
    content: (
      <>
        <p>We use information to provide requested prompts and emails, operate account and membership features, process support requests, secure the service, prevent abuse, maintain preferences, measure performance with consent, comply with legal obligations, and establish or defend legal claims.</p>
        <p>Where applicable, processing is based on performance of a contract or steps you request, consent for optional analytics, advertising, preference storage or marketing communications, legitimate interests in operating and securing the service, and compliance with legal obligations.</p>
        <p>You may withdraw optional browser consent at any time. Withdrawal does not affect processing already carried out before the change.</p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: '8. How information is shared',
    content: (
      <>
        <p>Information is shared only as reasonably required with the service providers described above, hosting and database infrastructure, professional advisers, authorities where legally required, or a successor in a legitimate business transfer.</p>
        <p>We do not claim that service-provider processing is anonymous. We do not sell contact, account, or membership information as a standalone product.</p>
      </>
    ),
  },
  {
    id: 'retention-security',
    title: '9. Retention and security',
    content: (
      <>
        <p>Contact messages are kept as long as reasonably needed to respond and maintain support records. Authentication tokens expire quickly, while related security records may be retained for abuse prevention. Session cookies expire or are removed when you sign out.</p>
        <p>Customer, transaction, and subscription records are retained while needed for fulfillment, accounting, tax, fraud, dispute, and legal purposes. Analytics and provider records follow the applicable account settings and provider retention rules.</p>
        <p>We use reasonable technical and organizational safeguards, but no internet transmission, browser storage, database, or third-party service can be guaranteed completely secure.</p>
      </>
    ),
  },
  {
    id: 'international-rights',
    title: '10. International processing and your rights',
    content: (
      <>
        <p>AQPrompts and its providers may process information outside your country in locations where they or their infrastructure operate. Privacy protections can differ between countries.</p>
        <p>Depending on your location, you may have rights to request access, correction, deletion, restriction, objection, portability, withdrawal of consent, or a complaint to a privacy regulator. These rights may be limited by legal exceptions and record-retention duties.</p>
        <p>To make a request, email <a href="mailto:hello@aqprompts.com">hello@aqprompts.com</a> or use the <Link href="/contact">contact page</Link>. We may need to verify your identity before acting on a request.</p>
      </>
    ),
  },
  {
    id: 'children-links',
    title: '11. Children, external links, and policy changes',
    content: (
      <>
        <p>AQPrompts is not directed to children under 13, and we do not knowingly request personal information from children under 13. A parent or guardian may contact us if they believe a child submitted information.</p>
        <p>External websites and AI platforms have their own privacy practices. A link from AQPrompts does not make us responsible for another service’s processing.</p>
        <p>We may update this policy when our services, providers, or legal obligations change. The revised date will appear at the top of this page.</p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <Header />
      <main id="main-content">
        <section className="border-b border-[#ff6b35]/15 bg-[#fffaf7] py-16 dark:bg-[#09090f] sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <ShieldCheck className="h-12 w-12 text-[#c2410c]" aria-hidden="true" />
            <p className="mt-5 text-sm font-black uppercase tracking-[0.2em] text-[#c2410c]">Privacy and data use</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Privacy Policy</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">
              This policy explains what AQPrompts collects, why it is used, which real providers receive it, and the choices available to you.
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>
          </div>
        </section>

        <section className="bg-slate-50 py-12 dark:bg-[#09090f] sm:py-16">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:px-8">
            <nav className="h-fit rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-24 dark:border-white/10 dark:bg-[#111118]" aria-label="Privacy Policy sections">
              <p className="px-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">On this page</p>
              <ul className="mt-3 space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="block rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-[#fff4ef] hover:text-[#c2410c] dark:text-slate-300">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="space-y-5">
              {sections.map((section) => (
                <article key={section.id} id={section.id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#111118] sm:p-8">
                  <h2 className="text-2xl font-black">{section.title}</h2>
                  <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300 [&_a]:font-bold [&_a]:text-[#c2410c] [&_a]:hover:underline [&_li]:pl-1 [&_strong]:text-slate-900 dark:[&_strong]:text-white [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
                    {section.content}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
