import Link from 'next/link';
import { AlertCircle, CheckCircle2, ClipboardCheck } from 'lucide-react';

import Breadcrumb from '@/components/Breadcrumb';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import { ABDUL_QUDOOS } from '@/lib/author';
import { buildStaticPageMetadata } from '@/lib/metadata';
import { absoluteUrl, buildBreadcrumbSchema, buildWebsiteSchema } from '@/lib/seo';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildStaticPageMetadata('reviewMethod');
}

const reviewSteps = [
  ['Topic selection', 'Ideas come from the current library structure, reader requests, recurring creator tasks, and gaps noticed while editing existing pages. A topic is kept only when it has a clear use case.'],
  ['Prompt clarity', 'The subject, setting, action, styling, composition, and requested output are checked for contradictions or unclear instructions. Repeated adjectives that add no direction are removed.'],
  ['Identity and reference images', 'When a prompt uses a reference photo, the wording is reviewed to distinguish identity guidance from a guarantee. Readers are reminded to use only images they own or have permission to use.'],
  ['Safety and deceptive use', 'Instructions that encourage impersonation, fraud, harassment, deceptive evidence, or unauthorized identity manipulation should not be published. Sensitive examples can be corrected or removed after review.'],
  ['Compatibility wording', 'A tool name is used descriptively when the prompt format is relevant to that tool. Compatibility language is not treated as proof that every model version will interpret the prompt in the same way.'],
  ['Categories and duplicates', 'The title, use case, tags, and category are compared with existing records. Substantially overlapping ideas should be differentiated, consolidated, or withheld rather than published as a near-copy.'],
  ['Guide review', 'Article introductions, explanations, customization advice, troubleshooting, image captions, links, and conclusions are checked for usefulness and topic fit rather than word-count padding.'],
  ['Corrections and updates', 'Reader reports and editorial reviews can lead to wording changes, updated disclosures, corrected links, consolidation, or removal. Material article updates receive an updated date.'],
];

export default function HowWeReviewPromptsPage() {
  const pageUrl = absoluteUrl('/how-we-review-prompts');
  const schema = [
    buildWebsiteSchema(),
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'How We Review Prompts', item: '/how-we-review-prompts' },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'How AQPrompts Reviews Prompts',
      description: 'The editorial workflow used to review AQPrompts prompt wording, categorization, safety, duplication, and updates.',
      url: pageUrl,
      author: {
        '@type': 'Person',
        name: ABDUL_QUDOOS.name,
        url: absoluteUrl(ABDUL_QUDOOS.url),
      },
      isPartOf: { '@type': 'WebSite', name: 'AQPrompts', url: absoluteUrl('/') },
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <JsonLd data={schema} />
      <Header />
      <main id="main-content">
        <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'How We Review Prompts' }]} />
        </div>
        <section className="border-b border-slate-200 py-14 dark:border-white/10 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <ClipboardCheck className="h-12 w-12 text-[#c2410c]" aria-hidden="true" />
            <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-[#c2410c]">Editorial methodology</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">How We Review Prompts</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">
              AQPrompts uses editorial review to make prompts clearer, safer, easier to customize, and less repetitive.
              Review is not the same as documented generation testing.
            </p>
          </div>
        </section>

        <section className="bg-slate-50 py-12 dark:bg-[#09090f] sm:py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-5 md:grid-cols-2">
              {reviewSteps.map(([title, description], index) => (
                <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#111118]">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]">Step {index + 1}</p>
                  <h2 className="mt-2 text-xl font-black">{title}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{description}</p>
                </article>
              ))}
            </div>

            <article className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/20 dark:text-amber-100 sm:p-8">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-1 h-6 w-6 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="text-2xl font-black">Editorial review versus generation testing</h2>
                  <p className="mt-3 text-sm leading-7">
                    A reviewed prompt has been checked as written. It is not described as generated, proven, or tested
                    unless a retained record identifies the prompt version, tool, model or version, relevant settings,
                    date, and output. The current public library does not provide that evidence for every prompt.
                  </p>
                  <p className="mt-3 text-sm leading-7">
                    Outputs vary by tool, model, version, settings, seed, safety system, and reference image. No review
                    can guarantee an identical face, composition, or result.
                  </p>
                  <p className="mt-3 text-sm leading-7">
                    AQPrompts currently publishes an editorial-review status. Generation evidence is described as
                    available only when the exact prompt version, tester, date, tool and model, settings, outputs,
                    failed outputs, revisions, permissions, and publication rights are retained in a reviewed record.
                    No comparative tool-performance claim is allowed without that record.
                  </p>
                </div>
              </div>
            </article>

            <article className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#111118] sm:p-8">
              <h2 className="text-2xl font-black">Report a problem</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                Use the <Link href="/contact" className="font-bold text-[#c2410c] hover:underline">contact form</Link> and
                choose “Report Issue.” Include the page URL, the wording or image concerned, and why it appears inaccurate,
                unsafe, duplicated, or misleading. Editorial decisions are handled by{' '}
                <Link href={ABDUL_QUDOOS.url} className="font-bold text-[#c2410c] hover:underline">{ABDUL_QUDOOS.name}</Link>.
              </p>
              <div className="mt-5 flex gap-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#c2410c]" aria-hidden="true" />
                <span>Corrections may update wording, metadata, categorization, disclosure, indexing, or removal decisions.</span>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
                Material article corrections use the visible updated date and update note. Internal evidence records
                retain the review status; draft or incomplete testing records are not presented as public proof.
              </p>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
