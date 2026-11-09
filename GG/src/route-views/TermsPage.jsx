import Link from 'next/link';
import { AlertTriangle, ArrowRight, CreditCard, FileText, LockKeyhole, RotateCcw, Scale, ShieldCheck } from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';

const LAST_UPDATED = 'July 14, 2026';

const sections = [
  {
    id: 'acceptance',
    title: '1. Acceptance of these Terms',
    content: (
      <>
        <p>
          These Terms and Conditions (&ldquo;Terms&rdquo;) form a binding agreement between you and AQPrompts
          (&ldquo;AQPrompts,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) concerning your access to and use of
          aqprompts.com, our prompt library, guides, digital memberships, community resources, and related services
          (collectively, the &ldquo;Services&rdquo;).
        </p>
        <p>
          By accessing or using the Services, creating an account, submitting a request, or purchasing a membership,
          you confirm that you have read, understood, and agree to these Terms and our{' '}
          <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the Services.
        </p>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: '2. Eligibility and authority',
    content: (
      <>
        <p>You must be at least 13 years old to browse or use the free portions of the Services.</p>
        <p>
          To purchase a paid subscription, you must be at least 18 years old (or the age of legal majority where you
          live) and legally capable of entering into a contract. If you use the Services for a company or another
          organization, you represent that you have authority to bind that organization to these Terms.
        </p>
      </>
    ),
  },
  {
    id: 'services',
    title: '3. Our Services',
    content: (
      <>
        <p>
          AQPrompts currently provides a free public library for AI creators, including AI image prompts, educational
          guides, prompt collections, creator workflows, and community resources. Features and availability may vary
          by location, device, or time.
        </p>
        <p>
          The 3-day WhatsApp community access is free and does not collect payment or start a recurring subscription.
          Starter, Pro, and VIP checkout are currently paused. The paid-service clauses below remain in these Terms
          for historical transactions and any clearly announced future relaunch.
        </p>
      </>
    ),
  },
  {
    id: 'prompt-license',
    title: '4. Prompt licence and permitted use',
    content: (
      <>
        <p>
          Subject to these Terms, AQPrompts grants you a limited, non-exclusive, non-transferable, revocable licence to
          use individual prompts you lawfully access to generate content for personal or commercial projects.
        </p>
        <p>You may adapt prompts for your own workflow. You may not:</p>
        <ul>
          <li>resell, sublicense, redistribute, or publish our prompt text as a competing prompt product or library;</li>
          <li>copy or scrape a substantial portion of the Services, whether manually or using automated tools;</li>
          <li>remove branding, attribution, access controls, or copyright notices from our materials;</li>
          <li>share paid-only materials with people who do not have valid access; or</li>
          <li>use our content to train, build, or improve a competing dataset, model, product, or service without written permission.</li>
        </ul>
        <p>
          Your right to commercially use an AI-generated output also depends on applicable law and the licence and
          terms of the AI platform used to generate it. AQPrompts does not grant rights in third-party models,
          trademarks, personalities, reference images, or other protected material.
        </p>
      </>
    ),
  },
  {
    id: 'ai-content',
    title: '5. AI tools, reference images, and generated outputs',
    content: (
      <>
        <p>
          AI systems are probabilistic. We do not guarantee that any prompt will produce a particular result, remain
          compatible with every model version, or generate content that is accurate, original, lawful, or suitable
          for your intended purpose.
        </p>
        <p>
          You are responsible for reviewing generated outputs before publication or commercial use. You must have all
          necessary rights and permissions for any image, face, logo, artwork, personal data, or other material you
          upload to a third-party AI service. Do not create deceptive, abusive, unlawful, infringing, or non-consensual
          content, including impersonation or intimate imagery without the subject&rsquo;s permission.
        </p>
        <p>
          AQPrompts is independent from OpenAI, Midjourney, Google, Leonardo AI, Stability AI, and other third-party AI
          providers unless expressly stated otherwise. Their products are governed by their own terms and policies.
        </p>
      </>
    ),
  },
  {
    id: 'subscriptions',
    title: '6. Paid subscriptions and automatic renewal',
    content: (
      <>
        <p>
          Starter and Pro are currently paused and cannot be purchased through AQPrompts. If paid memberships are
          reintroduced, the plan, billing interval, currency, taxes, and total price shown in Paddle Checkout at the
          time of purchase will control your transaction.
        </p>
        <p>
          Unless cancelled, your subscription automatically renews for the same billing interval at the then-current
          price disclosed to you, subject to any notice required by applicable law. By subscribing, you authorize
          recurring charges using your selected payment method.
        </p>
        <p>
          Plan features may have fair-use limits. &ldquo;Regular,&rdquo; &ldquo;weekly,&rdquo; or similar delivery descriptions are
          service targets and may be adjusted for maintenance, holidays, unexpected events, or product improvements.
          Material reductions to a paid plan will be communicated where reasonably possible.
        </p>
      </>
    ),
  },
  {
    id: 'paddle',
    title: '7. Paddle billing and Merchant of Record',
    content: (
      <>
        <p>
          Paid transactions are processed by Paddle, which acts as Merchant of Record and authorized reseller for the
          digital product. This means Paddle is responsible for charging you, processing payment, calculating and
          collecting applicable taxes, issuing transaction documents, and providing payment-related buyer support.
          AQPrompts remains responsible for the digital product, access, and product support.
        </p>
        <p>
          Your purchase is also subject to the{' '}
          <a href="https://www.paddle.com/legal/buyer-terms" target="_blank" rel="noreferrer">
            Paddle Buyer Terms
          </a>. For Paddle transaction lookup, cancellation, or payment support, visit{' '}
          <a href="https://paddle.net" target="_blank" rel="noreferrer">Paddle.net</a>.
        </p>
      </>
    ),
  },
  {
    id: 'cancellation-refunds',
    title: '8. Cancellation, failed payments, and refunds',
    content: (
      <>
        <p>
          You may cancel a subscription through the available billing portal, Paddle buyer support, or by contacting
          us. Cancellation normally takes effect at the end of the current paid billing period, and you retain access
          until that date unless the subscription is cancelled immediately for fraud, misuse, chargeback, legal, or
          security reasons.
        </p>
        <p>
          Cancellation prevents future renewals but does not automatically refund amounts already charged. Refund
          requests are handled under our <Link href="/refund-policy">Refund Policy</Link>, Paddle&rsquo;s applicable
          buyer policies, and mandatory consumer law. Nothing in these Terms limits a non-waivable right you have
          under applicable law.
        </p>
        <p>
          If payment fails, access may be restricted, paused, or terminated after any applicable retry or grace
          period. You remain responsible for valid charges incurred before cancellation.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: '9. Accounts, access, and security',
    content: (
      <>
        <p>
          Where account or email-based access is available, you must provide accurate information and keep your access
          credentials secure. You are responsible for activity conducted through your account or device and must
          notify us promptly if you suspect unauthorized use.
        </p>
        <p>
          Membership access is personal to the purchaser unless a plan expressly permits team use. You may not sell,
          transfer, rent, or share access in a way that bypasses plan limits or payment requirements.
        </p>
      </>
    ),
  },
  {
    id: 'custom-requests',
    title: '10. Custom requests and user submissions',
    content: (
      <>
        <p>
          If you submit a custom prompt request, feedback, message, image description, or other material, you retain
          ownership of your original material. You grant AQPrompts a limited, worldwide, royalty-free licence to host,
          process, reproduce, and adapt that material only as reasonably necessary to provide, secure, support, and
          improve the Services.
        </p>
        <p>
          You represent that your submission is lawful, does not violate another person&rsquo;s privacy or intellectual
          property rights, and does not contain confidential information you are not authorized to disclose. We may
          decline any request that is unsafe, unlawful, abusive, technically impractical, or outside the purchased
          plan.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: '11. Acceptable use',
    content: (
      <>
        <p>You must not use the Services to:</p>
        <ul>
          <li>break any law, regulation, court order, or third-party platform rule;</li>
          <li>infringe copyright, trademark, publicity, privacy, or other rights;</li>
          <li>harass, exploit, defraud, impersonate, or harm another person;</li>
          <li>distribute malware, spam, phishing, or deceptive communications;</li>
          <li>probe, bypass, disable, or interfere with security, rate limits, access controls, or infrastructure;</li>
          <li>manipulate likes, ratings, views, subscriptions, or other engagement systems;</li>
          <li>use bots, scraping, bulk extraction, or automated access without written permission; or</li>
          <li>help another person carry out any prohibited activity.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    title: '12. AQPrompts intellectual property',
    content: (
      <>
        <p>
          The Services and their original prompt collections, text, arrangement, design, graphics, software, logos,
          and branding are owned by or licensed to AQPrompts and are protected by applicable intellectual property
          laws. Except for the limited licence expressly granted in these Terms, no rights are transferred to you.
        </p>
        <p>
          &ldquo;AQPrompts&rdquo; and related branding may not be used in a way that suggests sponsorship, endorsement, or
          affiliation without prior written permission.
        </p>
      </>
    ),
  },
  {
    id: 'third-parties',
    title: '13. Third-party services and links',
    content: (
      <p>
        The Services may link to or integrate with Paddle, AI platforms, analytics providers, email services,
        community platforms, and other third parties. We do not control their availability, security, content, or
        policies and are not responsible for losses caused by your independent use of a third-party service. Review
        the third party&rsquo;s terms and privacy policy before use.
      </p>
    ),
  },
  {
    id: 'availability',
    title: '14. Availability and changes to the Services',
    content: (
      <>
        <p>
          We may maintain, update, modify, suspend, or discontinue features to improve security, comply with law,
          respond to third-party changes, or operate the business. We do not guarantee uninterrupted or error-free
          availability, permanent storage of saved items, or compatibility with every browser, device, or AI model.
        </p>
        <p>
          If we permanently discontinue a material paid Service during an active prepaid period, we will provide an
          appropriate remedy as required by applicable law, which may include continued access, replacement service,
          or a prorated refund processed through Paddle.
        </p>
      </>
    ),
  },
  {
    id: 'privacy',
    title: '15. Privacy',
    content: (
      <p>
        Our <Link href="/privacy">Privacy Policy</Link> explains how we collect, use, disclose, and protect personal
        information. Paddle and other third parties process information under their own privacy notices when you use
        their services.
      </p>
    ),
  },
  {
    id: 'disclaimers',
    title: '16. Disclaimers',
    content: (
      <>
        <p>
          To the fullest extent permitted by law, the Services are provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; We
          disclaim implied warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy,
          and uninterrupted availability.
        </p>
        <p>
          Our guides and communications are general educational information, not legal, financial, medical, tax, or
          professional advice. No prompt, guide, support response, or community discussion guarantees income,
          engagement, business growth, platform approval, or any particular AI output.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    title: '17. Limitation of liability',
    content: (
      <>
        <p>
          To the fullest extent permitted by law, AQPrompts and its operators, contractors, and affiliates will not be
          liable for indirect, incidental, special, exemplary, punitive, or consequential damages, or for loss of
          profits, data, goodwill, business opportunity, or generated content arising from the Services.
        </p>
        <p>
          To the fullest extent permitted by law, our total aggregate liability arising out of or relating to the
          Services will not exceed the greater of the amount you paid for the affected Service during the 12 months
          before the claim or US$100. These limitations do not apply where liability cannot legally be excluded or
          limited, including applicable consumer rights.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: '18. Indemnity',
    content: (
      <p>
        To the extent permitted by law, you agree to defend, indemnify, and hold harmless AQPrompts and its operators,
        contractors, and affiliates from third-party claims, damages, and reasonable costs arising from your unlawful
        use of the Services, your submissions or generated content, your infringement of another person&rsquo;s rights,
        or your material breach of these Terms.
      </p>
    ),
  },
  {
    id: 'termination',
    title: '19. Suspension and termination',
    content: (
      <>
        <p>
          We may restrict, suspend, or terminate access when we reasonably believe you violated these Terms, created a
          security or legal risk, failed to pay, abused support or community members, or used the Services fraudulently.
          Where appropriate, we will provide notice and an opportunity to correct the issue.
        </p>
        <p>
          Provisions that by their nature should survive termination—including ownership, payment obligations,
          disclaimers, liability limits, indemnity, and dispute terms—will survive.
        </p>
      </>
    ),
  },
  {
    id: 'law-disputes',
    title: '20. Governing law and disputes',
    content: (
      <>
        <p>
          These Terms are governed by the laws of Pakistan, without regard to conflict-of-law principles. Before
          starting formal proceedings, you agree to contact us and allow at least 30 days for a good-faith attempt to
          resolve the dispute.
        </p>
        <p>
          Subject to any mandatory consumer forum or law that applies to you, disputes relating to AQPrompts or these
          Terms will be submitted to courts of competent jurisdiction in Pakistan. Paddle-related purchases may also
          be governed by Paddle&rsquo;s Buyer Terms and applicable mandatory consumer protections.
        </p>
      </>
    ),
  },
  {
    id: 'general',
    title: '21. General terms',
    content: (
      <>
        <p>
          These Terms, together with policies incorporated by reference, are the entire agreement concerning the
          Services. If any provision is unenforceable, it will be limited or removed only to the minimum extent
          necessary, and the remaining provisions will continue in effect. Our failure to enforce a provision is not
          a waiver. You may not assign these Terms without our written consent; we may assign them as part of a merger,
          acquisition, reorganization, or transfer of the Services.
        </p>
        <p>
          Headings are for convenience only. Electronic communications and notices satisfy any requirement that a
          communication be in writing where permitted by law.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '22. Changes to these Terms',
    content: (
      <p>
        We may update these Terms to reflect changes in the Services, law, security practices, or business operations.
        We will post the revised version and update the date above. If a change materially affects an active paid
        subscription, we will provide reasonable notice where required. Continued use after the effective date means
        you accept the revised Terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '23. Contact and support',
    content: (
      <>
        <p>For product, account, billing, legal, or rights-related questions, contact:</p>
        <p>
          <strong>AQPrompts</strong><br />
          Website: <a href="https://www.aqprompts.com">www.aqprompts.com</a><br />
          Email: <a href="mailto:hello@aqprompts.com">hello@aqprompts.com</a>
        </p>
        <p>
          For a Paddle transaction, subscription lookup, or payment question, you may also visit{' '}
          <a href="https://paddle.net" target="_blank" rel="noreferrer">Paddle.net</a>.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <Header />
      <main>
        <section id="top" className="relative isolate scroll-mt-24 overflow-hidden border-b border-[#ff6b35]/15 bg-[#fffaf7] py-16 dark:bg-[#09090f] sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,107,53,0.20),transparent_32%),radial-gradient(circle_at_82%_70%,rgba(255,107,53,0.12),transparent_30%)]" />
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,107,53,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(255,107,53,0.10)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ff6b35] text-white shadow-[0_16px_40px_rgba(255,107,53,0.30)]">
                <Scale className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="mt-6 text-sm font-black uppercase tracking-[0.2em] text-[#c2410c]">Legal agreement</p>
              <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-0.03em] text-slate-950 sm:text-6xl dark:text-white">Terms and Conditions</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8 dark:text-slate-300">
                Clear rules for using AQPrompts, our free AI prompt resources, and any historical or future paid services.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/tools/ai-image-prompts" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#ff6b35] px-5 text-sm font-black text-white shadow-[0_12px_32px_rgba(255,107,53,0.24)] transition hover:-translate-y-0.5 hover:bg-[#e85d28]">
                  Browse free prompts <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/privacy" className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-white/80 px-5 text-sm font-black text-slate-800 backdrop-blur transition hover:border-[#ff6b35] hover:text-[#c2410c] dark:border-white/10 dark:bg-white/5 dark:text-white">
                  Privacy Policy
                </Link>
                <Link href="/refund-policy" className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-white/80 px-5 text-sm font-black text-slate-800 backdrop-blur transition hover:border-[#ff6b35] hover:text-[#c2410c] dark:border-white/10 dark:bg-white/5 dark:text-white">
                  Refund Policy
                </Link>
              </div>
              <p className="mt-5 text-sm font-semibold text-slate-500 dark:text-slate-400">Effective and last updated: {LAST_UPDATED}</p>
            </div>
          </div>
        </section>

        <section className="border-b border-[#e5e7eb] bg-white py-8 dark:border-white/10 dark:bg-[#0a0a0f]">
          <div className="mx-auto grid max-w-5xl gap-3 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
            {[
              { icon: FileText, title: 'Clear prompt licence', text: 'Use prompts in your projects without redistributing our library.', href: '#prompt-license' },
              { icon: CreditCard, title: 'Membership paused', text: 'No new paid plan can be started while VIP is paused.', href: '#subscriptions' },
              { icon: ShieldCheck, title: 'Your rights preserved', text: 'Mandatory consumer rights remain protected.', href: '#cancellation-refunds' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <a key={item.title} href={item.href} className="group rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-4 transition hover:-translate-y-0.5 hover:border-[#ff6b35]/40 hover:bg-[#fff4ef] hover:shadow-[0_14px_35px_rgba(255,107,53,0.10)] dark:border-white/10 dark:bg-[#111118] dark:hover:bg-[#1b1514]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff6b35]/10 text-[#c2410c]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#c2410c]" aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-950 dark:text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{item.text}</p>
                </a>
              );
            })}
          </div>
        </section>

        <section className="bg-[#f8fafc] py-12 dark:bg-[#09090f] sm:py-16">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:px-8">
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="overflow-hidden rounded-[1.25rem] border border-[#e5e7eb] bg-white shadow-[0_16px_45px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[#111118]">
                <div className="border-b border-[#e5e7eb] bg-[#fff4ef] px-5 py-4 dark:border-white/10 dark:bg-[#1b1514]">
                  <h2 className="text-sm font-black uppercase tracking-[0.15em] text-slate-950 dark:text-white">On this page</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Jump to any section</p>
                </div>
                <nav className="mt-4 max-h-[65vh] space-y-1 overflow-y-auto pr-2" aria-label="Terms sections">
                  {sections.map((section) => (
                    <a key={section.id} href={`#${section.id}`} className="mx-2 block rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-[#fff4ef] hover:text-[#c2410c] dark:text-slate-300 dark:hover:bg-[#1b1514]">
                      {section.title}
                    </a>
                  ))}
                </nav>
                <div className="mt-3 border-t border-[#e5e7eb] p-3 dark:border-white/10">
                  <Link href="/contact" className="flex items-center justify-center gap-2 rounded-xl bg-[#111118] px-4 py-3 text-xs font-black text-white transition hover:bg-[#ff6b35] dark:bg-white dark:text-[#111118] dark:hover:bg-[#ff6b35] dark:hover:text-white">
                    <LockKeyhole className="h-4 w-4" aria-hidden="true" /> Legal question?
                  </Link>
                </div>
              </div>
            </aside>

            <div className="min-w-0 space-y-5">
              <div className="flex gap-3 rounded-[1.25rem] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>
                  VIP checkout is currently paused and the public prompt library is free. The billing clauses below remain available for historical records and any clearly announced future paid service.
                </p>
              </div>

              {sections.map((section) => (
                <article key={section.id} id={section.id} className="group scroll-mt-24 rounded-[1.5rem] border border-[#e5e7eb] bg-white p-6 shadow-[0_12px_38px_rgba(15,23,42,0.05)] transition hover:border-[#ff6b35]/25 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#111118] sm:p-8">
                  <div className="flex items-start gap-4">
                    <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-[#ff6b35]/10 px-2 text-sm font-black text-[#c2410c] ring-1 ring-[#ff6b35]/15">
                      {section.title.split('.')[0]}
                    </span>
                    <h2 className="pt-0.5 text-2xl font-black tracking-normal text-slate-950 dark:text-white">
                      {section.title.replace(/^\d+\.\s*/, '')}
                    </h2>
                  </div>
                  <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base [&_a]:font-bold [&_a]:text-[#c2410c] [&_a]:underline-offset-4 hover:[&_a]:underline [&_li]:pl-1 [&_strong]:text-slate-900 dark:[&_strong]:text-white [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
                    {section.content}
                  </div>
                </article>
              ))}

              <div className="rounded-[1.5rem] border border-[#ff6b35]/25 bg-[#fff4ef] p-6 shadow-[0_18px_50px_rgba(255,107,53,0.12)] dark:bg-[#1b1514]">
                <h2 className="text-xl font-black tracking-normal text-slate-950 dark:text-white">Questions before subscribing?</h2>
                <p className="mt-3 leading-7 text-slate-700 dark:text-slate-200">Contact us and we will help clarify product access, billing, cancellation, or these Terms.</p>
                <Link href="/contact" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#ff6b35] px-5 py-3 text-sm font-black text-white transition hover:bg-[#e85d28]">
                  Contact AQPrompts
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a href="#top" className="ml-3 mt-5 inline-flex items-center gap-2 rounded-full border border-[#ff6b35]/25 bg-white px-5 py-3 text-sm font-black text-slate-800 transition hover:border-[#ff6b35] hover:text-[#c2410c] dark:bg-[#0a0a0f] dark:text-white">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Back to top
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
