import Link from 'next/link';
import { FileCheck2 } from 'lucide-react';

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
  return buildStaticPageMetadata('editorialPolicy');
}

const sections = [
  ['Purpose and selection', 'AQPrompts publishes practical prompt references and creator guides. Topics should answer a recognizable creative task, explain how to adapt the prompt, or resolve a common problem. Search demand alone is not enough reason to publish a near-duplicate page.'],
  ['Originality', 'Articles should add topic-specific explanation, customization guidance, limitations, troubleshooting, and responsible-use context. Prompts, introductions, FAQs, and conclusions should not be multiplied through superficial wording changes.'],
  ['AI-assisted work and human review', 'AI tools may assist drafting, organization, editing, or example-image creation. Abdul Qudoos is responsible for reviewing public wording, removing unsupported claims, checking page structure, and deciding whether material should be published, corrected, consolidated, or removed.'],
  ['Facts and compatibility', 'Tool names and features are checked against available source material and official documentation where practical. Compatibility statements are qualified because model behavior, interfaces, safety rules, and commercial terms can change.'],
  ['Updates and corrections', 'Material revisions can receive an updated date. Small formatting changes do not need to be presented as a new editorial review. Readers can report an error through the contact page; confirmed problems may be corrected without preserving inaccurate wording.'],
  ['Prompt and image provenance', 'Prompt records are maintained in AQPrompts source data. Example images may be AI-generated and are labelled as demonstrations. Unknown image provenance remains unknown internally until evidence is supplied; a filename or visual appearance is not treated as ownership proof.'],
  ['Identity and reference photographs', 'Users should upload only photographs they own or are permitted to use. Content should not encourage impersonation, fraud, deceptive evidence, harassment, or unauthorized identity manipulation.'],
  ['Sponsored, affiliate, and advertising content', 'Commercial relationships should be disclosed where they occur. Advertising or future affiliate compensation does not control editorial conclusions. AQPrompts does not describe an advertising or affiliate programme as active when it is not confirmed.'],
  ['Complaints and removals', 'Requests involving accuracy, copyright, image rights, privacy, unsafe instructions, or deceptive use can be submitted through the existing contact route. Content may be revised, noindexed, consolidated, or removed when it cannot be supported or made useful.'],
];

export default function EditorialPolicyPage() {
  const pageUrl = absoluteUrl('/editorial-policy');
  const schema = [
    buildWebsiteSchema(),
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'Editorial Policy', item: '/editorial-policy' },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'AQPrompts Editorial Policy',
      description: 'How AQPrompts selects, reviews, updates, discloses, corrects, and removes prompt and article content.',
      url: pageUrl,
      author: {
        '@type': 'Person',
        name: ABDUL_QUDOOS.name,
        url: absoluteUrl(ABDUL_QUDOOS.url),
      },
      about: { '@type': 'Organization', name: 'AQPrompts', url: absoluteUrl('/') },
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <JsonLd data={schema} />
      <Header />
      <main id="main-content">
        <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Editorial Policy' }]} />
        </div>
        <section className="border-b border-slate-200 py-14 dark:border-white/10 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <FileCheck2 className="h-12 w-12 text-[#c2410c]" aria-hidden="true" />
            <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-[#c2410c]">Publishing standards</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Editorial Policy</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">
              This policy explains how AQPrompts selects, reviews, discloses, updates, corrects, and removes public content.
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-500">Last updated: July 26, 2026</p>
          </div>
        </section>

        <section className="bg-slate-50 py-12 dark:bg-[#09090f] sm:py-16">
          <div className="mx-auto max-w-4xl space-y-5 px-4 sm:px-6 lg:px-8">
            {sections.map(([title, content], index) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#111118] sm:p-8">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]">Policy {index + 1}</p>
                <h2 className="mt-2 text-2xl font-black">{title}</h2>
                <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{content}</p>
              </article>
            ))}
            <article className="rounded-2xl border border-[#ff6b35]/30 bg-[#fff4ef] p-6 dark:bg-[#1b1514] sm:p-8">
              <h2 className="text-2xl font-black">Accountability and contact</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
                Editorial responsibility is held by{' '}
                <Link href={ABDUL_QUDOOS.url} className="font-bold text-[#c2410c] hover:underline">{ABDUL_QUDOOS.name}</Link>.
                Read <Link href="/how-we-review-prompts" className="font-bold text-[#c2410c] hover:underline">How We Review Prompts</Link>,
                or submit feedback through the <Link href="/contact" className="font-bold text-[#c2410c] hover:underline">Contact page</Link>.
              </p>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
