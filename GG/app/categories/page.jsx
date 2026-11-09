import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Grid3X3, Sparkles } from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import { buildStaticPageMetadata, buildStaticPageSchema } from '@/lib/metadata';
import { getPromptListingPagePayload, getSlimPromptsByCategory, PROMPT_BASE_PATH, PROMPT_CATEGORIES } from '@/lib/prompts';

export const dynamic = 'force-static';
export const revalidate = false;

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA0MCA1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNTAiIGZpbGw9IiMxMTExMTgiLz48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNTAiIGZpbGw9IiNmZjZiMzUiIG9wYWNpdHk9Ii4xOCIvPjwvc3ZnPg==';

const CATEGORY_CARD_IMAGES = {
  men: '/images/prompt-thumbs/south-asian-male-street-fashion-green.webp',
  women: '/images/prompt-thumbs/black-fitted-knit-dress-outdoor-cafe-autumn.webp',
  couples: '/images/prompt-thumbs/luxury-korean-couple-portrait-engagement-photoshoot-1.webp',
  celebrations: '/images/prompt-thumbs/south-asian-man-birthday-double-exposure.webp',
  business: '/images/prompt-thumbs/corporate-tech-premium-navy-cyan-headshot.webp',
  lifestyle: '/images/prompt-thumbs/elegant-caf-lifestyle-portrait-ai-prompt.webp',
  cinematic: '/images/prompt-thumbs/cinematic-night-portrait-with-golden-rim-light-ai-prompt.webp',
  'photo-editing': '/images/prompt-thumbs/3d-instagram-frame-breakout-fashion-mockup.webp',
};

const CATEGORY_CARD_COPY = {
  men: 'Editorial portraits, streetwear looks, and confident personal-brand visuals for modern creators.',
  women: 'Beauty, fashion, and personal-brand portrait ideas with polished editorial direction.',
  couples: 'Romantic, candid, and cinematic concepts for couple portraits, anniversaries, and travel.',
  celebrations: 'Birthday, festive, graduation, and announcement concepts made for memorable social content.',
  business: 'Executive portraits, personal-brand imagery, and credible visuals for professional profiles.',
  lifestyle: 'Café, travel, city, and everyday portrait ideas for an effortless creator aesthetic.',
  cinematic: 'Atmospheric lighting, dramatic compositions, and film-inspired scenes with visual impact.',
  'photo-editing': 'Creative edits, poster treatments, restorations, and transformations for existing photos.',
};

export function generateMetadata() {
  return buildStaticPageMetadata('categories');
}

export default async function CategoriesPage() {
  const categories = await Promise.all(Object.values(PROMPT_CATEGORIES).map(async (category) => {
    const prompts = await getSlimPromptsByCategory(category.slug);
    const featuredPrompt = prompts.find((prompt) => prompt.image);

    return {
      ...category,
      count: prompts.length,
      image: CATEGORY_CARD_IMAGES[category.slug] || featuredPrompt?.image || '',
      href: `${PROMPT_BASE_PATH}/${category.slug}`,
      cardDescription: CATEGORY_CARD_COPY[category.slug] || category.description,
    };
  }));
  const { totalCount: totalPrompts } = await getPromptListingPagePayload();

  return (
    <>
      <JsonLd data={buildStaticPageSchema('categories')} />
      <Header />
      <main id="main-content" className="min-h-screen bg-white text-slate-950 dark:bg-[#0a0a0f] dark:text-white">
        <section className="relative overflow-hidden border-b border-[#e5e7eb] bg-[radial-gradient(circle_at_top_right,rgba(255,107,53,0.14),transparent_38%),#fff] px-4 py-16 dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_right,rgba(255,107,53,0.12),transparent_38%),#0a0a0f] sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl text-center">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#c2410c]">
              <Sparkles className="mr-2 inline-block h-4 w-4" aria-hidden="true" />
              Curated prompt collections
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
              Find your creative direction
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-[#9ca3af] sm:text-lg">
              Explore professionally curated AI image prompts, organized by subject, mood, and creative goal.
            </p>
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#ff6b35]/20 bg-[#fff4ef] px-4 py-2 text-sm font-bold text-[#c2410c] dark:bg-[#ff6b35]/10 dark:text-[#ff9f74]">
              {categories.length} collections <span className="text-[#c2410c]/40">•</span> {totalPrompts} prompts
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-14 dark:bg-[#0a0a0f] sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category, index) => (
              <Link
                key={category.slug}
                href={category.href}
                aria-label={`View ${category.label} prompts`}
                className="group overflow-hidden rounded-[1.35rem] border border-[#e5e7eb] bg-[#f9fafb] shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1.5 hover:border-[#ff6b35]/70 hover:shadow-[0_26px_90px_rgba(255,107,53,0.16)] dark:border-white/10 dark:bg-[#111118] dark:shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-[#ff6b3520] dark:bg-black/30">
                  {category.image ? (
                    <Image
                      src={category.image}
                      alt={`${category.label} AI prompt category preview`}
                      fill
                      sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, (max-width: 1536px) 28vw, 382px"
                      loading={index === 0 ? undefined : 'lazy'}
                      priority={index === 0}
                      fetchPriority={index === 0 ? 'high' : undefined}
                      quality={70}
                      placeholder="blur"
                      blurDataURL={BLUR_DATA_URL}
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[#c2410c]">
                      <Grid3X3 className="h-12 w-12" aria-hidden="true" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111118]/90 via-[#111118]/15 to-transparent" />
                  <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-[#111118]/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-md">
                    {category.useCase || category.label}
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 text-white">
                    <div>
                      <p className="text-2xl font-black tracking-tight">{category.label}</p>
                      <p className="mt-1 text-xs font-semibold text-white/70">Curated visual prompts</p>
                    </div>
                    <span className="rounded-full bg-[#ff6b35] px-3 py-1.5 text-xs font-black shadow-lg">
                      {category.count}
                    </span>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#c2410c]">{category.count} {category.count === 1 ? 'prompt' : 'prompts'} available</p>
                  <p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-600 dark:text-[#9ca3af]">
                    {category.cardDescription}
                  </p>

                  <span
                    className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff6b35] px-5 text-sm font-black text-white shadow-[0_18px_45px_rgba(255,107,53,0.2)] transition group-hover:bg-[#e85d28]"
                  >
                    View Prompts
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
