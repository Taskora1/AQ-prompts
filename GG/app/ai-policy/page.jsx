import Footer from '@/components/Footer';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import { absoluteUrl, buildBreadcrumbSchema, buildWebsiteSchema } from '@/lib/seo';
import { buildMetadata } from '@/lib/metadata';

export const dynamic = 'force-static';
export const revalidate = false;

export const metadata = buildMetadata({
  title: 'AI Policy',
  description: 'Learn how AQPrompts uses artificial intelligence, AI-generated examples, and third-party AI tools.',
  path: '/ai-policy',
  keywords: ['AQPrompts AI policy', 'AI-generated images disclaimer', 'AI prompt usage policy'],
});

const sections = [
  {
    title: 'Introduction',
    paragraphs: [
      'AQPrompts is a free AI image prompt library created for creators, designers, photographers, marketers, and anyone interested in AI-generated visuals.',
      'Our prompts are designed to work with popular AI tools and platforms, including Midjourney, ChatGPT, Leonardo AI, Stable Diffusion, and Gemini. These tools may be used for generating images, editing photos, creating portraits, exploring fashion concepts, and developing creative visual ideas.',
      'We use AI as part of our content and website workflow to make our prompt library more useful, accessible, and easier to explore.',
    ],
  },
  {
    title: 'How AI Is Used on AQPrompts',
    bullets: [
      'Prompt creation: AI may assist with developing, organizing, or improving prompt ideas for different creative use cases.',
      'Content review: AI tools may assist with reviewing content for clarity, structure, formatting, and consistency.',
      'Website tools: AI may support certain website features, search experiences, recommendations, or other creator-focused tools.',
      'Image examples: AI image-generation tools may create visual examples that demonstrate the type of results a prompt can produce.',
    ],
    paragraphs: [
      'AI-assisted content may be reviewed and adjusted before publication. However, AI systems can produce unexpected or inaccurate information, so we do not guarantee that every AI-assisted result is perfect.',
    ],
  },
  {
    title: 'AI-Generated Images Disclaimer',
    paragraphs: [
      'Images displayed on AQPrompts may be AI-generated examples created for demonstration and inspiration. Unless clearly stated otherwise, these images should not be considered real photographs, real people, or documentation of real events.',
      'AI-generated images may contain visual inaccuracies, including unrealistic details, facial features, hands, objects, text, clothing, backgrounds, or other elements. Results can vary depending on the AI tool, model, prompt, settings, and input image used.',
      'Our images are intended to help users understand the creative possibilities of a prompt.',
    ],
  },
  {
    title: 'Third-Party AI Tools',
    paragraphs: [
      'AQPrompts provides prompts that may be used with third-party AI platforms such as Midjourney, ChatGPT, Leonardo AI, Stable Diffusion, and Gemini.',
      'AQPrompts does not own, operate, or control these services. Their features, models, pricing, availability, content policies, and terms may change at any time.',
      'When using an AQPrompts prompt with another AI platform, you are responsible for following that platform’s current terms of service, usage rules, content policies, and other applicable requirements. AQPrompts does not guarantee that a particular prompt will work the same way across different AI tools or models.',
    ],
  },
  {
    title: 'Content Guidelines',
    paragraphs: ['AQPrompts aims to provide useful and responsible prompts for creative work.'],
    bullets: [
      'Harmful or abusive content',
      'Explicit sexual content',
      'Illegal content',
      'Content that promotes violence or serious wrongdoing',
      'Content intended to deceive, exploit, or harm others',
      'Other content that violates applicable laws or the policies of the AI platforms where the prompts may be used',
    ],
    paragraphsAfter: ['We may remove, edit, restrict, or decline to publish content that does not meet our content standards.'],
  },
  {
    title: 'Accuracy & Results',
    paragraphs: [
      'AI-generated results are not guaranteed. The same prompt can produce different results depending on the AI platform, model or model version, prompt interpretation, image settings, reference images, aspect ratio, style settings, random generation or seed settings, and updates made by the AI provider.',
      'AQPrompts prompts should therefore be treated as creative starting points, rather than guaranteed instructions for producing an identical result. If a prompt does not produce the expected result, users may need to adjust the wording, settings, model, or other inputs.',
    ],
  },
  {
    title: 'User Responsibility',
    paragraphs: [
      'Users are responsible for how they use AQPrompts prompts and any images or other content generated from them.',
      'Before using an AI-generated image publicly, commercially, or for another specific purpose, users should make sure their use complies with applicable laws, intellectual property rights, privacy requirements, and the policies of the AI platform they are using.',
      'AQPrompts does not control the final output generated by third-party AI tools and is not responsible for how users choose to use those outputs.',
    ],
  },
  {
    title: 'Updates to This Policy',
    paragraphs: [
      'AI technology and AI platforms continue to evolve quickly. We may update this AI Policy from time to time to reflect changes in our website, AI tools, content practices, or industry standards.',
      'When we make changes, we may update the Effective Date shown at the top of this page. We encourage users to review this page periodically for the latest information.',
    ],
  },
];

export default function AiPolicyPage() {
  const pageUrl = absoluteUrl('/ai-policy');
  const schema = [
    buildWebsiteSchema(),
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'AI Policy', item: '/ai-policy' },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'AQPrompts AI Policy',
      description: 'How AQPrompts uses artificial intelligence and AI-generated examples.',
      url: pageUrl,
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <JsonLd data={schema} />
      <Header />
      <main id="main-content">
        <section className="border-b border-slate-200 py-14 dark:border-white/10 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#c2410c]">Transparency</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">AI Policy</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">
              How AQPrompts uses artificial intelligence, AI-generated examples, and third-party AI tools.
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-400">Effective date: September 2026</p>
          </div>
        </section>

        <section className="bg-slate-50 py-12 dark:bg-[#09090f] sm:py-16">
          <div className="mx-auto max-w-4xl space-y-5 px-4 sm:px-6 lg:px-8">
            {sections.map((section, index) => (
              <article key={section.title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#111118] sm:p-8">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]">Policy {index + 1}</p>
                <h2 className="mt-2 text-2xl font-black">{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                  </ul>
                ) : null}
                {section.paragraphsAfter?.map((paragraph) => (
                  <p key={paragraph} className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{paragraph}</p>
                ))}
              </article>
            ))}
            <article className="rounded-2xl border border-[#ff6b35]/25 bg-[#fff4ef] p-6 dark:bg-[#1b1514] sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]">Policy 9</p>
              <h2 className="mt-2 text-2xl font-black">Contact</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
                If you have questions about how AI is used on AQPrompts or about this AI Policy, contact us at{' '}
                <a href="mailto:hello@aqprompts.com" className="font-bold text-[#c2410c] hover:underline">hello@aqprompts.com</a>.
              </p>
              <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
                We aim to keep AQPrompts useful, transparent, and creator-friendly as AI technology continues to develop.
              </p>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
