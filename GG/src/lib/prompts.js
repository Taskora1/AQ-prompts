import {
  getPromptCategory,
  getPromptCategoryUrl,
  getPromptUrl,
  filterCategoryListingPrompts,
  isIndexablePrompt,
  PROMPT_BASE_PATH,
  PROMPT_CATEGORIES,
  PROMPT_CATEGORY_ALIASES,
  slugifyPrompt,
} from '@/lib/prompt-constants';
import {
  getAllPrompts,
  getPublishedPromptSitemapRows,
  getAllPromptSlugs,
  getCachedPromptBySlug,
  getPromptBySlug,
  getPromptsPayload,
  normalizePrompt,
  getSlimAllPrompts,
  getSlimPromptsForDetail,
  getRandomSlimPrompts,
  getSlimPromptsByIds,
  getSlimPromptsPage,
  getPromptFeedRows,
  getPublishedPromptCategorySlugs,
  getHomepagePromptCards,
  getSlimPromptsPayload,
  getNewsletterWelcomePrompts,
  getPromptListingPagePayload,
} from '@/lib/prompts-db';
import { isBuildPhase } from '@/lib/db';

export { getPromptCategory, getPromptCategoryUrl, getPromptUrl, isIndexablePrompt, PROMPT_BASE_PATH, PROMPT_CATEGORIES, slugifyPrompt };
export { getAllPrompts, getPublishedPromptSitemapRows, getAllPromptSlugs, getCachedPromptBySlug, getPromptBySlug, getPromptsPayload, normalizePrompt, getSlimAllPrompts, getSlimPromptsForDetail, getRandomSlimPrompts, getSlimPromptsByIds, getSlimPromptsPage, getPromptFeedRows, getPublishedPromptCategorySlugs, getHomepagePromptCards, getSlimPromptsPayload, getNewsletterWelcomePrompts, getPromptListingPagePayload };

/**
 * Returns the count of complete published prompts, without applying SEO
 * indexability filtering.
 * This is the single source of truth for the library prompt count
 * displayed on the homepage, about page, and anywhere else.
 */
export async function getPublishedPromptCount() {
  const { totalCount } = await getPromptListingPagePayload();
  return totalCount;
}

/**
 * Returns the number of prompt categories defined in the site configuration.
 * This is the single source of truth for the category count
 * displayed on the about page stats section.
 */
export function getCategoryCount() {
  return Object.keys(PROMPT_CATEGORIES).length;
}

function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

export function promptMatchesCategory(prompt, categorySlug) {
  const category =
    PROMPT_CATEGORIES[categorySlug] ||
    Object.values(PROMPT_CATEGORIES).find((item) => item.slug === categorySlug);
  if (!category) return true;

  const legacyCategorySlugs = {
    men: 'boys',
    women: 'girls',
  };
  const assignedCategorySlugs = Array.isArray(prompt.categorySlugs)
    ? prompt.categorySlugs.map((slug) => cleanText(slug).toLowerCase())
    : [];
  const aliases = PROMPT_CATEGORY_ALIASES[category.slug] || [category.slug];
  const legacyCategoryValues = [
    prompt.primaryCategorySlug,
    prompt.category,
    prompt.useCase,
    ...(Array.isArray(prompt.categories) ? prompt.categories : []),
  ]
    .map((value) => cleanText(value).toLowerCase())
    .filter(Boolean);

  return assignedCategorySlugs.includes(category.slug)
    || assignedCategorySlugs.includes(legacyCategorySlugs[category.slug])
    || aliases.some((alias) => assignedCategorySlugs.includes(alias))
    || aliases.some((alias) => legacyCategoryValues.includes(alias));
}

/**
 * Newest-first sort, direct: createdAt desc, id desc as tiebreak. The live
 * category order (build path: id-ascending rows, reversed in the component)
 * is pure newest-first with no primary/non-primary grouping, and created_at
 * is monotonic with id, so this reproduces that order exactly on both the
 * build and runtime paths — no downstream .reverse() needed.
 */
function sortPromptsNewestFirst(prompts) {
  return [...prompts].sort((first, second) => {
    const firstCreated = Date.parse(first.createdAt || '') || 0;
    const secondCreated = Date.parse(second.createdAt || '') || 0;
    if (secondCreated !== firstCreated) return secondCreated - firstCreated;
    return (Number(second.id) || 0) - (Number(first.id) || 0);
  });
}

/**
 * Category listing fetcher — excludes heavy editorial fields.
 * Use for category listing pages.
 */
export async function getSlimPromptsByCategory(categorySlug) {
  const category =
    PROMPT_CATEGORIES[categorySlug] ||
    Object.values(PROMPT_CATEGORIES).find((item) => item.slug === categorySlug);
  if (isBuildPhase()) {
    const slimPayload = await getSlimPromptsPayload();
    const categoryPrompts = (slimPayload.prompts || [])
      .filter((prompt) => promptMatchesCategory(prompt, categorySlug));
    return sortPromptsNewestFirst(filterCategoryListingPrompts(categoryPrompts));
  }

  const legacyCategorySlugs = { men: 'boys', women: 'girls' };
  const categorySlugs = [...new Set([
    category.slug,
    legacyCategorySlugs[category.slug],
  ].filter(Boolean))];
  // Paginate like the library instead of one LIMIT 1000 fetch: the
  // largest real category is 270 rows (women, 2026-11-11), so a single
  // fetch over-pulls and a fixed cap would silently truncate a category
  // that grows past it. Pages of 100 stop after the real row count, and
  // the loop ends on a short page or once the reported total is reached,
  // so no category can ever be truncated.
  const CATEGORY_RUNTIME_PAGE_SIZE = 100;
  const filteredPrompts = [];
  let offset = 0;
  for (;;) {
    const { prompts: pagePrompts = [], totalCount = 0 } = await getSlimPromptsPage({
      categorySlugs,
      limit: CATEGORY_RUNTIME_PAGE_SIZE,
      offset,
    });
    filteredPrompts.push(...pagePrompts);
    if (pagePrompts.length < CATEGORY_RUNTIME_PAGE_SIZE) break;
    offset += pagePrompts.length;
    if (offset >= totalCount) break;
  }
  const prompts = filterCategoryListingPrompts(filteredPrompts);

  return sortPromptsNewestFirst(prompts);
}

export function getRelatedPrompts(currentPrompt, allPrompts = [], limit = 6) {
  if (!currentPrompt) return [];

  const currentSlug = currentPrompt.slug || slugifyPrompt(currentPrompt.title);
  const manualIds = Array.isArray(currentPrompt.relatedPromptIds)
    ? currentPrompt.relatedPromptIds
    : [];
  let manualPrompts = [];
  if (manualIds.length > 0) {
    const publishedById = new Map(
      allPrompts
        .filter((prompt) => prompt.status !== 'draft' && isIndexablePrompt(prompt))
        .map((prompt) => [Number(prompt.id), prompt]),
    );
    manualPrompts = manualIds
      .map((id) => publishedById.get(Number(id)))
      .filter(
        (prompt) =>
          prompt
          && Number(prompt.id) !== Number(currentPrompt.id)
          && (prompt.slug || slugifyPrompt(prompt.title)) !== currentSlug,
      )
      .slice(0, limit);
  }

  if (manualPrompts.length >= limit) return manualPrompts;

  const selectedSlugs = new Set(manualPrompts.map((prompt) => prompt.slug || slugifyPrompt(prompt.title)));
  const currentTags = new Set((currentPrompt.tags || []).map((tag) => tag.toLowerCase()));
  const currentWords = new Set(currentPrompt.title.toLowerCase().split(/\s+/).filter((word) => word.length > 3));

  const additionalPrompts = allPrompts
    .filter(
      (prompt) =>
        isIndexablePrompt(prompt)
        && (prompt.slug || slugifyPrompt(prompt.title)) !== currentSlug,
    )
    .filter((prompt) => !selectedSlugs.has(prompt.slug || slugifyPrompt(prompt.title)))
    .map((prompt) => {
      const sharedTags = (Array.isArray(prompt.tags) ? prompt.tags : [])
        .filter((tag) => currentTags.has(tag.toLowerCase())).length;
      const sharedWords = prompt.title
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => currentWords.has(word)).length;

      let score = sharedTags * 4 + sharedWords;
      if (prompt.useCase === currentPrompt.useCase) score += 8;
      if (prompt.category === currentPrompt.category) score += 4;

      return { ...prompt, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit - manualPrompts.length);

  return [...manualPrompts, ...additionalPrompts];
}

