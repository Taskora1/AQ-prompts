import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Clipboard,
  Layers,
  Sparkles,
  Target,
  Users,
  Wand2,
  Zap,
} from 'lucide-react';

import Footer from '../components/Footer';
import Header from '../components/Header';
import Breadcrumb from '../components/Breadcrumb';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCategoryCount } from '@/lib/prompts';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aqprompts.com';

const missionPoints = [
  'A fully free public prompt library for creators',
  'Written for Midjourney, ChatGPT, Leonardo AI, Stable Diffusion, and Gemini',
  'Organized for Instagram, YouTube, and social media use cases',
  'Designed for creators, brands, and audiences worldwide',
];

const features = [
  {
    icon: Sparkles,
    title: 'Growing Public Library',
    description: `Browse our current AI prompt collection across ${getCategoryCount()} categories and copy free public prompts without an account or email.`,
  },
  {
    icon: Wand2,
    title: '5 AI Tools Covered',
    description: 'Prompt wording can be adapted for Midjourney, ChatGPT, Leonardo AI, Stable Diffusion, and Gemini.',
  },
  {
    icon: Clipboard,
    title: 'One Click Copy',
    description: 'Copy any public prompt instantly without an account, email gate, subscription, or payment.',
  },
  {
    icon: Layers,
    title: 'Multiple Aspect Ratios',
    description: 'Every prompt supports 4:5 Instagram, 1:1 square, 9:16 Reels, and 16:9 landscape formats.',
  },
  {
    icon: Zap,
    title: 'Beginner Friendly',
    description: 'No technical knowledge needed. Each prompt comes with instructions on how to use it.',
  },
  {
    icon: Camera,
    title: 'Global Creator Content',
    description:
      'Prompts designed for diverse creators, visual styles, niches, and international audiences across social platforms.',
  },
];

const whoWeHelp = [
  {
    title: 'Instagram Creators',
    description:
      'Create polished profile pictures, feed posts, Reels covers, and campaign visuals without booking a studio shoot or learning complex prompt engineering.',
  },
  {
    title: 'Fashion Content Creators',
    description:
      'Build editorial-style fashion images, outfit concepts, seasonal shoots, and model portraits using prompts that describe lighting, styling, pose, and composition.',
  },
  {
    title: 'Global Creators',
    description:
      'Find prompts written for creators across different cultures, visual identities, fashion styles, celebrations, modern streetwear, and international content needs.',
  },
  {
    title: 'AI Beginners',
    description:
      'Start creating quickly with copy-paste prompts, clear aspect ratio guidance, and practical use cases for tools like Midjourney, ChatGPT, Leonardo AI, and Gemini.',
  },
  {
    title: 'Content Entrepreneurs',
    description:
      'Produce marketing visuals, personal brand assets, thumbnails, product-style images, and social content faster while keeping a consistent professional look.',
  },
  {
    title: 'Photographers and Designers',
    description:
      'Use prompt ideas for mood boards, client concepts, pre-visualization, visual references, campaign drafts, and creative exploration before production begins.',
  },
];

const promptUses = [
  'Instagram profile pictures and feed posts',
  'YouTube thumbnails and channel art',
  'LinkedIn professional headshots',
  'Eid and celebration greeting posts',
  'Fashion and editorial photography',
  'Product photography and marketing',
  'Cinematic and artistic portraits',
];

const promisePoints = [
  'Adding and revising prompts over time',
  'Reviewing prompt instructions before publishing',
  'Reviewing tool references and compatibility wording',
  'Building a trusted free AI prompt library for creators',
];

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AQPrompts',
  url: siteUrl,
  description:
    'AQPrompts is a free digital AI prompt library for creators, with practical prompts for popular AI image tools.',
};

const aboutPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  name: 'About AQPrompts',
  url: `${siteUrl}/about`,
  description:
    'Learn how AQPrompts builds and reviews a free public prompt library for popular AI image tools.',
  isPartOf: {
    '@type': 'WebSite',
    name: 'AQPrompts',
    url: siteUrl,
  },
  about: organizationSchema,
};

function SectionIntro({ eyebrow, title, children }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow ? (
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">{eyebrow}</p>
      ) : null}
      <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
        {title}
      </h2>
      <div className="section-divider" />
      {children ? (
        <div className="mt-4 text-base leading-7 text-[var(--text-secondary)] sm:text-lg sm:leading-8">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default function AboutPage({ promptCount = 0 }) {
  const promptTotalLabel = promptCount > 0 ? `${promptCount}+` : 'Growing';
  const categoryCount = getCategoryCount();
  const stats = [
    { number: promptTotalLabel, label: 'Public AI Prompts' },
    { number: '5', label: 'AI Tools Covered' },
    { number: String(categoryCount), label: 'Categories' },
    { number: 'Weekly', label: 'Updates' },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([organizationSchema, aboutPageSchema]) }}
      />

      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <Header />

        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'About' }]} />
        </div>

        <main>
          <section className="relative overflow-hidden border-b border-[var(--border)] bg-[radial-gradient(circle_at_top,rgba(255,107,53,0.12),transparent_26%),linear-gradient(180deg,#ffffff_0%,#f9fafb_100%)] py-20 dark:bg-[radial-gradient(circle_at_top,rgba(255,107,53,0.1),transparent_26%),linear-gradient(180deg,#0a0a0f_0%,#111118_100%)]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-4xl text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">About AQPrompts</p>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl lg:text-6xl">
                  About AQPrompts
                </h1>
                <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-[var(--text-secondary)] sm:text-xl sm:leading-9">
                  We believe anyone can create stunning AI visuals without expensive equipment or photography skills.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-4">
                  <Button asChild size="lg" className="btn-premium rounded-full">
                    <Link href="/tools/ai-image-prompts">
                      Browse AI Prompts
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="btn-premium rounded-full">
                    <Link href="/contact">Get in Touch</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="py-14 sm:py-20">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                <div className="mx-auto w-full max-w-md lg:max-w-none">
                  <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118]">
                    <Image
                      src="/images/founder-aqprompts.webp"
                      alt="Abdul Qudoos, founder and editor of AQPrompts"
                      width={900}
                      height={1100}
                      className="aspect-[4/5] w-full object-cover"
                      sizes="(min-width: 1024px) 38vw, (min-width: 640px) 448px, 100vw"
                    />
                  </div>
                </div>
                <div className="space-y-5 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Meet the Creator</p>
                    <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                      Meet the Creator Behind AQPrompts
                    </h2>
                    <div className="section-divider ml-0" />
                  </div>
                  <p>
                    Hi, I&apos;m <Link href="/author/abdul-qudoos" className="font-bold text-primary hover:underline">Abdul Qudoos</Link>. I&apos;m passionate about AI, prompt engineering, and helping creators
                    generate extraordinary results with the perfect prompts. My mission is to make powerful AI prompting
                    simple, practical, and accessible for everyone, from beginners to professionals.
                  </p>
                  <p>
                    I started AQPrompts to give creators a clearer starting point than trial and error. My practical
                    workflow uses ChatGPT to draft and refine a prompt, followed by an image-output check and a final
                    revision. I personally review subject direction, composition, lighting, clothing, hands, and
                    generated text before treating a prompt as ready for public use.
                  </p>
                  <p>
                    Prompts are revised or rejected when the subject or age direction is unclear, lighting instructions
                    conflict, or the prompt is likely to produce distorted hands or text. Results still vary by tool,
                    model version, settings, and reference image, so prompts are presented as adaptable guidance rather
                    than guaranteed results.
                  </p>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Founder: Abdul Qudoos · Born 29 October 2006 · Tool personally used: ChatGPT
                  </p>
                  <p>
                    AQPrompts was created with one simple idea: AI image generation should be accessible to everyone.
                    When AI tools like Midjourney, ChatGPT, and Leonardo AI became popular, most creators struggled
                    with one thing: writing the right prompt.
                  </p>
                  <p>
                    A great AI image starts with a great prompt. But crafting detailed, effective prompts takes time,
                    practice, and technical knowledge that most creators do not have. Lighting, lens language, styling,
                    composition, color grading, and subject direction all matter. A short idea can become a poor result
                    if the prompt does not explain the image clearly.
                  </p>
                  <p>
                    That is why we built AQPrompts as a free public library of ready-to-use AI prompts. Each prompt is
                    written and reviewed to give creators a practical starting point, while results can vary by AI
                    tool, model version, settings, and reference image.
                  </p>
                  <p>
                    Whether you are an Instagram creator, a fashion photographer, a content marketer, or someone just
                    getting started with AI, AQPrompts gives you the tools to create better content, faster.
                  </p>
                  <p>
                    For transparency about publishing decisions, read our{' '}
                    <Link href="/how-we-review-prompts" className="font-bold text-primary hover:underline">prompt-review methodology</Link>{' '}
                    and <Link href="/editorial-policy" className="font-bold text-primary hover:underline">Editorial Policy</Link>.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="py-12 sm:py-16">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
                {stats.map((stat) => (
                  <Card
                    key={stat.label}
                    className="card-premium border-[var(--border)] bg-[var(--bg-card)] text-center shadow-sm dark:bg-[#111118]"
                  >
                    <CardHeader>
                      <CardTitle className="text-3xl text-primary sm:text-4xl">{stat.number}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium text-[var(--text-secondary)]">{stat.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-[var(--bg-secondary)] py-14 sm:py-20 dark:bg-[#0a0a0f]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Our Mission</p>
                  <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                    Our Mission
                  </h2>
                  <div className="section-divider ml-0" />
                  <div className="space-y-5 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                    <p>
                      Our mission is simple: make AI prompt creation accessible through a useful free public library
                      that creators can browse and copy without payment or account friction.
                    </p>
                    <p>
                      We add and revise prompts across portrait, cinematic, business, celebration, fashion, lifestyle,
                      and photo-editing categories. Update timing depends on editorial review and available material.
                    </p>
                  </div>
                </div>
                <Card className="card-premium border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <Target className="h-6 w-6 text-primary" />
                      Every Prompt Is Built To Be Useful
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-4">
                      {missionPoints.map((point) => (
                        <li key={point} className="flex gap-3 text-[var(--text-secondary)]">
                          <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section className="py-14 sm:py-20">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <SectionIntro title="What You Get on AQPrompts">
                <p>
                  AQPrompts is designed to remove friction from AI content creation. Instead of starting with a blank
                  prompt box, you can pick a reviewed idea, choose the right format, and generate visuals for your next
                  post, thumbnail, campaign, or personal brand asset.
                </p>
              </SectionIntro>

              <div className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
                {features.map((feature) => (
                  <Card
                    key={feature.title}
                    className="card-premium border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118]"
                  >
                    <CardHeader>
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <feature.icon className="h-6 w-6" />
                      </div>
                      <CardTitle className="text-xl">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="leading-7 text-[var(--text-secondary)]">{feature.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-[var(--bg-secondary)] py-14 sm:py-20 dark:bg-[#0a0a0f]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <SectionIntro title="Who We Serve">
                <p>
                  AQPrompts serves creators who want to make beautiful, useful content without turning prompt writing
                  into a second job.
                </p>
              </SectionIntro>

              <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
                {whoWeHelp.map((item) => (
                  <Card
                    key={item.title}
                    className="card-premium border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118]"
                  >
                    <CardHeader>
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Users className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-xl">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="leading-7 text-[var(--text-secondary)]">{item.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="py-14 sm:py-20">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-4xl">
                <SectionIntro title="Why AI Prompts Matter">
                  <p>
                    AI image generation has changed content creation forever. Tools like Midjourney, Leonardo AI, and
                    AI image tools can produce portraits and creative visual concepts from written instructions.
                  </p>
                </SectionIntro>

                <div className="mt-8 space-y-5 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                  <p>
                    Prompt wording can influence the subject, composition, styling, and lighting, but it is only one
                    part of the result. Model behavior, settings, safety systems, and reference inputs also matter.
                  </p>
                  <p>
                    AQPrompts gives creators structured starting points they can review and adapt instead of beginning
                    with an empty prompt box. Results still require judgment and may need revision.
                  </p>
                </div>

                <Card className="card-premium mt-8 border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118]">
                  <CardHeader>
                    <CardTitle className="text-xl">Our prompts are used for:</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {promptUses.map((use) => (
                        <div key={use} className="flex gap-3 text-[var(--text-secondary)]">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                          <span>{use}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section className="bg-[var(--bg-secondary)] py-14 sm:py-20 dark:bg-[#0a0a0f]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-4xl text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Our Promise</p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                  Our Promise to You
                </h2>
                <div className="section-divider" />
                <div className="space-y-5 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                  <p>
                    AQPrompts keeps its public prompt library free for creators. Promptshe VIP Creator Club is paused
                    while we focus on expanding the library and building a useful creator audience.
                  </p>
                  <p>
                    We are committed to building a practical digital AI prompt library that creators can trust, revisit,
                    and use without paid-tier pressure. If a membership returns later, its terms will be explained clearly.
                  </p>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {promisePoints.map((point) => (
                    <Card
                      key={point}
                      className="card-premium border-[var(--border)] bg-[var(--bg-card)] text-left shadow-sm dark:bg-[#111118]"
                    >
                      <CardContent className="flex gap-3 pt-6">
                        <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary" />
                        <p className="font-medium leading-7 text-[var(--text-secondary)]">{point}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="mt-10 flex flex-wrap justify-center gap-4">
                  <Button asChild size="lg" className="btn-premium rounded-full">
                    <Link href="/tools/ai-image-prompts">
                      Explore Free Prompts
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="btn-premium rounded-full">
                    <Link href="/contact">Request a Prompt</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
