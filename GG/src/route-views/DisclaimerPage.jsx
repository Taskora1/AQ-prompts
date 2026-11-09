import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';

const LAST_UPDATED = 'October 5, 2026';

const sections = [
  {
    id: 'general',
    title: 'General information',
    content: (
      <p>AQPrompts provides creative prompts, examples, and educational information. The material is not legal, financial, medical, or other professional advice and does not guarantee income, engagement, business results, platform approval, or a particular AI output.</p>
    ),
  },
  {
    id: 'results',
    title: 'AI results and limitations',
    content: (
      <>
        <p>Prompt results can differ between generations and may not match example images. Differences can result from the AI tool, model, version, seed, account tier, settings, safety system, reference image, aspect ratio, regional availability, or later platform updates.</p>
        <p>Users should review generated outputs for factual errors, visual defects, inappropriate details, and suitability before publishing or relying on them.</p>
      </>
    ),
  },
  {
    id: 'platforms-brands',
    title: 'Third-party platforms and brand names',
    content: (
      <>
        <p>AQPrompts is not officially affiliated with, endorsed by, or sponsored by OpenAI, ChatGPT, Midjourney, Leonardo AI, Stability AI, Stable Diffusion, Google Gemini, or another third-party platform unless a page expressly says otherwise.</p>
        <p>Platform, product, publication, camera, and brand names may appear for descriptive, compatibility, or creative-reference purposes. Their use does not transfer trademark rights or imply that the brand approved the prompt or output.</p>
      </>
    ),
  },
  {
    id: 'commercial-use',
    title: 'Commercial use and platform terms',
    content: (
      <>
        <p>Each AI service sets its own rules for subscriptions, generated-output rights, commercial use, prohibited content, reference images, and attribution. Those rules may change.</p>
        <p>You are responsible for reviewing the current terms of the AI tool you use and confirming that your intended personal or commercial use is permitted.</p>
      </>
    ),
  },
  {
    id: 'images-rights',
    title: 'AI example images and image rights',
    content: (
      <>
        <p>Images presented with prompts or articles may be AI-generated examples used for demonstration. Where the site identifies an image as an AI example, that label does not apply to clearly identified real photographs such as the founder photograph.</p>
        <p>You must own an uploaded reference photograph or have permission from the rights holder and any identifiable person to use it. AQPrompts does not grant rights over third-party trademarks, characters, celebrities, copyrighted works, publicity rights, or private photographs.</p>
        <p>AI-generated outputs can still create intellectual-property, privacy, publicity, or consumer-protection issues. Obtain appropriate advice where your use presents material legal or commercial risk.</p>
      </>
    ),
  },
  {
    id: 'prohibited-use',
    title: 'Responsible identity use',
    content: (
      <>
        <p>Do not use AQPrompts to impersonate another person, commit fraud, deceive an audience, harass or exploit someone, create unauthorized identity manipulation, defeat verification systems, or misrepresent AI-generated travel, wealth, qualifications, products, or events as authentic evidence.</p>
        <p>You remain responsible for the prompt, reference material, generated output, disclosure, and way the output is published.</p>
      </>
    ),
  },
  {
    id: 'external',
    title: 'External links and services',
    content: (
      <p>AQPrompts may link to or integrate with external AI platforms, Formspree, Resend, Paddle, analytics services, community services, and other websites. Those services control their own content, availability, security, terms, and privacy practices. Review their policies before use.</p>
    ),
  },
  {
    id: 'ads-affiliates',
    title: 'Advertising and affiliate disclosure',
    content: (
      <>
        <p>AQPrompts may display Adsterra Native Banners in the homepage feed, after the third content section on selected blog articles, and below the main copy button on prompt detail pages. Adsterra display banners may appear after the fifth and tenth prompts in the prompt library and below prompt detail images. Ads load only after optional advertising consent. AdSense advertising is not part of this test. Advertising availability, placement, frequency, and format can change without notice.</p>
        <p>If affiliate links are introduced, a page-specific disclosure will explain when AQPrompts may receive compensation from a qualifying action. Advertising or compensation will not constitute an endorsement or guarantee of a third-party product.</p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Copyright, image-rights, and disclaimer questions',
    content: (
      <p>Send copyright notices, image-rights complaints, or questions to <a href="mailto:hello@aqprompts.com">hello@aqprompts.com</a> or through the <Link href="/contact">contact page</Link>. Include the affected URL, the material concerned, the basis of your request, and a reliable way to contact you.</p>
    ),
  },
];

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <Header />
      <main id="main-content">
        <section className="border-b border-[#ff6b35]/15 bg-[#fffaf7] py-16 dark:bg-[#09090f] sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <AlertTriangle className="h-12 w-12 text-[#c2410c]" aria-hidden="true" />
            <p className="mt-5 text-sm font-black uppercase tracking-[0.2em] text-[#c2410c]">Important information</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Disclaimer</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">
              Please review these limitations and responsible-use requirements before using AQPrompts or publishing AI-generated content.
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>
          </div>
        </section>

        <section className="bg-slate-50 py-12 dark:bg-[#09090f] sm:py-16">
          <div className="mx-auto max-w-4xl space-y-5 px-4 sm:px-6 lg:px-8">
            {sections.map((section) => (
              <article key={section.id} id={section.id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#111118] sm:p-8">
                <h2 className="text-2xl font-black">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300 [&_a]:font-bold [&_a]:text-[#c2410c] [&_a]:hover:underline">
                  {section.content}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
