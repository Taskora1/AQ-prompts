import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, CheckCircle2, Mail } from 'lucide-react';

import Breadcrumb from '@/components/Breadcrumb';
import AuthorArticleExplorer from '@/components/AuthorArticleExplorer';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import NewsletterSignup from '@/components/NewsletterSignup';
import { siteConfig } from '@/config/site';
import { ABDUL_QUDOOS } from '@/lib/author';
import { generatedContent } from '@/generated/posts.generated';
import { getAuthorProfileBySlug, getPublishedBlogPostsByAuthor } from '@/lib/author-profiles-db';
import { buildMetadata } from '@/lib/metadata';
import { absoluteUrl, buildBreadcrumbSchema, buildWebsiteSchema } from '@/lib/seo';

export const revalidate = 86400; // 24h safety net — primary invalidation is on-demand via revalidateBlogContent
export const dynamic = 'force-dynamic';

const tocItems = [
  { label: "Founder's Role", href: '#founders-role' },
  { label: 'Editorial Standards', href: '#editorial-standards' },
  { label: 'Quick Facts', href: '#quick-facts' },
  { label: 'About AQPrompts', href: '#about-aqprompts' },
  { label: 'Editorial Approach', href: '#editorial-approach' },
  { label: 'Areas of Focus', href: '#areas-of-focus' },
  { label: "Founder's Note", href: '#founders-note' },
];

const sectionLinkClass =
  'rounded-sm font-bold text-[#b83a0b] underline-offset-4 transition-colors hover:text-[#8f2d08] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] focus-visible:ring-offset-2 dark:text-[#ff8a5c] dark:hover:text-[#ffad8e]';

export async function generateMetadata() {
  const profile = await getAuthorProfileBySlug(ABDUL_QUDOOS.slug);
  return buildMetadata({
    title: `${profile?.name || ABDUL_QUDOOS.name} – AI Prompt Expert & AQPrompts Founder`,
    description: profile?.bio || 'Meet Abdul Qudoos, AI image prompting founder and editor of AQPrompts. Explore his practical AI prompt guides, editorial standards, and reviewed articles.',
    path: ABDUL_QUDOOS.url,
    image: profile?.avatarUrl || ABDUL_QUDOOS.image,
  });
}

export default async function AbdulQudoosAuthorPage() {
  const storedProfile = await getAuthorProfileBySlug(ABDUL_QUDOOS.slug);
  const author = {
    ...ABDUL_QUDOOS,
    name: storedProfile?.name || ABDUL_QUDOOS.name,
    role: storedProfile?.roleTitle || ABDUL_QUDOOS.role,
    bio: storedProfile?.bio || ABDUL_QUDOOS.bio,
    image: storedProfile?.avatarUrl || ABDUL_QUDOOS.image,
    socialLinks: storedProfile?.socialLinks || ABDUL_QUDOOS.socialLinks,
  };
  const allPosts = Array.isArray(generatedContent.posts) ? generatedContent.posts : [];
  const databasePosts = await getPublishedBlogPostsByAuthor(author);
  const posts = databasePosts.length
    ? databasePosts
    : allPosts.filter(
      (post) => post.authorMeta?.slug === ABDUL_QUDOOS.slug || post.author === author.name || post.author === ABDUL_QUDOOS.name,
    );
  const recentPosts = posts.slice(0, 5);
  const personUrl = absoluteUrl(author.url);
  const personId = `${personUrl}#person`;
  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': personId,
    name: author.name,
    url: personUrl,
    image: absoluteUrl(author.image),
    jobTitle: author.role,
    description: author.bio,
    mainEntityOfPage: personUrl,
    knowsAbout: [
      'AI image prompting',
      'AI portrait prompts',
      'Prompt engineering for generative images',
      'Cinematic AI photography prompts',
      'Prompt editorial review',
    ],
    worksFor: {
      '@type': 'Organization',
      name: 'AQPrompts',
      url: absoluteUrl('/'),
    },
    sameAs: author.socialLinks.map((item) => item.href),
  };
  const articleSchemas = posts.map((post) => ({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    url: absoluteUrl(`/blog/${post.slug}`),
    mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
    ...(post.publishDate ? { datePublished: post.publishDate } : {}),
    ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
    ...(post.coverImage ? { image: absoluteUrl(post.coverImage) } : {}),
    author: { '@id': personId },
    publisher: { '@type': 'Organization', name: 'AQPrompts', url: absoluteUrl('/') },
  }));
  const schema = [
    buildWebsiteSchema(),
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'Authors', item: author.url },
      { name: author.name, item: author.url },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      name: `${author.name} author profile`,
      url: personUrl,
      mainEntity: { '@id': personId },
    },
    personSchema,
    ...articleSchemas,
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <JsonLd data={schema} />
      <Header />
      <main id="main-content">
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Author' }, { label: author.name }]} />
        </div>

        <section className="relative overflow-hidden border-b border-[var(--border)] bg-[radial-gradient(circle_at_top,rgba(255,107,53,0.12),transparent_26%),linear-gradient(180deg,#ffffff_0%,#f9fafb_100%)] py-14 dark:bg-[radial-gradient(circle_at_top,rgba(255,107,53,0.1),transparent_26%),linear-gradient(180deg,#0a0a0f_0%,#111118_100%)] sm:py-20">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 px-4 sm:px-6 md:grid-cols-[300px_minmax(0,1fr)] lg:px-8">
            <div className="card-premium relative self-start overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118]">
              <Image
                src={author.image}
                alt={`${author.name}, Founder and Editor of AQPrompts`}
                width={1134}
                height={1387}
                sizes="(min-width: 768px) 300px, 100vw"
                priority
                className="h-auto w-full object-contain ring-1 ring-slate-100 dark:ring-white/5"
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 rounded-xl border border-white/30 bg-slate-950/85 px-3 py-2.5 text-white shadow-lg backdrop-blur-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ff6b35] text-slate-950">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xs font-black uppercase tracking-[0.12em]">Founder • Editor</span>
                  <span className="block text-[11px] text-slate-200">AQPrompts.com</span>
                </span>
              </div>
            </div>
            <div className="min-w-0 self-center">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Author and editor</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl lg:text-6xl">{author.name}</h1>
              <div className="section-divider ml-0" />
              <p className="mt-3 text-lg font-bold text-[var(--text-primary)]">{author.role}</p>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">{author.bio}</p>
              <div className="mt-5 max-w-2xl space-y-4 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                <p>
                  <strong>Abdul Qudoos is the founder and content reviewer of AQPrompts.com</strong>, a practical AI
                  prompting platform focused on helping creators write clearer, more effective prompts for AI-generated
                  images. He oversees the direction, quality, and editorial review of content published on AQPrompts,
                  including AI image prompt guides, prompt collections, tutorials, and educational resources for creators
                  using tools such as ChatGPT, Midjourney, Leonardo AI, Stable Diffusion, and other generative AI
                  platforms.
                </p>
                <p>
                  His working process starts with a prompt draft, followed by ChatGPT refinement, an image-output
                  check, and a final revision. He reviews subject direction, composition, lighting, clothing, hands,
                  and generated text before a prompt is treated as ready for public use.
                </p>
                <p className="text-sm text-[var(--text-secondary)]">AQPrompts focuses on practical, educational AI image prompting rather than guaranteed results.</p>
                <p>
                  His focus is on making AI prompting easier to understand, more practical to use, and easier to
                  customize for different creative goals. AQPrompts is designed for beginners as well as experienced
                  creators looking for inspiration, better prompt structures, and practical AI image-generation guidance.
                </p>
              </div>
              <p className="mt-4 text-sm text-[var(--text-secondary)]">Last reviewed: August 2026</p>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-5 md:col-span-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <section className="card-premium rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm dark:bg-[#111118]" aria-labelledby="connect-with-abdul">
                <h2 id="connect-with-abdul" className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Connect with Abdul</h2>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <Link
                    href="/contact"
                    className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#ff6b35] px-6 text-sm font-black text-slate-950 shadow-sm transition-all hover:bg-[#e85d28] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] focus-visible:ring-offset-2"
                  >
                    <Mail className="h-5 w-5" aria-hidden="true" />
                    Contact AQPrompts
                  </Link>
                  <p className="text-sm text-[var(--text-secondary)]">
                    <span className="font-semibold">Email:</span>{' '}
                    <a href={`mailto:${siteConfig.email}`} className={sectionLinkClass}>
                      {siteConfig.email}
                    </a>
                  </p>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3" aria-label="Abdul Qudoos social profiles">
                  {author.socialLinks.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Follow Abdul Qudoos on ${item.name}`}
                      className="group inline-flex min-h-12 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#ff6b35] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] focus-visible:ring-offset-2 dark:border-white/15 dark:bg-[#0a0a0f] dark:text-slate-100"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 transition-colors group-hover:bg-orange-50 dark:bg-white/10 dark:group-hover:bg-[#ff6b35]/15">
                        {typeof item.logo === 'string' && item.logo.trim() ? (
                          <Image src={item.logo} alt="" width={20} height={20} aria-hidden="true" />
                        ) : (
                          <span aria-hidden="true">{item.name.slice(0, 1)}</span>
                        )}
                      </span>
                      <span>{item.name}</span>
                    </a>
                  ))}
                </div>
              </section>

              <section className="min-w-0 [&>div]:h-full" aria-labelledby="author-newsletter-heading">
                <h2 id="author-newsletter-heading" className="sr-only">Subscribe to Abdul Qudoos prompt updates</h2>
                <NewsletterSignup variant="author-profile" />
              </section>
            </div>
          </div>
        </section>

        <nav aria-label="On this page" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="card-premium rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm dark:bg-[#111118]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Explore this profile</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {tocItems.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="inline-flex min-h-10 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition-colors hover:border-[#ff6b35] hover:text-[#b83a0b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] focus-visible:ring-offset-2 dark:border-white/20 dark:bg-[#0a0a0f] dark:text-slate-100 dark:hover:border-[#ff8a5c] dark:hover:text-[#ff8a5c] dark:focus-visible:ring-[#ff8a5c]"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <section className="bg-[var(--bg-secondary)] py-14 dark:bg-[#0a0a0f] sm:py-20">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 px-4 sm:px-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:px-8">
            <article className="card-premium min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm dark:bg-[#111118] sm:p-8">
              <h2 id="founders-role" className="scroll-mt-28 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">Founder’s Role at AQPrompts</h2>
              <div className="section-divider ml-0" />
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                As founder, Abdul Qudoos is involved in the planning, development, and review of AQPrompts content. His
                responsibilities include research, editorial review, and ensuring prompts are practical and usable.
              </p>
              <ul className="mt-2 space-y-2">
                <li className="flex gap-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#c2410c]" aria-hidden="true" />
                  <span>Researching useful AI prompt topics and creative trends</span>
                </li>
                <li className="flex gap-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#c2410c]" aria-hidden="true" />
                  <span>Reviewing prompt wording for clarity and usability</span>
                </li>
                <li className="flex gap-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#c2410c]" aria-hidden="true" />
                  <span>Improving prompt structure and visual direction</span>
                </li>
                <li className="flex gap-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#c2410c]" aria-hidden="true" />
                  <span>Creating and reviewing educational AI prompting guides</span>
                </li>
                <li className="flex gap-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#c2410c]" aria-hidden="true" />
                  <span>Updating content when prompting methods or AI tools change</span>
                </li>
                <li className="flex gap-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#c2410c]" aria-hidden="true" />
                  <span>Maintaining realistic expectations about AI-generated results</span>
                </li>
              </ul>
              <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
                Prompts are revised or rejected when they have unclear age or subject direction, conflicting lighting
                instructions, or likely distortions in hands or generated text. These checks support practical,
                reviewable prompt guidance rather than guaranteed output claims.
              </p>
              <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
                Read the <Link href="/editorial-policy" className={sectionLinkClass}>Editorial Policy</Link> and{' '}
                <Link href="/how-we-review-prompts" className={sectionLinkClass}>prompt-review methodology</Link> for more detail on editorial standards.
              </p>
              <div className="mt-6 border-t border-slate-100 pt-6 dark:border-white/6">
                <h2 id="editorial-standards" className="scroll-mt-28 text-xl font-black">Editorial Standards</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Content published or reviewed by Abdul Qudoos follows practical editorial standards designed to keep
                  AQPrompts useful, transparent, and easy to understand.
                </p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li className="flex gap-3 items-start">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#c2410c]" aria-hidden="true" />
                    <span>No guaranteed AI-generated results</span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#c2410c]" aria-hidden="true" />
                    <span>No unsupported professional credentials or awards</span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#c2410c]" aria-hidden="true" />
                    <span>No fabricated testing volumes or client claims</span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#c2410c]" aria-hidden="true" />
                    <span>Outputs may vary by model, settings, and reference inputs</span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#c2410c]" aria-hidden="true" />
                    <span>Practical guidance preferred over keyword-stuffed or repetitive content</span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#c2410c]" aria-hidden="true" />
                    <span>Content is updated when meaningful corrections or improvements are identified</span>
                  </li>
                </ul>

                <h2 id="quick-facts" className="mt-6 scroll-mt-28 text-xl font-black">Quick Facts</h2>
                <dl className="mt-3 grid grid-cols-1 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <div className="grid gap-1 sm:grid-cols-[130px_1fr]">
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">Founder</dt>
                    <dd>Abdul Qudoos</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[130px_1fr]">
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">Role</dt>
                    <dd>Founder &amp; Editor</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[130px_1fr]">
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">Date of birth</dt>
                    <dd>29 October 2006</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[130px_1fr]">
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">Tools personally used</dt>
                    <dd>ChatGPT for prompt drafting and refinement</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[130px_1fr]">
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">Primary focus</dt>
                    <dd>AI image prompting &amp; prompt education</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[130px_1fr]">
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">Content</dt>
                    <dd>Prompt guides, tutorials, collections, troubleshooting</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[130px_1fr]">
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">Review focus</dt>
                    <dd>Clarity, usefulness, customizability, transparency</dd>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[130px_1fr]">
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">Last reviewed</dt>
                    <dd>August 2026</dd>
                  </div>
                </dl>

                <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                  Learn more about AQPrompts’ content standards in the <Link href="/editorial-policy" className={sectionLinkClass}>Editorial Policy</Link> and{' '}
                  <Link href="/how-we-review-prompts" className={sectionLinkClass}>How We Review Prompts</Link> pages.
                </p>
                {recentPosts.length > 0 && (
                  <section aria-labelledby="recent-articles" className="mt-6 border-t border-slate-100 pt-6 dark:border-white/10">
                    <h2 id="recent-articles" className="text-xl font-black">Recent Articles</h2>
                    <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/10">
                      {recentPosts.map((post, index) => (
                        <li key={post.slug} className="py-3 first:pt-0 last:pb-0">
                          <Link
                            href={`/blog/${post.slug}`}
                            className="group block rounded-lg p-2 transition-colors hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] dark:hover:bg-white/5 dark:focus-visible:ring-[#ff8a5c]"
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-black leading-6 text-slate-900 transition-colors group-hover:text-[#b83a0b] dark:text-white dark:group-hover:text-[#ff8a5c]">{post.title}</span>
                              {index === 0 && (
                                <span className="rounded-full bg-[#ff6b35] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-950">
                                  Editor&apos;s Pick
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{post.category} · {post.publishDate}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </article>
            <article className="card-premium min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm dark:bg-[#111118] sm:p-8">
              <BookOpen className="h-9 w-9 text-[#c2410c]" aria-hidden="true" />
              <h2 id="about-aqprompts" className="mt-1 scroll-mt-28 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">About AQPrompts</h2>
              <div className="section-divider ml-0" />
              <div className="text-sm leading-8 text-slate-600 dark:text-slate-300 space-y-8">
                <h3 className="font-bold mt-4">Why AQPrompts Was Created</h3>
                <p>
                  AQPrompts was created to help people who know what kind of image they want to generate but struggle to
                  describe that idea clearly to an AI model. Many prompts fail because they are too vague, overly
                  complicated, or missing important visual details such as lighting, composition, camera perspective,
                  styling, background, or subject direction. AQPrompts provides structured examples and practical guidance
                  to help creators craft stronger prompts and adjust them when results differ from expectations.
                </p>
                <h3 className="font-bold mt-4">How AQPrompts Content Is Reviewed</h3>
                <p>
                  Content is reviewed for clarity, visual direction, customizability, readability, practical value, and
                  responsible presentation. AQPrompts avoids exaggerated or unsupported claims and focuses on useful,
                  actionable guidance for creators.
                </p>
                <h2 id="editorial-approach" className="scroll-mt-28 text-xl font-black">Editorial Approach</h2>
                <p>
                  The editorial team emphasises quality over quantity. Articles include examples, customization tips,
                  common mistakes, troubleshooting guidance, and tool-specific considerations. Content is updated when new
                  information or meaningful improvements are identified.
                </p>
                <h2 id="areas-of-focus" className="scroll-mt-28 text-xl font-black">Areas of Focus</h2>
                <p>
                  Abdul currently focuses on AI portrait prompts, fashion and lifestyle prompts, cinematic photography,
                  social media imagery, lighting and composition, camera-angle instructions, face-reference prompting,
                  prompt customization, and beginner-friendly education for generative AI creators.
                </p>
                <h2 id="founders-note" className="scroll-mt-28 text-xl font-black">Founder’s Note</h2>
                <blockquote className="mt-2 border-l-4 border-[#ff6b35] pl-4 italic text-slate-700 dark:text-slate-300">
                  “AQPrompts was created to make AI image prompting easier to understand and more practical to use. A
                  strong prompt should clearly communicate the image you are trying to create, not simply contain a long
                  list of keywords. My goal is to help creators understand how prompt structure, lighting, composition,
                  styling, and visual direction work together so they can confidently adapt prompts for their own ideas.”
                </blockquote>

                <h3 className="font-bold mt-4">Transparency</h3>
                <p>
                  AI-generated results vary between platforms and model versions. AQPrompts does not guarantee identical
                  results across tools and avoids unsupported claims about qualifications, awards, or testing volumes.
                </p>
                <h3 className="font-bold mt-4">Connect With Abdul Qudoos</h3>
                <p>
                  For editorial questions, corrections, or feedback use the official AQPrompts contact channels or follow
                  the social profiles linked on the site for updates and prompt guides.
                </p>
                <h3 className="font-bold mt-4">Short bio</h3>
                <p className="text-sm">
                  Abdul Qudoos is the founder and content reviewer of AQPrompts.com. He focuses on AI image prompt
                  structure, portrait prompting, visual composition, lighting, prompt customization, and practical
                  educational guides for generative AI creators.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">Articles written or reviewed</h2>
            <div className="section-divider ml-0" />
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              Search Abdul&apos;s AI prompt guides or filter the collection by portrait style.
            </p>
            <AuthorArticleExplorer
              featuredSlug={recentPosts[0]?.slug}
              posts={posts.map((post) => ({
                slug: post.slug,
                title: post.title,
                category: post.category,
                excerpt: post.excerpt,
                publishDate: post.publishDate,
                updatedAt: post.updatedAt,
                coverImage: post.coverImage,
                coverImageAlt: post.coverImageAlt,
              }))}
            />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
