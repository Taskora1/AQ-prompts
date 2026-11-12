import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  Clock3,
  Lightbulb,
  Sparkles,
  UserRound,
  Wrench,
} from 'lucide-react';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import PromptDetailExperience, { PromptVariationCard } from '@/components/prompts/PromptDetailExperience';
import DailySecretPrompt from '@/components/prompts/DailySecretPrompt';
import PromptListingClient from '@/components/prompts/PromptListingClient';
import PromptIntroContent from '@/components/prompts/PromptIntroContent';
import ImageCarousel from '@/components/ui/ImageCarousel';
import PromptFeedCard from '@/components/home/PromptFeedCard';
import { buildPromptJsonLd, getPromptDisplayTitle } from '@/lib/metadata';
import { formatStableDate } from '@/lib/utils';
import { AI_GENERATED_DISCLOSURE,
  VERIFIED_MEDIA_PLACEHOLDER,
  getPublicMediaDisclosure,
} from '@/lib/media-safety';
import {
  getPromptCategory,
  getPromptCategoryUrl,
  getPromptUrl,
  getRelatedPrompts,
  PROMPT_BASE_PATH,
  PROMPT_CATEGORIES,
} from '@/lib/prompts';
import { PROMPT_CATEGORY_BLOG_LINKS } from '@/lib/prompt-constants';
import { buildBreadcrumbSchema, buildFaqSchema, buildWebsiteSchema } from '@/lib/seo';

const siteUrl = process.env.SITE_URL || 'https://www.aqprompts.com';
const MAIN_PAGE_CARD_LIMIT = 12;
const CATEGORY_PAGE_INITIAL_CARD_LIMIT = 9;
const CATEGORY_SUMMARIES = {
  men: 'Browse men’s portrait prompts, from streetwear looks to professional headshots.',
  women: 'Explore adult women’s portraits, from studio looks to fashion and lifestyle.',
  couples: 'Create couple portraits for celebrations, travel, and cinematic moments.',
  celebrations: 'Find image prompts for birthdays, milestones, invitations, and festive portraits.',
  business: 'Create polished business portraits for profiles, personal brands, and professional content.',
  lifestyle: 'Discover relaxed portraits for cafés, travel, city walks, and everyday scenes.',
  cinematic: 'Build dramatic portraits and story-driven scenes with cinematic prompts.',
  'photo-editing': 'Explore prompts for restoring, retouching, and creatively transforming images.',
};
const categoryNavItems = Object.values(PROMPT_CATEGORIES).slice(0, 8);

export function PromptListingPage({
  prompts = [],
  category = null,
  payload = null,
  totalCount: totalCountOverride = null,
}) {
  const title = category ? category.title : payload?.pageTitle || 'Instagram AI Image Prompt Library';
  const fullDescription =
    category?.description || payload?.pageDescription ||
    'Browse free Instagram-focused AI image prompts for portraits, reels thumbnails, carousel covers, and creator content.';
  const description = category
    ? CATEGORY_SUMMARIES[category.slug] || String(fullDescription).split(/[.!?](?:\s|$)/, 1)[0].trim() + '.'
    : fullDescription;
  const initialCardLimit = category?.slug === 'business' ? MAIN_PAGE_CARD_LIMIT : category ? CATEGORY_PAGE_INITIAL_CARD_LIMIT : MAIN_PAGE_CARD_LIMIT;
  // Prompts already arrive newest-first: category pages from
  // getSlimPromptsByCategory and the library page from
  // getPromptListingPagePayload (id DESC). No .reverse() here — the order
  // must not depend on a second inversion cancelling out the first.
  const orderedPrompts = [...prompts];
  // Render-level pagination: only the initial slice is serialized into the page
  // for hydration; "Load more" and search fetch additional data from the
  // lightweight paginated API routes (/api/prompts/page, /api/prompts/search).
  const initialPrompts = orderedPrompts.slice(0, initialCardLimit);
  const totalCount = Number.isSafeInteger(totalCountOverride)
    ? totalCountOverride
    : orderedPrompts.length;
  const pagePath = category ? `${PROMPT_BASE_PATH}/${category.slug}` : PROMPT_BASE_PATH;
  const schema = [
    buildWebsiteSchema(),
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'AI Prompts', item: PROMPT_BASE_PATH },
      ...(category ? [{ name: category.label, item: pagePath }] : []),
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description: fullDescription,
      url: `${siteUrl}${pagePath}`,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: orderedPrompts.slice(0, 24).map((prompt, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${siteUrl}${getPromptUrl(prompt)}`,
          name: prompt.title,
        })),
      },
    },
  ];

  return (
    <>
      <JsonLd data={schema} />
      <Header />
      <main id="main-content" className="min-h-screen bg-[var(--bg-secondary)]">
        <section className="border-b border-transparent bg-[var(--bg-primary)] py-8 sm:py-10 dark:border-white/10 dark:bg-[#14151d]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <nav className="mb-4 flex min-w-0 flex-wrap gap-2 text-xs text-[var(--text-secondary)] sm:mb-5 sm:text-sm">
              <Link href="/" className="hover:text-[#c2410c]">Home</Link>
              <span>/</span>
              <Link href={PROMPT_BASE_PATH} className="hover:text-[#c2410c]">AI Prompts</Link>
              {category && <span>/</span>}
              {category && <span className="text-[var(--text-primary)]">{category.label}</span>}
            </nav>
            <div className="max-w-3xl">
              <p className="inline-flex rounded-full border border-[#c2410c]/15 bg-[#ff6b35]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#c2410c] dark:border-[#ff6b35]/20 dark:text-[#ff9a73]">Free AI prompt library</p>
              <h1 className="mt-3 break-words text-[2rem] font-bold leading-[1.08] tracking-tight text-[var(--text-primary)] sm:text-5xl">{title}</h1>
              <p className="mt-4 text-base leading-7 text-[var(--text-secondary)] sm:mt-5 sm:text-lg sm:leading-8">{description}</p>
            </div>
          </div>
        </section>
        <PromptListingClient
          prompts={initialPrompts}
          activeCategory={category?.slug || null}
          initialVisibleCount={initialCardLimit}
          totalCount={totalCount}
          enableSort={!category}
        />
        {category && category.slug !== 'business' && PROMPT_CATEGORY_BLOG_LINKS[category.slug] ? (
          <section className="bg-[var(--bg-primary)] px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">From the blog</h2>
              <Link
                href={PROMPT_CATEGORY_BLOG_LINKS[category.slug].href}
                className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#c2410c] hover:underline"
              >
                {PROMPT_CATEGORY_BLOG_LINKS[category.slug].label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>
        ) : null}
        {category ? (
          <section className="bg-[var(--bg-primary)] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="mx-auto max-w-7xl">
              <details className="group rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 sm:px-5">
                <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--text-primary)] marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] [&::-webkit-details-marker]:hidden">
                  About {category.label} prompts
                  <span className="ml-2 text-xs font-medium text-[var(--text-secondary)] group-open:hidden">Read more</span>
                  <span className="ml-2 hidden text-xs font-medium text-[var(--text-secondary)] group-open:inline">Show less</span>
                </summary>
                <div className="mt-4 max-w-3xl space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
                  <p>{fullDescription}</p>
                  {category.intro ? <p>{category.intro}</p> : null}
                  {category.slug === 'business' ? (
                    <>
                      <h2 className="pt-2 text-base font-bold text-[var(--text-primary)]">Choosing a credible business portrait</h2>
                      <p>
                        This collection includes {totalCount} prompts for adult professional portraits, office scenes, personal-brand concepts, and polished profile imagery. Adapt the wardrobe, setting, crop, and lighting to the image’s real purpose. Generated imagery should not fabricate a job title, employer, client, award, qualification, or endorsement; use a current real photograph when identity or professional claims need verification.
                      </p>
                      <h2 className="pt-2 text-base font-bold text-[var(--text-primary)]">Business portrait guides</h2>
                      <ul className="list-inside list-disc space-y-1">
                        <li><Link href="/blog/luxury-businessman-ai-portrait-prompts" className="font-semibold text-[#c2410c] hover:underline">Business portrait prompts for adult men</Link></li>
                        <li><Link href="/blog/luxury-mens-fashion-ai-portrait-prompts" className="font-semibold text-[#c2410c] hover:underline">Professional fashion portrait guidance</Link></li>
                        <li><Link href="/how-we-review-prompts" className="font-semibold text-[#c2410c] hover:underline">How AQPrompts reviews prompt wording</Link></li>
                      </ul>
                    </>
                  ) : null}
                </div>
              </details>
            </div>
          </section>
        ) : null}
        <section className="bg-[var(--bg-primary)] py-10 sm:py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold text-[var(--text-primary)] sm:text-2xl">Browse prompt collections</h2>
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-5 sm:gap-3">
              {Object.values(PROMPT_CATEGORIES).map((item) => (
                <Link key={item.slug} href={`${PROMPT_BASE_PATH}/${item.slug}`} className="max-w-full rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-center text-xs font-semibold leading-5 text-[var(--text-primary)] hover:border-[#ff6b35] sm:px-4 sm:text-sm">{item.label} prompts</Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

export function PromptDetailPageServer({ prompt, allPrompts }) {
  const publicCategory = getPromptCategory(prompt);
  const categoryBlogLink = publicCategory
    ? PROMPT_CATEGORY_BLOG_LINKS[publicCategory.slug]
    : null;
  const categoryUrl = publicCategory ? `${PROMPT_BASE_PATH}/${publicCategory.slug}` : getPromptCategoryUrl(prompt);
  const categoryLabel = publicCategory?.label || prompt.category || 'Prompt Library';
  const allCategories = Array.isArray(prompt.categories) && prompt.categories.length > 0
    ? prompt.categories
    : [prompt.category || prompt.useCase || 'Prompt Library'].filter(Boolean);
  const promptCategorySlugs = new Set([
    prompt.primaryCategorySlug,
    ...(Array.isArray(prompt.categorySlugs) ? prompt.categorySlugs : []),
    publicCategory?.slug,
  ].filter(Boolean).map((slug) => String(slug).toLowerCase()));
  const promptCategoryNames = new Set([
    prompt.category,
    ...(Array.isArray(prompt.categories) ? prompt.categories : []),
  ].filter(Boolean).map((name) => String(name).toLowerCase()));
  const sameCategoryPrompts = allPrompts.filter((candidate) => {
    if (candidate.slug === prompt.slug) return false;
    const candidateSlugs = [
      candidate.primaryCategorySlug,
      ...(Array.isArray(candidate.categorySlugs) ? candidate.categorySlugs : []),
      getPromptCategory(candidate)?.slug,
    ].filter(Boolean).map((slug) => String(slug).toLowerCase());
    if (promptCategorySlugs.size > 0 && candidateSlugs.length > 0) {
      return candidateSlugs.some((slug) => promptCategorySlugs.has(slug));
    }
    const candidateNames = [
      candidate.category,
      ...(Array.isArray(candidate.categories) ? candidate.categories : []),
    ].filter(Boolean).map((name) => String(name).toLowerCase());
    return candidateNames.some((name) => promptCategoryNames.has(name));
  });
  const relatedPrompts = getRelatedPrompts(prompt, sameCategoryPrompts, 9);
  const configuredSecretSlug = String(process.env.NEXT_PUBLIC_SECRET_PROMPT_SLUG || '').trim();
  const secretCandidate = allPrompts.find((item) => item.isSecretPrompt)
    || (prompt.isSecretPrompt ? prompt : null)
    || (configuredSecretSlug ? allPrompts.find((item) => item.slug === configuredSecretSlug) : null);
  const tags = Array.isArray(prompt.tags) ? prompt.tags : [];
  const displayTags = tags.map((tag) => String(tag || '').trim()).filter(Boolean);
  const cleanTitle = String(prompt.title || '').replace(/\s*AI Prompt$/i, '');
  const description = prompt.uniqueFeature || 'Copy this ready-to-use AI prompt and generate polished creator visuals in your favorite AI tool.';
  const displayTitle = getPromptDisplayTitle(prompt);
  const schema = [...buildPromptJsonLd(prompt), buildFaqSchema(prompt.faqs)].filter(Boolean);
  const previewImages = Array.isArray(prompt.images) && prompt.images.length > 0 ? prompt.images : [prompt.image || '/images/placeholder.webp'];
  const previewImage = previewImages[0] || '/images/placeholder.webp';
  // No manual preload here: the carousel <img> below renders with
  // fetchPriority="high" and a srcSet, so React already preloads it with the
  // right size for the viewport. A hardcoded 800w preload only forced a
  // second, oversized download on mobile (the browser fetched both the 800w
  // preload and the srcSet pick).
  const mediaContext = [prompt.slug, prompt.title, prompt.prompt, prompt.intro, ...(prompt.tags || [])].filter(Boolean).join(' ');
  const mediaDisclosure = previewImage === VERIFIED_MEDIA_PLACEHOLDER
    ? 'The original example is withheld because it requires additional safety or rights review.'
    : getPublicMediaDisclosure(previewImage, mediaContext) || AI_GENERATED_DISCLOSURE;

  return (
    <>
      <JsonLd data={schema} />
      <Header />
      <main id="main-content" className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#fff7f2_0%,_#f8f9fc_36rem,_#f5f6fa_100%)] pb-28 text-[#111118] dark:bg-[radial-gradient(ellipse_at_top,_#17120f_0%,_#0a0a0f_34rem,_#09090d_100%)] dark:text-white">

        {/* ══════ BREADCRUMBS ══════ */}
        <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Link href="/" className="transition-colors hover:text-orange-600 dark:hover:text-orange-300">Home</Link>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">/</span>
              <Link href={PROMPT_BASE_PATH} className="transition-colors hover:text-orange-600 dark:hover:text-orange-300">AI Prompts</Link>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">/</span>
              <Link href={categoryUrl} className="transition-colors hover:text-orange-600 dark:hover:text-orange-300">{categoryLabel}</Link>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">/</span>
              <span className="max-w-[13rem] truncate font-semibold text-slate-800 dark:text-slate-100 sm:max-w-xs" aria-current="page">{prompt.title}</span>
            </nav>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
                By Abdul Qudoos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
                Published {formatStableDate(prompt.createdAt || prompt.date)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
                Updated {formatStableDate(prompt.updatedAt || prompt.createdAt || prompt.date)}
              </span>
              {prompt.reviewedAt ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Reviewed
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* ══════ HERO (prompt summary and full prompt) ══════ */}
        <PromptDetailExperience
          promptText={prompt.prompt}
          tags={tags}
          promptId={prompt.slug}
          reviewPromptId={prompt.id}
          title={displayTitle}
          description={description}
          category={categoryLabel}
          categoryUrl={categoryUrl}
          allCategories={allCategories}
          useCase={prompt.useCase || ''}
          uniqueFeature={prompt.uniqueFeature || ''}
          defaultAspectRatio={prompt.recommendedAspectRatio || '4:5'}
          recommendedAspectRatio={prompt.recommendedAspectRatio || ''}
          aspectRatioReason={prompt.aspectRatioReason || ''}
          hasCustomHowToSteps={prompt.howToUse.length > 0}
        >
          <ImageCarousel
            images={previewImages}
            alt={prompt.imageAltTexts?.['0'] || prompt.imageAltTexts?.[0] || `${prompt.title} AI prompt example`}
            imageAltTexts={prompt.imageAltTexts}
            priority={true}
            imageWidth={800}
            responsiveMaxWidth={800}
            showIndicators={false}
            sizes="(max-width: 640px) 80vw, (max-width: 1023px) 560px, 520px"
            quality={70}
            className="relative mx-auto aspect-[4/5] w-full max-w-[560px] overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-[#f9fafb] shadow-sm dark:border-white/[0.08] dark:bg-[#111118]"
            imageClassName="h-full w-full object-cover"
          />
          <p className="px-0 py-2 text-center text-[12px] leading-5 text-[#9ca3af] dark:text-[#6b7280]">
            {mediaDisclosure}
          </p>
        </PromptDetailExperience>

        {prompt.intro ? (
          <section className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
            <div className="overflow-hidden rounded-[26px] border border-orange-100/80 bg-white/90 shadow-[0_22px_70px_rgba(27,31,42,0.07)] ring-1 ring-white/80 dark:border-white/[0.09] dark:bg-[#111118]/90 dark:ring-white/[0.03]">
              <div className="relative overflow-hidden bg-[linear-gradient(110deg,#fff7f2_0%,#fff_60%,#fffaf7_100%)] px-6 py-7 dark:bg-[linear-gradient(110deg,rgba(255,107,53,0.09),rgba(17,17,24,0.92)_58%,rgba(17,17,24,0.98))] sm:px-9 sm:py-8 lg:px-12">
                <div className="pointer-events-none absolute -right-8 -top-24 h-64 w-64 rounded-full bg-orange-200/30 blur-3xl dark:bg-orange-500/[0.08]" aria-hidden="true" />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-300">
                      Prompt breakdown
                    </p>
                    <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-3xl lg:text-4xl">
                      About this {cleanTitle} AI prompt
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                      The idea, details, and creative choices behind this image prompt.
                    </p>
                    {displayTags.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {displayTags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full border border-orange-200/80 bg-white/80 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="border-t border-orange-100/80 px-6 py-7 dark:border-white/[0.08] sm:px-9 sm:py-9 lg:px-12 lg:py-10">
                <div className="mx-auto w-full max-w-5xl">
                  <PromptIntroContent intro={prompt.intro} />
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {(prompt.customizationTips.length > 0
          || prompt.variations.length > 0
          || prompt.howToUse.length > 0
          || prompt.faqs.length > 0) ? (
          <section className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <div className="grid gap-3 md:grid-cols-2">
            {prompt.howToUse.length > 0 ? (
              <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_12px_35px_rgba(27,31,42,0.05)] dark:border-white/[0.08] dark:bg-[#111118]/90">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-xl font-black text-slate-950 dark:text-white">How to use this prompt</h2>
                <ol className="mt-4 space-y-3">
                  {prompt.howToUse.map((step, index) => (
                    <li key={`${index}-${step}`} className="flex gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-extrabold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">{index + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {prompt.customizationTips.length > 0 ? (
              <div className="rounded-[22px] border border-emerald-100 bg-[linear-gradient(145deg,#f3fbf7,#fff)] p-6 shadow-[0_12px_35px_rgba(27,31,42,0.04)] dark:border-emerald-500/15 dark:bg-[linear-gradient(145deg,rgba(16,185,129,0.08),rgba(17,17,24,0.9))]">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <Lightbulb className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-xl font-black text-slate-950 dark:text-white">Practical tips</h2>
                <ul className="mt-4 space-y-3">
                  {prompt.customizationTips.map((tip, index) => (
                    <li key={`${index}-${tip}`} className="flex gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      {String(tip).split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) => (
                        part.startsWith('**') && part.endsWith('**')
                          ? <strong key={partIndex} className="font-bold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>
                          : part
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {prompt.variations.length > 0 ? (
              <div className="md:col-span-2">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">Make it yours</p>
                    <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Prompt variations</h2>
                  </div>
                  <span className="hidden text-xs font-medium text-slate-500 dark:text-slate-400 sm:inline">{prompt.variations.length} creative options</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {prompt.variations.map((variation, index) => (
                    <PromptVariationCard key={`${variation.label}-${index}`} variation={variation} promptId={prompt.id} />
                  ))}
                </div>
              </div>
            ) : null}

            {prompt.faqs.length > 0 ? (
              <div className="md:col-span-2">
                <div className="mb-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Good to know</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Frequently asked questions</h2>
                </div>
                <div className="grid gap-2.5 md:grid-cols-2">
                  {prompt.faqs.map((faq, index) => (
                    <details key={`${index}-${faq.question}`} className="group rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm transition hover:border-orange-200 dark:border-white/[0.08] dark:bg-[#111118]/90 dark:hover:border-orange-500/25">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-bold text-slate-900 marker:hidden dark:text-white">
                        {faq.question}
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-open:rotate-45 dark:bg-white/[0.06] dark:text-slate-300">+</span>
                      </summary>
                      <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-7 text-slate-600 dark:border-white/[0.08] dark:text-slate-300">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            ) : null}
            </div>
          </section>
        ) : null}

        {/* ══════ TAGS ══════ */}
        {displayTags.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.025] sm:flex sm:items-center sm:gap-6">
              <div className="mb-3 shrink-0 sm:mb-0">
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Prompt themes</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Style, subject &amp; mood</p>
              </div>
              <div className="flex flex-wrap gap-2">
              {displayTags.map((tag) => (
                <span key={tag} className="rounded-full border border-orange-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-300">#{tag}</span>
              ))}
              </div>
            </div>
          </section>
        )}

        {/* ══════ FAQ ══════ */}

        {/* ══════ EXPLORE MORE AI IMAGE PROMPTS ══════ */}
        <section className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="rounded-[26px] border border-orange-100/80 bg-[linear-gradient(135deg,#fff7f2_0%,#fff_70%)] p-5 dark:border-white/[0.08] dark:bg-[linear-gradient(135deg,rgba(255,107,53,0.07),rgba(17,17,24,0.96)_70%)] sm:p-7">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-300">Keep exploring</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Find your next creative idea</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">Browse prompt collections made for portraits, creative edits, and everyday inspiration.</p>
              </div>
              <Link href={PROMPT_BASE_PATH} className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-orange-600 dark:bg-white dark:text-slate-950 dark:hover:bg-orange-400">
                Browse all prompts
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {categoryNavItems.map((item) => (
                <Link key={item.slug} href={`${PROMPT_BASE_PATH}/${item.slug}`}
                  className="rounded-full border border-slate-200 bg-white/85 px-3.5 py-2 text-xs font-semibold text-slate-600 transition-all hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-orange-500/40 dark:hover:bg-orange-500/10 dark:hover:text-orange-200">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ GENERATION TESTED BADGE ══════ */}
        {(prompt.generationTested && prompt.generationTestedDate) ? (
          <section className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-50 px-3 py-1.5 text-[12px] text-[#6b7280] dark:border-green-500/20 dark:bg-green-500/5 dark:text-[#9ca3af]">
              <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
              Generation tested{prompt.generationTestedTool ? `: ${prompt.generationTestedTool}` : ''}{' — '}{prompt.generationTestedDate}
            </div>
          </section>
        ) : null}

        {/* ══════ RELATED PROMPTS ══════ */}
        <DailySecretPrompt
          promptSlug={prompt.slug}
          secretPrompt={secretCandidate ? { slug: secretCandidate.slug, title: secretCandidate.title } : null}
          discoveryPrompts={relatedPrompts.map((item) => ({ slug: item.slug, title: item.title }))}
        />
        {relatedPrompts.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-300">More like this</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Related prompts</h2>
              </div>
              <Link href={categoryUrl} className="hidden items-center gap-1 text-sm font-bold text-orange-700 transition hover:gap-2 dark:text-orange-300 sm:inline-flex">
                View collection <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 [&_article]:mb-0">
              {relatedPrompts.map((related) => (
                <PromptFeedCard
                  key={related.slug}
                  title={related.title || ''}
                  image={related.image || related.images?.[0] || ''}
                  imageAlt={related.imageAlt || related.imageAltTexts?.['0'] || related.imageAltTexts?.[0] || related.title || ''}
                  slug={related.slug || ''}
                  promptText={related.prompt || ''}
                  mobileTitleBelow
                  uniformAspectRatio
                />
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href={PROMPT_BASE_PATH} className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#ff6b35]/60 bg-[#fff4ef] px-6 text-sm font-bold text-[#c2410c] transition-all duration-200 hover:bg-[#ff6b35] hover:text-white hover:shadow-[0_8px_24px_rgba(255,107,53,0.3)] dark:bg-[#ff6b35]/10 dark:hover:bg-[#ff6b35]">
                View All Prompts
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
          </section>
        )}
        {categoryBlogLink ? (
          <section className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              From the blog:{' '}
              <Link href={categoryBlogLink.href} className="font-semibold text-orange-700 hover:underline dark:text-orange-300">
                {categoryBlogLink.label}
              </Link>
            </p>
          </section>
        ) : null}

      </main>
      <Footer />
    </>
  );
}
