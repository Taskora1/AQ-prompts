// CJS-interop-safe React import. Plain-Node scripts (e.g. scripts/build-content.mjs
// in prebuild) import this module outside webpack, where `react` resolves as
// CommonJS and a named import throws:
//   SyntaxError: Named export 'cache' not found. The requested module 'react' is a
//   CommonJS module...
// Default-import + destructure works in both runtimes. Outside the Next/React
// runtime we degrade to a no-op passthrough: build scripts just call the function,
// and per-request dedupe only matters when React is driving renders anyway.
import reactPackage from 'react';

import { getPgPool, isBuildPhase } from './db.js';
import {
  AUDITED_EXISTING_NOINDEX_PROMPT_SLUGS,
  CRITICALLY_THIN_PROMPT_SLUGS,
  GROUP_B_LOW_VALUE_PROMPT_SLUGS,
  GSC_CLICK_EXCEPTION_PROMPT_SLUGS,
  REQUESTED_NOINDEX_PROMPT_SLUGS,
} from './content-indexing-policy.js';
import {
  getCategoryMatchValues,
  isIndexablePrompt,
  PROMPT_CATEGORIES,
  slugifyPrompt,
} from './prompt-constants.js';
import { resolvePromptImagePath } from './prompt-images.js';
import { getSafePublicMediaList, getSafePublicMediaSource } from './media-safety.js';
import {
  isPreviewEnvironment,
  PREVIEW_SYNTHETIC_PROMPT,
} from './preview-prompt-fixture.js';

const reactDefault = reactPackage?.default ?? reactPackage;
const cache = typeof reactDefault?.cache === 'function'
  ? reactDefault.cache
  : (fn) => fn;

const PROMPTS_PAGE_TITLE = 'Instagram AI Image Prompt Library';
const PROMPTS_PAGE_DESCRIPTION =
  'Browse free AI image prompts for portraits, fashion, cinematic edits, and creator content.';
const PROMPTS_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPayloadPromise;
let cachedPayloadAt = 0;
let cachedHomepagePromptDataPromise = null;
let cachedHomepagePromptDataAt = 0;
function cleanText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function cleanPublicPromptText(value = '') {
  return cleanText(value)
    .replace(/\bSouth Asian man in his late teens \(16-18 years old\)/gi, 'South Asian young adult man')
    .replace(/\blate teens \(16-18 years old\)/gi, 'young adult')
    .replace(/\bBMW M4\b/gi, 'unbranded silver sports sedan')
    .replace(/\bNike sneakers\b/gi, 'unbranded sneakers')
    .replace(/\bDisney(?:-Pixar)?(?: inspired)?\b/gi, 'family-friendly 3D animation')
    .replace(/\bPixar(?:-style| style| quality)?\b/gi, 'stylized 3D animation')
    .replace(/\bDreamWorks(?: quality)?\b/gi, 'feature-animation')
    .replace(/\bNetflix(?:-style)?\b/gi, 'streaming-drama')
    .replace(/\bVogue(?:-style| style)?\b/gi, 'fashion editorial')
    .replace(/\bGQ(?:-style| style)?\b/gi, 'menswear editorial')
    .replace(/\bForbes(?:-style| style)?\b/gi, 'business editorial')
    .replace(/\bTEDx\b/gi, 'conference')
    .replace(/\b8K(?: resolution)?\b/gi, 'high-resolution')
    .replace(/\bmasterpiece\b/gi, 'carefully composed image')
    .replace(/\baward-winning\b/gi, 'detailed')
    .replace(/\bprofessional-grade\b/gi, 'polished')
    .replace(/\b100%\s+consistency\b/gi, 'visual continuity')
    .replace(/\bmaximum\s+(?:identity\s+)?(?:accuracy|consistency)\b/gi, 'strong visual continuity')
    .replace(/\bperfect anatomy\b/gi, 'coherent anatomy')
    .replace(/\bperfect hands\b/gi, 'coherent hands')
    .replace(/\bperfect eye focus\b/gi, 'clear eye focus')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPublicEditorialText(value = '') {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => cleanPublicPromptText(line))
    .join('\n')
    .trim();
}

export function containsMinorSubjectReference(item = {}) {
  const text = [
    item.title,
    item.slug,
    item.prompt,
    item.intro,
    item.useCase,
    item.category,
    ...(Array.isArray(item.categories) ? item.categories : []),
    ...(Array.isArray(item.tags) ? item.tags : []),
  ]
    .join(' ')
    .toLowerCase();

  return /\b(?:teen|teenager|teens|minor|child|children|infant|newborn|boy|girl)\b/.test(text)
    || /\b(?:16|17)\s*[-–to]\s*18\b/.test(text)
    || /\b(?:16|17)\s*[-–]?\s*year[-\s]?old\b/.test(text)
    || /\bunder\s+(?:18|eighteen)\b/.test(text);
}

function cleanArray(value) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function cleanFaqs(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((faq) => ({
      question: cleanText(faq?.question),
      answer: cleanText(faq?.answer),
    }))
    .filter((faq) => faq.question && faq.answer);
}

function cleanVariations(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((variation) => ({
      label: cleanText(variation?.label),
      text: cleanText(variation?.text),
    }))
    .filter((variation) => variation.label && variation.text);
}

function cleanPromptBreakdown(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const promptBreakdown = {
    core_technique: cleanText(value.core_technique),
    recommended_base_models: cleanText(value.recommended_base_models),
    suggested_negative_prompt: cleanText(value.suggested_negative_prompt),
    tested_variation_notes: cleanText(value.tested_variation_notes),
  };

  return Object.values(promptBreakdown).some(Boolean) ? promptBreakdown : null;
}

function cleanPromptSpecificTroubleshooting(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => ({
      issue: cleanText(entry?.issue),
      why_it_happens: cleanText(entry?.why_it_happens),
      fix: cleanText(entry?.fix),
    }))
    .filter((entry) => entry.issue || entry.why_it_happens || entry.fix);
}

const VALID_ASPECT_RATIOS = new Set(['4:5', '1:1', '9:16', '16:9']);

function cleanCustomizationTips(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((tip) => cleanText(tip))
    .filter((tip) => tip.length > 0)
    .slice(0, 4);
}

function cleanAspectRatio(value) {
  const normalized = cleanText(value);
  return VALID_ASPECT_RATIOS.has(normalized) ? normalized : '';
}

function cleanIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
}

export function normalizePrompt(
  item = {},
  { suppressUnverifiedMedia = false, resolveLegacyMedia = false } = {},
) {
  const title = cleanPublicPromptText(item.title);
  const tags = cleanArray(item.tags).map(cleanPublicPromptText);
  const rawCategories = [
    ...(Array.isArray(item.category) ? item.category : [item.category]),
    ...cleanArray(item.categories),
  ];
  const categories = [...new Set(rawCategories.map(cleanText).filter(Boolean))];
  const images = [
    ...cleanArray(item.images),
    cleanText(item.image),
  ].filter(Boolean);
  const uniqueImages = [...new Set(images)];
  const resolvedImages = resolveLegacyMedia
    ? [...new Set(uniqueImages.map(resolvePromptImagePath).filter(Boolean))]
    : uniqueImages;
  const mediaContext = [
    item.slug,
    item.title,
    item.prompt,
    item.intro,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].filter(Boolean).join(' ');
  const publicImages = suppressUnverifiedMedia
    ? getSafePublicMediaList(resolvedImages, mediaContext)
    : resolvedImages;
  const ogImage = resolveLegacyMedia
    ? resolvePromptImagePath(item.ogImage)
    : cleanText(item.ogImage);

  return {
    id: Number(item.id) || null,
    title,
    slug: cleanText(item.slug) || slugifyPrompt(title),
    libraryType: item.libraryType === 'text' ? 'text' : 'photo',
    isSecretPrompt: item.isSecretPrompt === true || item.is_secret_prompt === true,
    prompt: cleanPublicPromptText(item.prompt),
    image: publicImages[0] || getSafePublicMediaSource(item.image, mediaContext),
    images: publicImages,
    imageAlt: cleanText(
      item.imageAlt
        || item.imageAltTexts?.['0']
        || item.imageAltTexts?.[0],
    ),
    tags,
    faqs: cleanFaqs(item.faqs),
    variations: cleanVariations(item.variations),
    recommendedTool: cleanText(item.recommendedTool),
    toolNote: cleanText(item.toolNote),
    howToUse: cleanArray(item.howToUse),
    tools: cleanArray(Array.isArray(item.tools) ? item.tools : String(item.tools ?? '').split(',')),
    status: item.status === 'draft' ? 'draft' : 'published',
    primaryCategoryId: Number(item.primaryCategoryId) || null,
    primaryCategorySlug: cleanText(item.primaryCategorySlug).toLowerCase(),
    categoryIds: cleanIdArray(item.categoryIds),
    categorySlugs: cleanArray(item.categorySlugs).map((slug) => slug.toLowerCase()),
    categories,
    useCase: cleanText(item.useCase || item.category),
    category: categories[0] || cleanText(item.category || item.useCase),
    intro: cleanPublicEditorialText(item.intro),
    createdAt: cleanText(item.createdAt),
    date: cleanText(item.date),
    updatedAt: cleanText(item.updatedAt),
    seoTitle: cleanPublicPromptText(item.seoTitle),
    seoDescription: cleanPublicPromptText(item.seoDescription),
    metaTitle: cleanPublicPromptText(item.metaTitle),
    metaDescription: cleanPublicPromptText(item.metaDescription),
    ogImage: suppressUnverifiedMedia
      ? getSafePublicMediaSource(ogImage || publicImages[0], mediaContext)
      : ogImage,
    relatedPromptIds: cleanIdArray(item.relatedPromptIds),
    promptBreakdown: cleanPromptBreakdown(item.promptBreakdown),
    promptSpecificTroubleshooting: cleanPromptSpecificTroubleshooting(
      item.promptSpecificTroubleshooting,
    ),
    uniqueFeature: cleanPublicPromptText(item.uniqueFeature),
    bestUseCase: cleanPublicPromptText(item.bestUseCase),
    customizationTips: cleanCustomizationTips(item.customizationTips),
    recommendedAspectRatio: cleanAspectRatio(item.recommendedAspectRatio),
    aspectRatioReason: cleanPublicPromptText(item.aspectRatioReason),
    reviewedAt: cleanText(item.reviewedAt),
    generationTested: Boolean(item.generationTested),
    generationTestedDate: cleanText(item.generationTestedDate),
    generationTestedTool: cleanText(item.generationTestedTool),
    imageAltTexts: item.imageAltTexts && typeof item.imageAltTexts === 'object' && !Array.isArray(item.imageAltTexts)
      ? Object.fromEntries(
          Object.entries(item.imageAltTexts)
            .map(([key, value]) => [key, cleanText(value)])
        )
      : {},
  };
}

async function queryPromptRows() {
  const db = getPgPool();
  const result = await db.query({ text: `
    SELECT
      p.id,
      p.title,
      p.prompt,
      p.slug,
      p.image,
      p.images,
      COALESCE(primary_category.name, p.category) AS category,
      COALESCE(assigned_categories.names, p.categories, '[]'::jsonb) AS categories,
      p.use_case AS "useCase",
      p.tags,
      p.faqs,
      p.customization_tips AS "customizationTips",
      p.status,
      p.primary_category_id AS "primaryCategoryId",
      primary_category.slug AS "primaryCategorySlug",
      COALESCE(assigned_categories.ids, '[]'::jsonb) AS "categoryIds",
      COALESCE(assigned_categories.slugs, '[]'::jsonb) AS "categorySlugs",
      p.meta_title AS "metaTitle",
      p.meta_description AS "metaDescription",
      p.og_image AS "ogImage",
      p.related_prompt_ids AS "relatedPromptIds",
      p.created_at::text AS "createdAt",
      p.intro,
      p.unique_feature AS "uniqueFeature",
      p.updated_at::text AS "updatedAt",
      p.recommended_aspect_ratio AS "recommendedAspectRatio",
      p.aspect_ratio_reason AS "aspectRatioReason",
      p.reviewed_at::text AS "reviewedAt",
      p.generation_tested AS "generationTested",
      p.generation_tested_date::text AS "generationTestedDate",
      p.generation_tested_tool AS "generationTestedTool",
      p.image_alt_texts AS "imageAltTexts",
      p.variations,
      p.recommended_tool AS "recommendedTool",
      p.tool_note AS "toolNote",
      p.how_to_use AS "howToUse",
      p.tools
    FROM prompts p
    LEFT JOIN categories primary_category
      ON primary_category.id = p.primary_category_id
    LEFT JOIN LATERAL (
      SELECT
        JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names,
        JSONB_AGG(c.id ORDER BY pc.position, c.id) AS ids,
        JSONB_AGG(c.slug ORDER BY pc.position, c.id) AS slugs
      FROM prompt_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.prompt_id = p.id
    ) assigned_categories ON true
    WHERE p.status = 'published'
      AND p.library_type = 'photo'
    ORDER BY p.id
  ` });

  const prompts = result.rows
    .map((row) => normalizePrompt(row, {
      suppressUnverifiedMedia: false,
      resolveLegacyMedia: true,
    }))
    .filter((prompt) => prompt.title && prompt.prompt && !containsMinorSubjectReference(prompt));

  return prompts.length || !isPreviewEnvironment()
    ? prompts
    : [normalizePrompt(PREVIEW_SYNTHETIC_PROMPT, { resolveLegacyMedia: true })];
}

/**
 * Slim query — selects columns needed for listing pages.
 * Omits heavy editorial JSONB fields: faqs, promptBreakdown,
 * promptSpecificTroubleshooting, customizationTips, relatedPromptIds,
 * imageAltTexts, and SEO fields (metaTitle, metaDescription, ogImage,
 * seoTitle, seoDescription).
 * Keeps prompt (needed for copy) and intro (needed for card descriptions).
 * ~40% smaller payload per row than the full query.
 */
async function queryPromptRowsSlim({
  randomLimit = null,
  categorySlugs = [],
  search = '',
  limit = null,
  offset = 0,
  includeTotal = false,
  sort = 'latest',
  randomSeed = null,
} = {}) {
  const db = getPgPool();
  const values = [];
  const conditions = ["p.status = 'published'", "p.library_type = 'photo'"];

  if (categorySlugs.length > 0) {
    values.push(categorySlugs);
    const categoryParam = `$${values.length}`;
    conditions.push(`(
      primary_category.slug = ANY(${categoryParam}::text[])
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(assigned_categories.slugs, '[]'::jsonb)) AS assigned_slug(slug)
        WHERE assigned_slug.slug = ANY(${categoryParam}::text[])
      )
    )`);
  }

  if (search) {
    values.push(`%${search}%`);
    const searchParam = `$${values.length}`;
    conditions.push(`(
      p.title ILIKE ${searchParam}
      OR p.prompt ILIKE ${searchParam}
      OR p.use_case ILIKE ${searchParam}
      OR p.category ILIKE ${searchParam}
      OR p.tags::text ILIKE ${searchParam}
      OR p.categories::text ILIKE ${searchParam}
    )`);
  }

  let orderClause = 'ORDER BY p.id';
  if (randomLimit) {
    values.push(randomLimit);
    orderClause = `ORDER BY RANDOM() LIMIT $${values.length}`;
  } else if (limit !== null) {
    let orderExpression = 'p.created_at DESC NULLS LAST, p.id DESC';
    if (sort === 'random' && Number.isSafeInteger(randomSeed)) {
      values.push(randomSeed);
      orderExpression = `md5(p.id::text || ':' || $${values.length}::text)`;
    }
    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(Math.max(0, Number(offset) || 0));
    const offsetParam = `$${values.length}`;
    orderClause = `ORDER BY ${orderExpression} LIMIT ${limitParam} OFFSET ${offsetParam}`;
  }

  const totalColumn = includeTotal ? ', COUNT(*) OVER()::int AS "totalCount"' : '';
  const result = await db.query({ text: `
    SELECT
      p.id,
      p.title,
      p.prompt,
      p.slug,
      p.image,
      p.images,
      p.image_alt_texts ->> '0' AS "imageAlt",
      COALESCE(primary_category.name, p.category) AS category,
      COALESCE(assigned_categories.names, p.categories, '[]'::jsonb) AS categories,
      p.use_case AS "useCase",
      p.tags,
      p.status,
      p.primary_category_id AS "primaryCategoryId",
      primary_category.slug AS "primaryCategorySlug",
      COALESCE(assigned_categories.ids, '[]'::jsonb) AS "categoryIds",
      COALESCE(assigned_categories.slugs, '[]'::jsonb) AS "categorySlugs",
      p.created_at::text AS "createdAt",
      p.intro,
      p.updated_at::text AS "updatedAt"
      ${totalColumn}
    FROM prompts p
    LEFT JOIN categories primary_category
      ON primary_category.id = p.primary_category_id
    LEFT JOIN LATERAL (
      SELECT
        JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names,
        JSONB_AGG(c.id ORDER BY pc.position, c.id) AS ids,
        JSONB_AGG(c.slug ORDER BY pc.position, c.id) AS slugs
      FROM prompt_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.prompt_id = p.id
    ) assigned_categories ON true
    WHERE ${conditions.join(' AND ')}
    ${orderClause}
  `, values });

  const prompts = result.rows
    .map((row) => ({
      ...normalizePromptSlim(row, {
      suppressUnverifiedMedia: false,
      resolveLegacyMedia: true,
      }),
      totalCount: Number(row.totalCount || 0),
    }))
    .filter((prompt) => prompt.title && prompt.prompt);

  if (prompts.length || !isPreviewEnvironment() || Number(offset) > 0) return prompts;

  const fallback = normalizePromptSlim(PREVIEW_SYNTHETIC_PROMPT, {
    resolveLegacyMedia: true,
  });
  const normalizedSearch = cleanText(search).toLowerCase();
  const searchableText = [
    fallback.title,
    fallback.prompt,
    fallback.category,
    fallback.useCase,
    ...fallback.tags,
  ].join(' ').toLowerCase();
  const matchesCategory = categorySlugs.length === 0
    || categorySlugs.includes(fallback.primaryCategorySlug)
    || categorySlugs.some((slug) => fallback.categorySlugs.includes(slug));

  if (
    !matchesCategory
    || (normalizedSearch && !searchableText.includes(normalizedSearch))
    || (limit !== null && Number(limit) < 1)
  ) {
    return prompts;
  }

  return [{ ...fallback, totalCount: 1 }];
}

async function loadNewsletterWelcomePrompts() {
  const result = await getPgPool().query(`
    SELECT p.title, p.prompt, p.intro
    FROM prompts p
    WHERE p.status = 'published'
      AND p.library_type = 'photo'
      AND BTRIM(REGEXP_REPLACE(COALESCE(p.title, ''), '[[:space:]]+', ' ', 'g')) <> ''
      AND BTRIM(REGEXP_REPLACE(COALESCE(p.prompt, ''), '[[:space:]]+', ' ', 'g')) <> ''
    ORDER BY p.id
    LIMIT 5
  `);

  const prompts = result.rows
    .map((row) => normalizePromptSlim(row, { resolveLegacyMedia: true }))
    .filter((prompt) => prompt.title && prompt.prompt)
    .map(({ title, prompt, intro, bestUseCase }) => ({
      title,
      prompt,
      intro,
      bestUseCase,
    }));

  if (prompts.length || !isPreviewEnvironment()) return prompts;

  const fallback = normalizePromptSlim(PREVIEW_SYNTHETIC_PROMPT, {
    resolveLegacyMedia: true,
  });
  return fallback.title && fallback.prompt
    ? [{
        title: fallback.title,
        prompt: fallback.prompt,
        intro: fallback.intro,
        bestUseCase: fallback.bestUseCase,
      }]
    : [];
}

export async function getNewsletterWelcomePrompts() {
  const now = Date.now();
  if (
    cachedNewsletterWelcomePromptsPromise
    && now - cachedNewsletterWelcomePromptsAt < SLIM_CACHE_TTL_MS
  ) {
    return cachedNewsletterWelcomePromptsPromise;
  }

  cachedNewsletterWelcomePromptsAt = now;
  cachedNewsletterWelcomePromptsPromise = loadNewsletterWelcomePrompts()
    .catch((error) => {
      cachedNewsletterWelcomePromptsPromise = null;
      cachedNewsletterWelcomePromptsAt = 0;
      throw error;
    });
  return cachedNewsletterWelcomePromptsPromise;
}

export async function getRandomSlimPrompts(count = 5) {
  const safeCount = Math.min(Math.max(Number(count) || 5, 1), 20);
  const rows = await queryPromptRowsSlim({ randomLimit: safeCount });
  return rows;
}

export async function getSlimPromptsPage({
  categorySlugs = [],
  search = '',
  limit = 12,
  offset = 0,
  sort = 'latest',
  randomSeed = null,
} = {}) {
  const prompts = await queryPromptRowsSlim({
    categorySlugs,
    search: cleanText(search),
    limit: Math.min(Math.max(Number(limit) || 12, 1), 1000),
    offset,
    includeTotal: true,
    sort,
    randomSeed,
  });

  return {
    prompts: prompts.map(({ totalCount, ...prompt }) => prompt),
    totalCount: prompts[0]?.totalCount || 0,
  };
}

export async function getSlimPromptsByIds(ids = []) {
  const normalizedIds = [...new Set(ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (normalizedIds.length === 0) return [];

  const result = await getPgPool().query({
    text: `
      SELECT
        p.id,
        p.title,
        p.prompt,
        p.slug,
        p.image,
        p.images,
        p.image_alt_texts ->> '0' AS "imageAlt",
        COALESCE(primary_category.name, p.category) AS category,
        COALESCE(assigned_categories.names, p.categories, '[]'::jsonb) AS categories,
        p.use_case AS "useCase",
        p.tags,
        p.status,
        p.primary_category_id AS "primaryCategoryId",
        primary_category.slug AS "primaryCategorySlug",
        COALESCE(assigned_categories.ids, '[]'::jsonb) AS "categoryIds",
        COALESCE(assigned_categories.slugs, '[]'::jsonb) AS "categorySlugs",
        p.created_at::text AS "createdAt",
        p.intro,
        p.updated_at::text AS "updatedAt"
      FROM prompts p
      LEFT JOIN categories primary_category ON primary_category.id = p.primary_category_id
      LEFT JOIN LATERAL (
        SELECT
          JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names,
          JSONB_AGG(c.id ORDER BY pc.position, c.id) AS ids,
          JSONB_AGG(c.slug ORDER BY pc.position, c.id) AS slugs
        FROM prompt_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.prompt_id = p.id
      ) assigned_categories ON true
      WHERE p.status = 'published'
        AND p.library_type = 'photo'
        AND p.id = ANY($1::bigint[])
    `,
    values: [normalizedIds],
  });

  return result.rows
    .map((row) => normalizePromptSlim(row, {
      suppressUnverifiedMedia: false,
      resolveLegacyMedia: true,
    }))
    .filter((prompt) => prompt.title && prompt.prompt);
}

export async function getTrendingPromptsByIds(ids = []) {
  const normalizedIds = [...new Set(ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (normalizedIds.length === 0) return [];

  const result = await getPgPool().query({
    text: `
      SELECT
        p.id,
        p.title,
        p.slug,
        LEFT(
          REGEXP_REPLACE(
            COALESCE(
              NULLIF(BTRIM(REGEXP_REPLACE(p.intro, '\\s+', ' ', 'g')), ''),
              p.prompt
            ),
            '\\s+',
            ' ',
            'g'
          ),
          2048
        ) AS "descriptionSource",
        p.image,
        p.images,
        p.image_alt_texts ->> '0' AS "imageAlt",
        COALESCE(primary_category.name, p.category) AS category,
        COALESCE(assigned_categories.names, p.categories, '[]'::jsonb) AS categories,
        p.use_case AS "useCase",
        p.created_at::text AS "createdAt"
      FROM prompts p
      LEFT JOIN categories primary_category
        ON primary_category.id = p.primary_category_id
      LEFT JOIN LATERAL (
        SELECT JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names
        FROM prompt_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.prompt_id = p.id
      ) assigned_categories ON true
      WHERE p.status = 'published'
        AND p.library_type = 'photo'
        AND p.id = ANY($1::bigint[])
    `,
    values: [normalizedIds],
  });

  return result.rows
    .map((row) => normalizePromptSlim({
      ...row,
      intro: row.descriptionSource,
      prompt: '',
    }, {
      suppressUnverifiedMedia: false,
      resolveLegacyMedia: true,
    }))
    .filter((prompt) => prompt.title);
}

async function loadPromptFeedRows() {
  const result = await getPgPool().query(`
    SELECT
      p.title,
      p.slug,
      p.prompt,
      p.image,
      p.tags,
      p.image_alt_texts ->> '0' AS "imageAlt",
      p.category,
      p.use_case AS "useCase",
      p.intro,
      p.updated_at::text AS "updatedAt"
    FROM prompts p
    WHERE p.status = 'published'
      AND p.library_type = 'photo'
      AND p.title IS NOT NULL
      AND p.slug IS NOT NULL
    ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
    LIMIT 100
  `);

  return result.rows.map((row) => ({
    title: cleanPublicPromptText(row.title),
    slug: cleanText(row.slug),
    prompt: cleanPublicPromptText(row.prompt),
    image: cleanText(row.image),
    imageAlt: cleanText(row.imageAlt),
    tags: cleanArray(row.tags).map(cleanPublicPromptText),
    category: cleanText(row.category || row.useCase),
    intro: cleanPublicPromptText(row.intro),
    updatedAt: cleanText(row.updatedAt),
  }));
}

export async function getPromptFeedRows() {
  const now = Date.now();
  if (
    cachedPromptFeedRowsPromise
    && now - cachedPromptFeedRowsAt < PROMPT_FEED_CACHE_TTL_MS
  ) {
    return cachedPromptFeedRowsPromise;
  }

  cachedPromptFeedRowsAt = now;
  const request = loadPromptFeedRows();
  const cachedRequest = request.catch((error) => {
    if (cachedPromptFeedRowsPromise === cachedRequest) {
      cachedPromptFeedRowsPromise = null;
      cachedPromptFeedRowsAt = 0;
    }
    throw error;
  });
  cachedPromptFeedRowsPromise = cachedRequest;
  return cachedRequest;
}

export function clearPromptFeedRowsCache() {
  cachedPromptFeedRowsPromise = null;
  cachedPromptFeedRowsAt = 0;
}

export async function getPublishedPromptCategorySlugs() {
  const result = await getPgPool().query(`
    SELECT DISTINCT category_slug
    FROM (
      SELECT primary_category.slug AS category_slug
      FROM prompts p
      JOIN categories primary_category ON primary_category.id = p.primary_category_id
      WHERE p.status = 'published'
        AND p.library_type = 'photo'
      UNION
      SELECT jsonb_array_elements_text(COALESCE(cats.slugs, '[]'::jsonb)) AS category_slug
      FROM prompts p
      LEFT JOIN LATERAL (
        SELECT JSONB_AGG(c.slug) AS slugs
        FROM prompt_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.prompt_id = p.id
      ) cats ON true
      WHERE p.status = 'published'
        AND p.library_type = 'photo'
    ) category_rows
    WHERE category_slug IS NOT NULL
    ORDER BY category_slug
  `);

  return result.rows.map((row) => row.category_slug).filter(Boolean);
}

/**
 * Slim normalizer — same as normalizePrompt but omits large text fields.
 */
export function normalizePromptSlim(
  item = {},
  { suppressUnverifiedMedia = false, resolveLegacyMedia = false } = {},
) {
  const title = cleanPublicPromptText(item.title);
  const tags = cleanArray(item.tags).map(cleanPublicPromptText);
  const rawCategories = [
    ...(Array.isArray(item.category) ? item.category : [item.category]),
    ...cleanArray(item.categories),
  ];
  const categories = [...new Set(rawCategories.map(cleanText).filter(Boolean))];
  const images = [
    ...cleanArray(item.images),
    cleanText(item.image),
  ].filter(Boolean);
  const uniqueImages = [...new Set(images)];
  const resolvedImages = resolveLegacyMedia
    ? [...new Set(uniqueImages.map(resolvePromptImagePath).filter(Boolean))]
    : uniqueImages;
  const publicImages = suppressUnverifiedMedia
    ? getSafePublicMediaList(resolvedImages, '')
    : resolvedImages;

  return {
    id: Number(item.id) || null,
    title,
    slug: cleanText(item.slug) || slugifyPrompt(title),
    libraryType: item.libraryType === 'text' ? 'text' : 'photo',
    isSecretPrompt: item.isSecretPrompt === true || item.is_secret_prompt === true,
    prompt: cleanPublicPromptText(item.prompt),
    image: publicImages[0] || '',
    images: publicImages,
    imageAlt: cleanText(
      item.imageAlt
        || item.imageAltTexts?.['0']
        || item.imageAltTexts?.[0],
    ),
    tags,
    faqs: [],
    status: item.status === 'draft' ? 'draft' : 'published',
    primaryCategoryId: Number(item.primaryCategoryId) || null,
    primaryCategorySlug: cleanText(item.primaryCategorySlug).toLowerCase(),
    categoryIds: cleanIdArray(item.categoryIds),
    categorySlugs: cleanArray(item.categorySlugs).map((slug) => slug.toLowerCase()),
    categories,
    useCase: cleanText(item.useCase || item.category),
    category: categories[0] || cleanText(item.category || item.useCase),
    intro: cleanPublicPromptText(item.intro),
    createdAt: cleanText(item.createdAt),
    date: cleanText(item.date || item.createdAt),
    updatedAt: cleanText(item.updatedAt),
    seoTitle: '',
    seoDescription: '',
    metaTitle: '',
    metaDescription: '',
    ogImage: '',
    relatedPromptIds: [],
    promptBreakdown: null,
    promptSpecificTroubleshooting: [],
    uniqueFeature: '',
    bestUseCase: '',
    customizationTips: [],
    recommendedAspectRatio: '',
    aspectRatioReason: '',
    reviewedAt: '',
    generationTested: false,
    generationTestedDate: '',
    generationTestedTool: '',
    imageAltTexts: {},
  };
}

async function loadPromptsPayload() {
  const prompts = await queryPromptRows();
  const updatedAt = prompts.reduce((latest, prompt) => {
    if (!prompt.updatedAt) return latest;
    return !latest || Date.parse(prompt.updatedAt) > Date.parse(latest)
      ? prompt.updatedAt
      : latest;
  }, '');

  return {
    success: true,
    updatedAt,
    pageTitle: PROMPTS_PAGE_TITLE,
    pageDescription: PROMPTS_PAGE_DESCRIPTION,
    prompts,
  };
}

export async function getPromptsPayload() {
  const now = Date.now();
  if (cachedPayloadPromise && now - cachedPayloadAt < PROMPTS_CACHE_TTL_MS) {
    return cachedPayloadPromise;
  }

  cachedPayloadAt = now;
  cachedPayloadPromise = loadPromptsPayload()
    .then((payload) => payload)
    .catch((error) => {
      cachedPayloadPromise = undefined;
      cachedPayloadAt = 0;
      throw error;
    });

  return cachedPayloadPromise;
}

export function clearPromptsCache() {
  cachedPayloadPromise = undefined;
  cachedPayloadAt = 0;
  cachedSlimPayloadPromise = null;
  cachedSlimPayloadAt = 0;
  cachedNewsletterWelcomePromptsPromise = null;
  cachedNewsletterWelcomePromptsAt = 0;
  cachedPromptListingPagePromise = null;
  cachedPromptListingPageAt = 0;
  cachedPublicPromptDirectoryPromise = null;
  cachedPublicPromptDirectoryAt = 0;
  cachedHomepagePromptDataPromise = null;
  cachedHomepagePromptDataAt = 0;
  clearPromptSlugsCache();
  clearPromptFeedRowsCache();
  return undefined;
}

export async function getAllPrompts() {
  return (await getPromptsPayload()).prompts;
}

export function getPromptEligibilityFlags(item = {}) {
  const directoryPrompt = normalizePromptSlim(item, { resolveLegacyMedia: true });
  return { isPublicEligible: isIndexablePrompt(directoryPrompt) };
}

export function isSitemapEligiblePrompt(item = {}) {
  const prompt = normalizePrompt({
    ...item,
    category: undefined,
  }, { resolveLegacyMedia: true });
  return Boolean(
    prompt.slug
    && prompt.title
    && prompt.prompt
    && !containsMinorSubjectReference(prompt)
  );
}

export async function getPublishedPromptSitemapRows() {
  const result = await getPgPool().query(`
    SELECT
      p.title, p.prompt, p.slug, p.image, p.images, p.tags,
      p.og_image AS "ogImage", p.intro, p.use_case AS "useCase",
      COALESCE(assigned_categories.names, p.categories, '[]'::jsonb) AS categories,
      p.created_at::text AS "createdAt",
      p.updated_at::text AS "updatedAt"
    FROM prompts p
    LEFT JOIN LATERAL (
      SELECT JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names
      FROM prompt_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.prompt_id = p.id
    ) assigned_categories ON true
    WHERE p.status = 'published'
      AND p.library_type = 'photo'
      AND NULLIF(BTRIM(p.title), '') IS NOT NULL
      AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
    ORDER BY p.id
  `);

  return result.rows
    .filter(isSitemapEligiblePrompt)
    .map((row) => {
      const prompt = normalizePrompt(row, {
        suppressUnverifiedMedia: true,
        resolveLegacyMedia: true,
      });
      return {
        slug: prompt.slug,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        images: prompt.images,
      };
    });
}

// ── Slim payload (listing pages — no large text fields) ──────────────

const SLIM_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedSlimPayloadPromise = null;
let cachedSlimPayloadAt = 0;
let cachedNewsletterWelcomePromptsPromise = null;
let cachedNewsletterWelcomePromptsAt = 0;
let cachedPromptListingPagePromise = null;
let cachedPromptListingPageAt = 0;
let cachedPublicPromptDirectoryPromise = null;
let cachedPublicPromptDirectoryAt = 0;
const PROMPT_FEED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedPromptFeedRowsPromise = null;
let cachedPromptFeedRowsAt = 0;

const PROMPT_LISTING_SCHEMA_LIMIT = 24;
const HOMEPAGE_PROMPT_CARD_LIMIT = 12;
const HOMEPAGE_PROMPT_CACHE_TTL_MS = 5 * 60 * 1000;
const GSC_CLICK_EXCEPTION_SLUGS = new Set(GSC_CLICK_EXCEPTION_PROMPT_SLUGS);
const HOMEPAGE_NOINDEX_SLUGS = [...new Set([
  ...AUDITED_EXISTING_NOINDEX_PROMPT_SLUGS,
  ...GROUP_B_LOW_VALUE_PROMPT_SLUGS.filter((slug) => !GSC_CLICK_EXCEPTION_SLUGS.has(slug)),
  ...CRITICALLY_THIN_PROMPT_SLUGS.filter((slug) => !GSC_CLICK_EXCEPTION_SLUGS.has(slug)),
  ...REQUESTED_NOINDEX_PROMPT_SLUGS.filter((slug) => !GSC_CLICK_EXCEPTION_SLUGS.has(slug)),
])];
const HOMEPAGE_INDEXABILITY_FILTER_SQL = `
  AND NOT (
    LOWER(CONCAT_WS(' ', p.slug, p.title, p.tags::text)) ~* '(^|[^[:alnum:]_])(boy|girl)([^[:alnum:]_]|$)'
    AND LOWER(CONCAT_WS(' ', p.slug, p.title, p.tags::text)) !~* '(^|[^[:alnum:]_])(adult|woman|women|man|men|businessman|bride|groom)([^[:alnum:]_]|$)'
  )
`;
const HOMEPAGE_CATEGORY_IMAGE_PROMPT_TITLES = {
  men: 'Sharp Street Style Portrait in All-Black Modern Look',
  couples: 'Couple Portrait in Black Outfits with Watercolor Splatter Art',
  celebrations: 'Urban Collage Birthday Poster - South Asian Male',
  lifestyle: 'Chic Streetwear Portrait with Oversized Shirt and Denim Shorts',
  'photo-editing': 'Cinematic Teal Double Exposure Man Portrait Prompt',
};

async function queryHomepagePromptCards() {
  const startedAt = Date.now();
  try {
    const result = await getPgPool().query({
      text: `
        SELECT
          p.id,
          p.title,
          p.slug,
          COALESCE(NULLIF(p.images ->> 0, ''), NULLIF(p.image, '')) AS image,
          p.image_alt_texts ->> '0' AS "imageAlt",
          p.tags,
          p.use_case AS "useCase",
          p.created_at::text AS "createdAt",
          p.updated_at::text AS "updatedAt",
          (
            SELECT MAX(published.updated_at)::text
            FROM prompts published
            WHERE published.status = 'published'
              AND published.library_type = 'photo'
              AND NULLIF(BTRIM(published.title), '') IS NOT NULL
              AND NULLIF(BTRIM(published.prompt), '') IS NOT NULL
          ) AS "libraryUpdatedAt"
        FROM prompts p
        WHERE p.status = 'published'
          AND p.library_type = 'photo'
          AND COALESCE(p.should_noindex, false) = false
          AND p.slug <> ALL($2::text[])
          ${HOMEPAGE_INDEXABILITY_FILTER_SQL}
          AND NULLIF(BTRIM(p.title), '') IS NOT NULL
          AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
          AND COALESCE(NULLIF(p.images ->> 0, ''), NULLIF(p.image, '')) IS NOT NULL
        ORDER BY COALESCE(p.created_at::timestamptz, p.updated_at) DESC NULLS LAST, p.id ASC
        LIMIT $1
      `,
      values: [HOMEPAGE_PROMPT_CARD_LIMIT, HOMEPAGE_NOINDEX_SLUGS],
    });
    console.info(`[HOME_TIMING] prompt_cards_db_ms=${Date.now() - startedAt}`);
    return result.rows;
  } catch (error) {
    console.error(`[HOME_TIMING] prompt_cards_db_failed_ms=${Date.now() - startedAt}`);
    throw error;
  }
}

async function queryHomepageCategorySummary() {
  const categoryDefinitions = Object.values(PROMPT_CATEGORIES).map((category) => ({
    slug: category.slug,
    label: category.label,
    match_values: getCategoryMatchValues(category),
    image_prompt_title: HOMEPAGE_CATEGORY_IMAGE_PROMPT_TITLES[category.slug] || '',
  }));
  const startedAt = Date.now();

  try {
    const result = await getPgPool().query({
      text: `
        WITH category_config AS (
          SELECT
            config.slug,
            config.label,
            config.image_prompt_title,
            ARRAY(SELECT jsonb_array_elements_text(config.match_values)) AS match_values
          FROM jsonb_to_recordset($1::jsonb) AS config(
            slug text,
            label text,
            match_values jsonb,
            image_prompt_title text
          )
        ),
        eligible_prompts AS (
          SELECT
            p.id,
            p.title,
            COALESCE(NULLIF(p.images ->> 0, ''), NULLIF(p.image, '')) AS image,
            p.image_alt_texts,
            p.primary_category_id,
            p.category,
            p.use_case,
            p.categories,
            p.created_at
          FROM prompts p
          WHERE p.status = 'published'
            AND p.library_type = 'photo'
            AND COALESCE(p.should_noindex, false) = false
            AND p.slug <> ALL($2::text[])
            ${HOMEPAGE_INDEXABILITY_FILTER_SQL}
            AND NULLIF(BTRIM(p.title), '') IS NOT NULL
            AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
        )
        SELECT
          config.slug,
          config.label,
          COUNT(DISTINCT prompt.id)::int AS count,
          (
            ARRAY_AGG(
              prompt.image
              ORDER BY
                CASE WHEN prompt.title = config.image_prompt_title THEN 0 ELSE 1 END,
                prompt.created_at DESC NULLS LAST,
                prompt.id DESC
            ) FILTER (WHERE NULLIF(prompt.image, '') IS NOT NULL)
          )[1] AS image,
          (
            ARRAY_AGG(
              COALESCE(NULLIF(prompt.image_alt_texts ->> '0', ''), prompt.title)
              ORDER BY
                CASE WHEN prompt.title = config.image_prompt_title THEN 0 ELSE 1 END,
                prompt.created_at DESC NULLS LAST,
                prompt.id DESC
            ) FILTER (WHERE NULLIF(prompt.image, '') IS NOT NULL)
          )[1] AS "imageAlt"
        FROM category_config config
        LEFT JOIN eligible_prompts prompt ON (
          EXISTS (
            SELECT 1
            FROM categories primary_category
            WHERE primary_category.id = prompt.primary_category_id
              AND LOWER(primary_category.slug) = ANY(config.match_values)
          )
          OR EXISTS (
            SELECT 1
            FROM prompt_categories pc
            JOIN categories assigned_category ON assigned_category.id = pc.category_id
            WHERE pc.prompt_id = prompt.id
              AND LOWER(assigned_category.slug) = ANY(config.match_values)
          )
          OR LOWER(COALESCE(prompt.category, '')) = ANY(config.match_values)
          OR LOWER(COALESCE(prompt.use_case, '')) = ANY(config.match_values)
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(prompt.categories) = 'array' THEN prompt.categories
                ELSE '[]'::jsonb
              END
            ) AS legacy_category(value)
            WHERE LOWER(BTRIM(legacy_category.value)) = ANY(config.match_values)
          )
        )
        GROUP BY config.slug, config.label
        ORDER BY config.slug
      `,
      values: [JSON.stringify(categoryDefinitions), HOMEPAGE_NOINDEX_SLUGS],
    });
    console.info(`[HOME_TIMING] category_summary_db_ms=${Date.now() - startedAt}`);
    return result.rows;
  } catch (error) {
    console.error(`[HOME_TIMING] category_summary_db_failed_ms=${Date.now() - startedAt}`);
    throw error;
  }
}

async function loadHomepagePromptData() {
  const [databaseCardRows, categoryRows] = await Promise.all([
    queryHomepagePromptCards(),
    queryHomepageCategorySummary(),
  ]);
  const usePreviewFallback = databaseCardRows.length === 0 && isPreviewEnvironment();
  const cardRows = usePreviewFallback
    ? [{
      id: null,
      title: PREVIEW_SYNTHETIC_PROMPT.title,
      slug: PREVIEW_SYNTHETIC_PROMPT.slug,
      image: PREVIEW_SYNTHETIC_PROMPT.image,
      tags: PREVIEW_SYNTHETIC_PROMPT.tags,
      useCase: PREVIEW_SYNTHETIC_PROMPT.useCase,
      updatedAt: '',
    }]
    : databaseCardRows;
  const transformStartedAt = Date.now();
  const prompts = cardRows
    .map((row) => {
      const image = resolvePromptImagePath(row.image);
      const prompt = {
        id: Number(row.id) || null,
        title: cleanPublicPromptText(row.title),
        slug: cleanText(row.slug),
        image,
        imageAlt: cleanText(row.imageAlt),
        tags: cleanArray(row.tags),
        useCase: cleanText(row.useCase),
      };
      return isIndexablePrompt(prompt)
        ? { ...prompt, imageAlt: prompt.imageAlt || prompt.title }
        : null;
    })
    .filter(Boolean);
  const categoryCards = categoryRows.map((row) => {
    const category = Object.values(PROMPT_CATEGORIES).find((item) => item.slug === row.slug);
    const image = resolvePromptImagePath(row.image);
    return {
      ...category,
      count: Number(row.count) || 0,
      image,
      imageAlt: row.imageAlt || category?.label || row.label,
    };
  }).filter((category) => category.slug);
  if (usePreviewFallback) {
    const lifestyleCategory = categoryCards.find((category) => category.slug === 'lifestyle');
    if (lifestyleCategory) {
      lifestyleCategory.count = Math.max(lifestyleCategory.count, 1);
      lifestyleCategory.image = lifestyleCategory.image || PREVIEW_SYNTHETIC_PROMPT.image;
      lifestyleCategory.imageAlt = lifestyleCategory.imageAlt || PREVIEW_SYNTHETIC_PROMPT.title;
    } else {
      categoryCards.push({
        ...PROMPT_CATEGORIES.lifestyle,
        count: 1,
        image: PREVIEW_SYNTHETIC_PROMPT.image,
        imageAlt: PREVIEW_SYNTHETIC_PROMPT.title,
      });
    }
  }
  const updatedAt = cleanText(cardRows[0]?.libraryUpdatedAt);
  console.info(`[HOME_TIMING] prompt_transform_ms=${Date.now() - transformStartedAt}`);

  return { prompts, categoryCards, updatedAt };
}

export async function getHomepagePromptData() {
  const now = Date.now();
  if (
    cachedHomepagePromptDataPromise
    && now - cachedHomepagePromptDataAt < HOMEPAGE_PROMPT_CACHE_TTL_MS
  ) {
    return cachedHomepagePromptDataPromise;
  }

  cachedHomepagePromptDataAt = now;
  cachedHomepagePromptDataPromise = loadHomepagePromptData()
    .catch((error) => {
      cachedHomepagePromptDataPromise = null;
      cachedHomepagePromptDataAt = 0;
      throw error;
    });
  return cachedHomepagePromptDataPromise;
}

export async function getHomepagePromptCards() {
  return (await getHomepagePromptData()).prompts;
}

async function loadSlimPromptsPayload() {
  const prompts = await queryPromptRowsSlim();
  const updatedAt = prompts.reduce((latest, prompt) => {
    if (!prompt.updatedAt) return latest;
    return !latest || Date.parse(prompt.updatedAt) > Date.parse(latest)
      ? prompt.updatedAt
      : latest;
  }, '');

  return {
    success: true,
    updatedAt,
    pageTitle: PROMPTS_PAGE_TITLE,
    pageDescription: PROMPTS_PAGE_DESCRIPTION,
    prompts,
  };
}

export async function getSlimPromptsPayload() {
  const now = Date.now();
  if (cachedSlimPayloadPromise && now - cachedSlimPayloadAt < SLIM_CACHE_TTL_MS) {
    return cachedSlimPayloadPromise;
  }

  cachedSlimPayloadAt = now;
  cachedSlimPayloadPromise = loadSlimPromptsPayload()
    .then((payload) => payload)
    .catch((error) => {
      cachedSlimPayloadPromise = undefined;
      cachedSlimPayloadAt = 0;
      throw error;
    });

  return cachedSlimPayloadPromise;
}

async function loadPromptListingPagePayload() {
  const result = await getPgPool().query(`
    WITH eligible_rows AS (
      SELECT
        p.id,
        p.title,
        p.slug,
        COALESCE(NULLIF(p.images ->> 0, ''), NULLIF(p.image, '')) AS image,
        p.image_alt_texts ->> '0' AS "imageAlt"
      FROM prompts p
      WHERE p.status = 'published'
        AND p.library_type = 'photo'
        AND NULLIF(BTRIM(p.title), '') IS NOT NULL
        AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
    ),
    page_rows AS (
      SELECT id, title, slug, image, "imageAlt"
      FROM eligible_rows
      ORDER BY id DESC
      LIMIT $1
    )
    SELECT
      page_rows.id,
      page_rows.title,
      page_rows.slug,
      page_rows.image,
      page_rows."imageAlt",
      totals.total_count AS "totalCount"
    FROM (SELECT COUNT(*)::int AS total_count FROM eligible_rows) totals
    LEFT JOIN page_rows ON true
    ORDER BY page_rows.id ASC NULLS LAST
  `, [PROMPT_LISTING_SCHEMA_LIMIT]);

  let prompts = result.rows
    .filter((row) => row.id !== null)
    .map((row) => {
      const prompt = normalizePromptSlim(row, { resolveLegacyMedia: true });
      return {
        id: prompt.id,
        title: prompt.title,
        slug: prompt.slug,
        image: prompt.image,
        imageAlt: prompt.imageAlt || prompt.imageAltTexts?.['0'] || prompt.title,
      };
    });
  let totalCount = Number(result.rows[0]?.totalCount || 0);
  if (prompts.length === 0 && totalCount === 0 && isPreviewEnvironment()) {
    const fallback = normalizePromptSlim(PREVIEW_SYNTHETIC_PROMPT, {
      resolveLegacyMedia: true,
    });
    prompts = [{
      id: fallback.id,
      title: fallback.title,
      slug: fallback.slug,
      image: fallback.image,
      imageAlt: fallback.imageAlt || fallback.title,
    }];
    totalCount = 1;
  }

  return {
    success: true,
    updatedAt: '',
    pageTitle: PROMPTS_PAGE_TITLE,
    pageDescription: PROMPTS_PAGE_DESCRIPTION,
    prompts,
    totalCount,
  };
}

export async function getPromptListingPagePayload() {
  const now = Date.now();
  if (
    cachedPromptListingPagePromise
    && now - cachedPromptListingPageAt < SLIM_CACHE_TTL_MS
  ) {
    return cachedPromptListingPagePromise;
  }

  cachedPromptListingPageAt = now;
  cachedPromptListingPagePromise = loadPromptListingPagePayload()
    .catch((error) => {
      cachedPromptListingPagePromise = null;
      cachedPromptListingPageAt = 0;
      throw error;
    });
  return cachedPromptListingPagePromise;
}

async function loadPublicPromptDirectoryPayload() {
  const pool = getPgPool();
  const [promptsResult, updatedAtResult] = await Promise.all([
    pool.query(`
      SELECT
        p.id,
        p.title,
        p.slug,
        COALESCE(NULLIF(p.images ->> 0, ''), NULLIF(p.image, '')) AS image
      FROM prompts p
      WHERE p.status = 'published'
        AND p.library_type = 'photo'
        AND NULLIF(BTRIM(p.title), '') IS NOT NULL
        AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
      ORDER BY p.id
    `),
    pool.query(`
      SELECT MAX(p.updated_at)::text AS "updatedAt",
             COUNT(*)::int AS "sourcePromptCount"
      FROM prompts p
      WHERE p.status = 'published'
        AND p.library_type = 'photo'
        AND NULLIF(BTRIM(p.title), '') IS NOT NULL
        AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
    `),
  ]);

  const prompts = promptsResult.rows.map((row) => {
    const prompt = normalizePromptSlim(row, { resolveLegacyMedia: true });
    return {
      id: prompt.id,
      title: prompt.title,
      slug: prompt.slug,
      image: prompt.image,
    };
  });
  if (
    promptsResult.rowCount === 0
    && Number(updatedAtResult.rows[0]?.sourcePromptCount || 0) === 0
    && isPreviewEnvironment()
  ) {
    const fallback = normalizePromptSlim(PREVIEW_SYNTHETIC_PROMPT, {
      resolveLegacyMedia: true,
    });
    if (fallback.title && fallback.prompt) {
      prompts.push({
        id: fallback.id,
        title: fallback.title,
        slug: fallback.slug,
        image: fallback.image,
      });
    }
  }
  return {
    success: true,
    updatedAt: updatedAtResult.rows[0]?.updatedAt || '',
    prompts,
  };
}

export async function getPublicPromptDirectoryPayload() {
  const now = Date.now();
  if (
    cachedPublicPromptDirectoryPromise
    && now - cachedPublicPromptDirectoryAt < SLIM_CACHE_TTL_MS
  ) {
    return cachedPublicPromptDirectoryPromise;
  }

  cachedPublicPromptDirectoryAt = now;
  cachedPublicPromptDirectoryPromise = loadPublicPromptDirectoryPayload()
    .catch((error) => {
      cachedPublicPromptDirectoryPromise = null;
      cachedPublicPromptDirectoryAt = 0;
      throw error;
    });
  return cachedPublicPromptDirectoryPromise;
}

export async function getSlimAllPrompts() {
  if (isBuildPhase()) {
    const prompts = await getAllPrompts();
    return prompts.map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      slug: prompt.slug,
      image: prompt.image,
      images: prompt.images,
      category: prompt.category,
      categories: prompt.categories,
      useCase: prompt.useCase,
      tags: prompt.tags,
      status: prompt.status,
      intro: prompt.intro,
      imageAlt: prompt.imageAlt || prompt.imageAltTexts?.['0'] || prompt.title,
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
      shouldNoindex: prompt.shouldNoindex,
    }));
  }
  return (await getSlimPromptsPayload()).prompts;
}

export function clearSlimPromptsCache() {
  cachedSlimPayloadPromise = undefined;
  cachedSlimPayloadAt = 0;
  cachedNewsletterWelcomePromptsPromise = null;
  cachedNewsletterWelcomePromptsAt = 0;
  cachedPromptListingPagePromise = null;
  cachedPromptListingPageAt = 0;
  cachedPublicPromptDirectoryPromise = null;
  cachedPublicPromptDirectoryAt = 0;
  cachedHomepagePromptDataPromise = null;
  cachedHomepagePromptDataAt = 0;
}

const ADMIN_PROMPTS_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes for admin
let cachedAdminPrompts = null;
let cachedAdminPromptsAt = 0;

export async function getAllPromptsForAdmin() {
  const now = Date.now();
  if (cachedAdminPrompts && now - cachedAdminPromptsAt < ADMIN_PROMPTS_CACHE_TTL_MS) {
    return cachedAdminPrompts;
  }

  const result = await getPgPool().query(`
    SELECT id, title, slug, library_type AS "libraryType"
    FROM prompts
    WHERE library_type = 'photo'
    ORDER BY id DESC
  `);

  cachedAdminPrompts = result.rows.map((row) => ({
    id: Number(row.id),
    ...normalizePrompt(row, { suppressUnverifiedMedia: false }),
  }));
  cachedAdminPromptsAt = now;
  return cachedAdminPrompts;
}

export function clearAdminPromptsCache() {
  cachedAdminPrompts = null;
  cachedAdminPromptsAt = 0;
}

/**
 * Full single-row query by primary key — used by the prompt detail page.
 * Fetches one prompt's complete row (all columns + category joins) instead of
 * scanning the whole table, cutting detail-page egress from O(table) to O(1) row.
 */
async function queryPromptRowById(id) {
  const db = getPgPool();
  const result = await db.query({
    text: `
    SELECT
      p.id,
      p.title,
      p.prompt,
      p.slug,
      p.image,
      p.images,
      COALESCE(primary_category.name, p.category) AS category,
      COALESCE(assigned_categories.names, p.categories, '[]'::jsonb) AS categories,
      p.use_case AS "useCase",
      p.tags,
      p.faqs,
      p.customization_tips AS "customizationTips",
      p.status,
      p.primary_category_id AS "primaryCategoryId",
      primary_category.slug AS "primaryCategorySlug",
      COALESCE(assigned_categories.ids, '[]'::jsonb) AS "categoryIds",
      COALESCE(assigned_categories.slugs, '[]'::jsonb) AS "categorySlugs",
      p.meta_title AS "metaTitle",
      p.meta_description AS "metaDescription",
      p.og_image AS "ogImage",
      p.related_prompt_ids AS "relatedPromptIds",
      p.created_at::text AS "createdAt",
      p.intro,
      p.unique_feature AS "uniqueFeature",
      p.updated_at::text AS "updatedAt",
      p.recommended_aspect_ratio AS "recommendedAspectRatio",
      p.aspect_ratio_reason AS "aspectRatioReason",
      p.reviewed_at::text AS "reviewedAt",
      p.generation_tested AS "generationTested",
      p.generation_tested_date::text AS "generationTestedDate",
      p.generation_tested_tool AS "generationTestedTool",
      p.image_alt_texts AS "imageAltTexts",
      p.variations,
      p.recommended_tool AS "recommendedTool",
      p.tool_note AS "toolNote",
      p.how_to_use AS "howToUse",
      p.tools
    FROM prompts p
    LEFT JOIN categories primary_category
      ON primary_category.id = p.primary_category_id
    LEFT JOIN LATERAL (
      SELECT
        JSONB_AGG(c.name ORDER BY pc.position, c.id) AS names,
        JSONB_AGG(c.id ORDER BY pc.position, c.id) AS ids,
        JSONB_AGG(c.slug ORDER BY pc.position, c.id) AS slugs
      FROM prompt_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.prompt_id = p.id
    ) assigned_categories ON true
    WHERE p.id = $1
      AND p.status = 'published'
      AND p.library_type = 'photo'
    LIMIT 1
  `,
    values: [id],
  });

  const row = result.rows[0];
  if (!row) return null;

  const prompt = normalizePrompt(row, {
    suppressUnverifiedMedia: false,
    resolveLegacyMedia: true,
  });

  // Mirror queryPromptRows()' row filter so callers see identical semantics.
  return prompt.title && prompt.prompt ? prompt : null;
}

export async function getPromptBySlug(slug) {
  const normalizedSlug = cleanText(slug);
  if (!normalizedSlug) return null;

  const matchesSlug = (prompt) => {
    const titleSlug = slugifyPrompt(prompt.title);
    const storedSlug = prompt.slug || titleSlug;
    const truncatedSlug = slugifyPrompt(`${String(prompt.title || '').slice(0, 60).trim()}...`);

    return storedSlug === normalizedSlug
      || titleSlug === normalizedSlug
      || truncatedSlug === normalizedSlug;
  };

  // Static generation renders every published prompt. Reuse the already
  // cached full payload in build workers instead of opening a connection for
  // a separate slug-index query and primary-key query for every page.
  if (isBuildPhase()) {
    return (await getAllPrompts()).find(matchesSlug) || null;
  }

  // The matcher only reads slug + title — both selected by the slugs query — so a
  // freshly-fetched slugs index can match anything the old full scan could. Never
  // fall back to the full-table query: bots hitting random /p/ URLs must not
  // re-trigger a 249-row scan.
  const attemptedIds = new Set();
  const loadByMatch = async (match) => {
    if (!match?.id || attemptedIds.has(match.id)) return null;
    attemptedIds.add(match.id);
    return queryPromptRowById(match.id);
  };

  // First attempt: cached slugs index.
  const prompt = await loadByMatch((await getAllPromptSlugs()).find(matchesSlug));
  if (prompt) return prompt;

  // Second attempt: force-refresh the slugs index, re-run the matcher.
  const refreshed = await loadByMatch((await fetchPromptSlugsFresh()).find(matchesSlug));
  if (refreshed) return refreshed;

  if (
    isPreviewEnvironment()
    && normalizedSlug === PREVIEW_SYNTHETIC_PROMPT.slug
  ) {
    return normalizePrompt(PREVIEW_SYNTHETIC_PROMPT, { resolveLegacyMedia: true });
  }

  return null;
}

// Deduplicate per-request metadata + page lookups of the same slug
// (generateMetadata and Page both call this on every prompt page render).
export const getCachedPromptBySlug = cache(getPromptBySlug);

// ── Ultra-minimal: slugs only (no joins, no extra columns) ──────────

const SLUGS_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPromptSlugs = null;
let cachedPromptSlugsAt = 0;
const STATS_PROMPT_SLUGS_CACHE_TTL_MS = 60 * 60 * 1000;
let cachedStatsPromptSlugsPromise = null;
let cachedStatsPromptSlugsAt = 0;

/**
 * Ultra-minimal query — selects ONLY id, slug, status, should_noindex, title from the prompts table.
 * (title enables slug-variant matching for getPromptBySlug without a full-table scan.)
 * No joins on categories/prompt_categories. ~99% smaller than the full query.
 * Use for: generateStaticParams, sitemap, stats endpoints, per-slug resolution.
 */
export async function getAllPromptSlugs() {
  if (isBuildPhase()) {
    return (await getAllPrompts())
      .filter((prompt) => prompt.status === 'published')
      .map((prompt) => ({
        id: prompt.id,
        slug: prompt.slug,
        status: prompt.status,
        shouldNoindex: Boolean(prompt.shouldNoindex),
        title: prompt.title,
      }));
  }

  const now = Date.now();
  if (cachedPromptSlugs && now - cachedPromptSlugsAt < SLUGS_CACHE_TTL_MS) {
    return cachedPromptSlugs;
  }
  return fetchPromptSlugsFresh();
}

export async function getPromptSlugsForStats() {
  const now = Date.now();
  if (
    cachedStatsPromptSlugsPromise
    && now - cachedStatsPromptSlugsAt < STATS_PROMPT_SLUGS_CACHE_TTL_MS
  ) {
    return cachedStatsPromptSlugsPromise;
  }

  cachedStatsPromptSlugsAt = now;
  const request = queryPromptSlugs();
  const cachedRequest = request.catch((error) => {
    if (cachedStatsPromptSlugsPromise === cachedRequest) {
      cachedStatsPromptSlugsPromise = null;
      cachedStatsPromptSlugsAt = 0;
    }
    throw error;
  });
  cachedStatsPromptSlugsPromise = cachedRequest;
  return cachedRequest;
}

/** Bypasses (and refreshes) the slugs cache — used on a slug miss. */
async function fetchPromptSlugsFresh() {
  cachedPromptSlugs = await queryPromptSlugs();
  cachedPromptSlugsAt = Date.now();
  return cachedPromptSlugs;
}

async function queryPromptSlugs() {
  const result = await getPgPool().query(`
    SELECT id, slug, status, should_noindex, title
    FROM prompts
    WHERE status = 'published'
      AND library_type = 'photo'
    ORDER BY id
  `);

  const prompts = result.rows.map((row) => ({
    id: Number(row.id),
    slug: cleanText(row.slug),
    status: row.status,
    shouldNoindex: Boolean(row.should_noindex),
    title: cleanText(row.title),
  }));
  if (prompts.length === 0 && isPreviewEnvironment()) {
    return [{
      id: null,
      slug: PREVIEW_SYNTHETIC_PROMPT.slug,
      status: PREVIEW_SYNTHETIC_PROMPT.status,
      shouldNoindex: false,
      title: PREVIEW_SYNTHETIC_PROMPT.title,
    }];
  }
  return prompts;
}

export function clearPromptSlugsCache() {
  cachedPromptSlugs = null;
  cachedPromptSlugsAt = 0;
  cachedStatsPromptSlugsPromise = null;
  cachedStatsPromptSlugsAt = 0;
}
