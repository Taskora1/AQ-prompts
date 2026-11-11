import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { ArrowRight, Search, Sparkles } from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { HomeAboutCreator } from '@/components/home/HomeTrustSections';
import PromptFeedCard from '@/components/home/PromptFeedCard';
import JsonLd from '@/components/JsonLd';
import { getCloudinaryResponsiveImage, optimizeCloudinaryUrl } from '@/lib/cloudinary-optimize';
import { PROMPT_BASE_PATH, PROMPT_CATEGORIES } from '@/lib/prompt-constants';
import { AI_GENERATED_DISCLOSURE, getPublicMediaDisclosure } from '@/lib/media-safety';

const HomeFaqSection = dynamic(() => import('@/components/home/HomeFaqSection'), {
  loading: () => null,
});
const NewsletterSignup = dynamic(() => import('@/components/NewsletterSignup'), {
  loading: () => null,
});

const aiTools = [
  { name: 'ChatGPT', href: `${PROMPT_BASE_PATH}?q=ChatGPT#prompts`, detail: 'Text and visual concepts', logo: '/chatgpt-logo.svg' },
  { name: 'Midjourney', href: `${PROMPT_BASE_PATH}?q=Midjourney#prompts`, detail: 'Cinematic and editorial styles', logo: '/Midjourney-logo.svg' },
  { name: 'Leonardo AI', href: `${PROMPT_BASE_PATH}?q=Leonardo#prompts`, detail: 'Realistic portrait generation', logo: '/leonardo_logo.svg' },
  { name: 'Stable Diffusion', href: `${PROMPT_BASE_PATH}?q=Stable Diffusion#prompts`, detail: 'Custom style image prompts', logo: '/stable-diffusion-logo.svg' },
  { name: 'Gemini', href: `${PROMPT_BASE_PATH}?q=Gemini#prompts`, detail: 'Google AI image prompts', logo: '/gemini-logo.webp' },
];

const homepageFaqs = [
  {
    question: 'What is AQPrompts?',
    answer: 'AQPrompts is a prompt library for Instagram creators and AI artists. Browse ready-made image prompts for Midjourney, ChatGPT, Leonardo AI, Gemini, and Stable Diffusion.',
  },
  {
    question: 'Are these prompts free?',
    answer: 'Yes. All prompts in the public AQPrompts library are currently free to browse and copy. VIP membership is paused while we focus on growing the free library.',
  },
  {
    question: 'Which AI tools do these prompts work with?',
    answer: 'Prompt wording can be adapted for Midjourney, ChatGPT, Leonardo AI, Stable Diffusion, and Gemini. Features, syntax, and results vary by tool and model version.',
  },
  {
    question: 'Do I need to create an account?',
    answer: 'No. Free public prompts can be browsed and copied without an account or email. Newsletter signup is optional.',
  },
  {
    question: 'How often are new prompts added?',
    answer: 'We add new prompts regularly across portraits, cinematic, business, celebrations, lifestyle, and photo editing categories.',
  },
  {
    question: 'Can I use these prompts for commercial projects?',
    answer: 'Yes, prompts can be used for personal and commercial AI image generation projects, subject to the terms of the AI tool you use.',
  },
];

const homepageFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: homepageFaqs.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
};

function formatLibraryDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function shortText(value = '', max = 126) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '').replace(/[.,;:\s-]+$/, '')}.`;
}

function latestGuideCards(posts = []) {
  const realPosts = posts.slice(0, 3).map((post) => {
    const image = post.coverImage || post.featuredImage || '';
    return {
      title: post.title,
      description: post.excerpt || post.description || 'Read the latest AQPrompts prompt guide.',
      href: `/blog/${post.slug}`,
      label: post.category || 'AI Prompts',
      image,
      imageAltText: post.featuredImageAltText || '',
      mediaDisclosure: getPublicMediaDisclosure(image, image) || AI_GENERATED_DISCLOSURE,
    };
  });

  const fallbacks = [
    { title: 'How to Write Better AI Image Prompts', description: 'Learn the structure behind clear, realistic, and scroll-stopping AI image prompts.', href: '/tools/ai-image-prompts', label: 'Prompt Library', image: '' },
    { title: 'Instagram Portrait Ideas for Creators', description: 'Explore prompt categories for profile photos, DP edits, portraits, and content visuals.', href: '/tools/ai-image-prompts/men', label: 'Portraits', image: '' },
    { title: 'Photo Editing Prompt Ideas', description: 'Turn ordinary photos into cinematic edits, posters, and creative social media assets.', href: '/tools/ai-image-prompts/photo-editing', label: 'Photo Editing', image: '' },
  ];

  return [...realPosts, ...fallbacks].slice(0, 3);
}

function SectionHeading({ title, description, actionHref, actionLabel, id, inverse = false }) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h2 id={id} className={`text-3xl font-black tracking-normal sm:text-4xl ${inverse ? 'text-white' : 'text-slate-950 dark:text-white'}`}>{title}</h2>
        {description ? <p className={`mt-3 text-lg ${inverse ? 'text-slate-300' : 'text-slate-600 dark:text-slate-300'}`}>{description}</p> : null}
      </div>
      {actionHref ? (
        <Link href={actionHref} className="inline-flex items-center gap-2 text-sm font-black text-[#c2410c]">
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

export default function HomeLanding({
  newlyAddedPrompts = [],
  categoryCards = [],
  posts = [],
  libraryUpdatedAt = '',
}) {
  const freshPrompts = newlyAddedPrompts;
  const guides = latestGuideCards(posts);
  const libraryDateLabel = formatLibraryDate(libraryUpdatedAt);
  const heroImage = freshPrompts.find((prompt) => prompt.image);
  const heroImages = freshPrompts.filter((prompt) => prompt.image).slice(0, 3);
  const popularCategories = ['men', 'women', 'cinematic', 'business', 'lifestyle']
    .map((slug) => PROMPT_CATEGORIES[slug])
    .filter(Boolean);
  const workflows = [
    { ratio: '4:5', label: 'Instagram feed', detail: 'Portrait posts and creator content' },
    { ratio: '1:1', label: 'Square', detail: 'Profile images and square posts' },
    { ratio: '9:16', label: 'Stories and Reels', detail: 'Vertical social content' },
    { ratio: '16:9', label: 'Landscape', detail: 'Wide scenes and banners' },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
      <JsonLd data={homepageFaqSchema} />
      <Header />

      <main id="main-content">
        <section className="relative overflow-hidden border-b border-[#e5e7eb] bg-white text-slate-950 dark:border-white/10 dark:bg-[#0a0a0f] dark:text-white">
          <div className="mx-auto grid max-w-7xl items-center gap-5 px-4 py-7 sm:gap-8 sm:px-6 sm:py-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-8 lg:py-16">
            <div className="min-w-0 text-center lg:text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c2410c] sm:text-xs">
                Ready-to-use creator prompts
              </p>
              <h1 className="mx-auto mt-2.5 max-w-3xl text-[30px] font-bold leading-[1.02] tracking-[-0.055em] text-slate-950 sm:mt-3 sm:text-5xl lg:mx-0 lg:text-6xl dark:text-white">
                ChatGPT Photo Prompts for Creators
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-[15px] leading-[1.55] tracking-[-0.01em] text-slate-600 sm:mt-4 sm:text-lg sm:leading-7 lg:mx-0 dark:text-slate-300">
                Create better AI images with ready-to-use prompts for portraits, fashion, lifestyle, photography and social media.
              </p>

              <form
                action={`${PROMPT_BASE_PATH}#prompts`}
                method="get"
                className="mx-auto mt-5 flex h-14 max-w-2xl items-center gap-3 rounded-2xl border border-slate-200 bg-white p-1.5 pl-4 shadow-[0_12px_36px_rgba(15,23,42,0.12)] focus-within:border-[#c2410c] focus-within:ring-2 focus-within:ring-[#c2410c]/20 sm:mt-6 lg:mx-0 dark:border-white/15 dark:bg-[#111118]"
              >
                <Search className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <label className="sr-only" htmlFor="home-prompt-search">Search AI image prompts</label>
                <input
                  id="home-prompt-search"
                  type="search"
                  name="q"
                  placeholder="Search portraits, fashion, luxury, Instagram..."
                  className="min-w-0 flex-1 bg-transparent text-left text-sm text-slate-950 outline-none placeholder:text-slate-500 dark:text-white dark:placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  aria-label="Search prompts"
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ff6b35] px-4 text-sm font-black text-[#111118] transition hover:bg-[#e85d28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111118] focus-visible:ring-offset-2"
                >
                  <span className="hidden sm:inline">Search</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs sm:mt-4 sm:text-sm lg:justify-start">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Popular:</span>
                {popularCategories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`${PROMPT_BASE_PATH}/${category.slug}`}
                    className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 font-semibold text-slate-700 transition hover:border-[#c2410c] hover:text-[#9a3412] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c] dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:text-[#ffb18d]"
                  >
                    {category.label}
                  </Link>
                ))}
              </div>

              <p className="mt-2 text-[11px] font-medium text-slate-500 sm:mt-3 sm:text-xs dark:text-slate-400">
                Free prompts · No account required
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
              {heroImages.length > 0 ? (
                <div className="relative mx-auto h-[190px] w-full max-w-sm sm:h-[320px] lg:h-[470px]" role="group" aria-label="A glimpse of prompts in the library">
                  {heroImages.map((prompt, index) => {
                    const positions = [
                      'left-[4%] top-[6%] z-10 h-[90%] w-[38%] -rotate-[9deg]',
                      'right-[4%] top-0 z-0 h-[90%] w-[38%] rotate-[8deg]',
                      'left-1/2 top-[8%] z-20 h-[90%] w-[38%] -translate-x-1/2 rotate-[1deg]',
                    ];
                    const responsiveImage = getCloudinaryResponsiveImage(prompt.image, {
                      widths: [160, 200, 240, 320, 360, 480, 640, 720, 800, 960, 1080],
                      quality: 'auto',
                    });
                    const imageSizes = '(max-width: 640px) min(calc(38vw - 12px), 146px), (max-width: 1023px) 219px, min(17vw, 211px)';

                    return (
                      <div
                        key={prompt.slug}
                        className={`absolute overflow-hidden rounded-[18px] border-[5px] border-white bg-white shadow-[0_16px_35px_rgba(15,23,42,0.18)] sm:rounded-[24px] sm:border-[8px] dark:border-[#1c1c24] dark:bg-[#1c1c24] ${positions[index]}`}
                      >
                        <img
                          src={optimizeCloudinaryUrl(prompt.image, { width: 320, quality: 'auto' })}
                          srcSet={responsiveImage?.srcSet}
                          alt={prompt.imageAlt || prompt.title || 'AI image prompt preview'}
                          sizes={imageSizes}
                          // All three hero images are above the fold: load them
                          // eagerly with high priority. The centre (front) card
                          // is the LCP element — it was lazy with no priority,
                          // which added ~1.4s of resource load delay.
                          loading="eager"
                          fetchPriority="high"
                          decoding="async"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-[190px] items-center justify-center text-[#9a3412] sm:h-[320px] lg:h-[470px] dark:text-[#ff9a73]">
                  <Sparkles className="h-12 w-12" aria-hidden="true" />
                </div>
              )}
              <p className="mt-2 text-left text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                {heroImage?.image ? getPublicMediaDisclosure(heroImage.image, heroImage.image) || AI_GENERATED_DISCLOSURE : AI_GENERATED_DISCLOSURE}
              </p>
            </div>
          </div>
        </section>

        <section id="newly-added-prompts" className="scroll-mt-24 bg-white py-8 text-slate-950 dark:bg-[#0a0a0f] dark:text-white sm:py-12">
          <div className="mx-auto max-w-7xl px-2.5 sm:px-6 lg:px-8">
            <div className="px-1 sm:px-0">
              <SectionHeading title="Fresh AI Image Prompts" description="Discover fresh, ready-to-use prompts for your next AI image." />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-7 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-4">
              {freshPrompts.map((prompt) => (
                <PromptFeedCard
                  key={`fresh-${prompt.slug}`}
                  title={prompt.title || ''}
                  image={prompt.image || ''}
                  imageAlt={prompt.imageAlt || ''}
                  slug={prompt.slug || ''}
                  promptText={prompt.prompt || ''}
                  uniformAspectRatio
                />
              ))}
            </div>
            <div className="mt-5 text-center sm:mt-7">
              <Link
                href={PROMPT_BASE_PATH}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-300 px-5 text-sm font-bold text-slate-900 transition hover:border-[#c2410c] hover:text-[#9a3412] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/20 dark:text-white dark:hover:border-[#ff9a73] dark:hover:text-[#ffb18d] dark:focus-visible:ring-[#ff9a73] dark:focus-visible:ring-offset-[#0a0a0f]"
              >
                Explore All Prompts <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section id="categories" className="scroll-mt-24 bg-white py-10 sm:py-16 dark:bg-[#0a0a0f]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading title="Explore Prompt Categories" description="Choose a collection to find prompts for your next image." actionHref="/categories" actionLabel="View all categories" />
            <div className="mt-6 columns-2 gap-2 sm:gap-3 md:columns-3 lg:columns-4 lg:gap-4">
              {categoryCards.filter((category) => category.count > 0).map((category) => (
                <PromptFeedCard
                  key={category.slug}
                  title={category.label}
                  image={category.image || ''}
                  imageAlt={category.imageAlt || category.label}
                  href={`${PROMPT_BASE_PATH}/${category.slug}`}
                  subtitle={`${category.count} ${category.count === 1 ? 'prompt' : 'prompts'}`}
                />
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="home-ai-tools-heading" className="bg-white py-10 sm:py-16 dark:bg-[#0a0a0f]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="home-ai-tools-heading"
              title="Browse Prompts by AI Tool"
              description="Pick your tool to see prompts that work with it."
            />
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
              {aiTools.map((tool) => (
                <Link
                  key={tool.name}
                  href={tool.href}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#c2410c] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c] focus-visible:ring-offset-2 dark:border-white/10 dark:bg-[#0a0a0f]"
                >
                  <img src={tool.logo} alt={`${tool.name} logo`} loading="lazy" className="h-10 w-10 object-contain" />
                  <span className="mt-3 block text-sm font-black text-slate-950 dark:text-white">{tool.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">{tool.detail}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="chatgpt-photo-prompts-heading" className="bg-[#fff7f2] py-10 dark:bg-[#111118] sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="chatgpt-photo-prompts-heading"
              title="ChatGPT Photo Prompt Guides"
              description="Explore practical photo prompts, outfit edits, and image-editing ideas."
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Link href="/blog/chatgpt-prompts-for-photos" className="rounded-xl border border-orange-100 bg-white p-4 text-sm font-bold text-slate-900 hover:border-orange-400 dark:border-white/10 dark:bg-[#0a0a0f] dark:text-white">
                ChatGPT prompts for photos
              </Link>
              <Link href="/blog/chatgpt-photo-dress-change-prompt-15-copy-paste-ai-outfit-prompts" className="rounded-xl border border-orange-100 bg-white p-4 text-sm font-bold text-slate-900 hover:border-orange-400 dark:border-white/10 dark:bg-[#0a0a0f] dark:text-white">
                ChatGPT photo dress-change prompts
              </Link>
              <Link href={`${PROMPT_BASE_PATH}/photo-editing`} className="rounded-xl border border-orange-100 bg-white p-4 text-sm font-bold text-slate-900 hover:border-orange-400 dark:border-white/10 dark:bg-[#0a0a0f] dark:text-white">
                Photo Editing prompts
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="home-workflow-heading" className="border-y border-[#e5e7eb] bg-[#f9fafb] py-10 dark:border-white/10 dark:bg-[#111118] sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="home-workflow-heading"
              title="Made for Your Workflow"
              description="Find the right prompt for the way you create."
            />
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {workflows.map((workflow) => (
                <Link
                  key={workflow.ratio}
                  href={PROMPT_BASE_PATH}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#c2410c] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c] focus-visible:ring-offset-2 dark:border-white/10 dark:bg-[#0a0a0f]"
                >
                  <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-[#ff6b35] px-2 text-sm font-black text-[#111118]">
                    {workflow.ratio}
                  </span>
                  <span className="mt-3 block text-sm font-black text-slate-950 dark:text-white">{workflow.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">{workflow.detail}</span>
                </Link>
              ))}
            </div>
            <p className="mt-5 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
              Choose an aspect ratio before you start creating—each prompt detail page includes ratio options.
            </p>
          </div>
        </section>

        <section className="bg-white py-8 sm:py-10 dark:bg-[#0a0a0f]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading title="Learn Better AI Image Prompting" description="Practical guides to help you write, refine, and use image prompts." actionHref="/blog" actionLabel="View all guides" />
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {guides.map((guide) => (
                <Link key={guide.title} href={guide.href} className="group overflow-hidden rounded-[1.5rem] border border-[#e5e7eb] bg-[#f9fafb] shadow-sm transition hover:-translate-y-1 hover:border-[#ff6b35] hover:shadow-xl dark:border-white/10 dark:bg-[#111118] dark:hover:border-[#ff6b35]/60">
                  {guide.image ? (
                    <>
                      <div className="relative w-full overflow-hidden bg-[#111118]">
                        <Image src={guide.image} alt="" width={1200} height={675} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 382px" quality={70} className="h-auto w-full object-contain transition duration-500 group-hover:scale-[1.03]" />
                      </div>
                      <p className="px-6 pt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        {guide.mediaDisclosure || AI_GENERATED_DISCLOSURE}
                      </p>
                    </>
                  ) : null}
                  <div className="p-6">
                    <span className="rounded-full bg-[#ff6b3520] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#9a3412]">{guide.label}</span>
                    <h3 className="mt-4 text-xl font-black tracking-normal text-slate-950 dark:text-white">{guide.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{shortText(guide.description, 150)}</p>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#9a3412] group-hover:underline dark:text-[#ffb18d]">
                      Read Guide <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <HomeFaqSection items={homepageFaqs} />
        <HomeAboutCreator />
        <NewsletterSignup variant="inline" />
      </main>

      <Footer />
    </div>
  );
}
