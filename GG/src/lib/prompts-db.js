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
  getCategoryMatchValues,
  getPromptCategory,
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

// Escape ILIKE wildcards so % / _ / \ in a search word are matched literally.
// PostgreSQL's default LIKE escape character is backslash, so no explicit
// ESCAPE clause is needed.
function escapeLikePattern(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
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

// Retained as a helper (used by verification scripts); since the owner
// decision of 2026-11-11 it no longer gates any listing, payload or
// sitemap path. Do not re-apply it as a filter without a new decision.
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
    isSecretPrompt: item.isSecretPrompt === true || item.isSecretPrompt === 1 || item.is_secret_prompt === true || item.is_secret_prompt === 1,
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
      COALESCE(JSONB_AGG(c.name ORDER BY pc.position, c.id) FILTER (WHERE c.id IS NOT NULL), p.categories, '[]'::jsonb) AS categories,
      p.use_case AS "useCase",
      p.tags,
      p.faqs,
      p.customization_tips AS "customizationTips",
      p.status,
      p.primary_category_id AS "primaryCategoryId",
      primary_category.slug AS "primaryCategorySlug",
      COALESCE(JSONB_AGG(c.id ORDER BY pc.position, c.id) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb) AS "categoryIds",
      COALESCE(JSONB_AGG(c.slug ORDER BY pc.position, c.id) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb) AS "categorySlugs",
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
    -- One aggregate over the junction table instead of a per-row LATERAL:
    -- 576 LATERAL executions (9.46 ms / 2,562 buffers) vs one GROUP BY
    -- (4.24 ms / 215 buffers). Same aggregate order (pc.position, c.id)
    -- and LEFT JOIN semantics; the FILTER keeps an empty category list
    -- empty instead of [null] (JSONB_AGG includes NULL inputs as nulls).
    LEFT JOIN prompt_categories pc ON pc.prompt_id = p.id
    LEFT JOIN categories c ON c.id = pc.category_id
    WHERE p.status = 'published'
      AND p.library_type = 'photo'
    GROUP BY p.id, primary_category.id
    ORDER BY p.id
  ` });

  const prompts = result.rows
    .map((row) => normalizePrompt(row, {
      suppressUnverifiedMedia: false,
      resolveLegacyMedia: true,
    }))
    // Owner decision 2026-11-11: all published prompts are indexable, so
    // the old containsMinorSubjectReference() filter is removed here. It
    // dropped every prompt mentioning boy/girl/teen/child anywhere (55 of
    // the 576 live published photo prompts, 19 of them otherwise
    // indexable) from the build payload, which also kept them out of
    // build-time generateStaticParams. Indexability is now governed only
    // by shouldNoIndexPrompt() / the stored should_noindex column.
    .filter((prompt) => prompt.title && prompt.prompt);

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
/**
 * Shared WHERE clause for the slim prompt listing queries (page query +
 * standalone count). The category condition matches the primary category
 * slug, or any assigned category slug via a direct EXISTS — so it works in
 * queries with or without the per-row LATERAL aggregate (the standalone
 * count and the GROUP BY form don't carry assigned_categories.*).
 * Returns the conditions plus the positional values in order.
 */
function buildSlimPromptConditions({ categorySlugs = [], search = '' } = {}) {
  const values = [];
  const conditions = ["p.status = 'published'", "p.library_type = 'photo'"];

  if (categorySlugs.length > 0) {
    values.push(categorySlugs);
    const categoryParam = `$${values.length}`;
    // Direct EXISTS over the junction table: the same slug set the old
    // jsonb_array_elements_text() over the LATERAL aggregate matched, but
    // usable without the LATERAL — and the planner can use the
    // prompt_categories index instead of expanding a JSON array per row.
    conditions.push(`(
      primary_category.slug = ANY(${categoryParam}::text[])
      OR EXISTS (
        SELECT 1
        FROM prompt_categories pc_filter
        JOIN categories c_filter ON c_filter.id = pc_filter.category_id
        WHERE pc_filter.prompt_id = p.id
          AND c_filter.slug = ANY(${categoryParam}::text[])
      )
    )`);
  }

  if (search) {
    // Multi-word search is an AND of per-word matches: each word must appear
    // in at least one of the searched fields, so "red dress" matches a prompt
    // with "red" in the title and "dress" in the intro. Single-word search
    // behaves exactly as before. `intro` is a searched field, like the rest.
    // `tools` is matched space-stripped as well: the column is JSONB holding
    // space-stripped concatenations such as "StableDiffusion", so a word is
    // also compared against REPLACE(p.tools::text, ' ', ''). The word is
    // stripped of spaces BEFORE escaping, so % / _ / \ in it still match
    // literally (escaping only adds backslashes, which contain no spaces).
    const words = cleanText(search).split(/\s+/).filter(Boolean);
    const wordConditions = words.map((word) => {
      values.push(`%${escapeLikePattern(word)}%`);
      const wordParam = `$${values.length}`;
      values.push(`%${escapeLikePattern(word.replace(/\s+/g, ''))}%`);
      const strippedWordParam = `$${values.length}`;
      return `(
        p.title ILIKE ${wordParam}
        OR p.prompt ILIKE ${wordParam}
        OR p.intro ILIKE ${wordParam}
        OR p.use_case ILIKE ${wordParam}
        OR p.category ILIKE ${wordParam}
        OR p.tags::text ILIKE ${wordParam}
        OR p.categories::text ILIKE ${wordParam}
        OR REPLACE(p.tools::text, ' ', '') ILIKE ${strippedWordParam}
      )`;
    });
    conditions.push(`(${wordConditions.join(' AND ')})`);
  }

  return { conditions, values };
}

async function queryPromptRowsSlim({
  categorySlugs = [],
  search = '',
  limit = null,
  offset = 0,
  sort = 'latest',
  randomSeed = null,
} = {}) {
  const db = getPgPool();
  const { conditions, values } = buildSlimPromptConditions({ categorySlugs, search });

  // The paginated path stays on the per-row scalar subqueries: with the
  // composite index they run only for the returned rows (~12 executions,
  // ~0.4 ms), while a GROUP BY would have to aggregate every matching row
  // before sorting and limiting. Full-table fetches (no limit) use the
  // GROUP BY form instead: one aggregate over the junction table, ~55%
  // faster and ~92% fewer buffers than 576 per-row executions. Both forms
  // return identical rows — same aggregate order (pc.position, c.id), same
  // LEFT JOIN semantics. The FILTER on the GROUP BY aggregates keeps an
  // empty category list empty instead of [null]: JSONB_AGG includes NULL
  // inputs as JSON nulls, and a prompt with no categories contributes
  // exactly one all-NULL joined row.
  // NOTE: sort=random with a limit still runs the per-row subqueries for
  // every matching row before the md5 sort (the planner cannot push LIMIT
  // past them), so the random pick does NOT go through this function — see
  // getRandomSlimPrompts, which sorts ids only and fetches the picked rows
  // by id.
  const useGroupBy = limit === null;

  let orderClause = 'ORDER BY p.id';
  if (limit !== null) {
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

  // Correlated scalar subqueries instead of LATERAL: SQLite has no
  // LATERAL, and the same shape runs on both backends (the adapter
  // translates JSONB_AGG on the D1 path). The COALESCE fallback to the
  // legacy p.categories column is preserved: the adapter wraps the
  // aggregate in NULLIF(..., '[]'), so an empty subquery yields NULL
  // exactly as JSONB_AGG did on Postgres.
  const categorySubquery = (column) => `(SELECT JSONB_AGG(c.${column} ORDER BY pc.position, c.id)
      FROM prompt_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.prompt_id = p.id)`;
  const categoriesExpr = useGroupBy
    ? `COALESCE(JSONB_AGG(c.name ORDER BY pc.position, c.id) FILTER (WHERE c.id IS NOT NULL), p.categories, '[]'::jsonb) AS categories`
    : `COALESCE(${categorySubquery('name')}, p.categories, '[]'::jsonb) AS categories`;
  const categoryIdsExpr = useGroupBy
    ? `COALESCE(JSONB_AGG(c.id ORDER BY pc.position, c.id) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb) AS "categoryIds"`
    : `COALESCE(${categorySubquery('id')}, '[]'::jsonb) AS "categoryIds"`;
  const categorySlugsExpr = useGroupBy
    ? `COALESCE(JSONB_AGG(c.slug ORDER BY pc.position, c.id) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb) AS "categorySlugs"`
    : `COALESCE(${categorySubquery('slug')}, '[]'::jsonb) AS "categorySlugs"`;
  const categoryJoin = useGroupBy
    ? `
    LEFT JOIN prompt_categories pc ON pc.prompt_id = p.id
    LEFT JOIN categories c ON c.id = pc.category_id`
    : '';
  const groupByClause = useGroupBy ? 'GROUP BY p.id, primary_category.id' : '';

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
      ${categoriesExpr},
      p.use_case AS "useCase",
      p.tags,
      p.status,
      p.primary_category_id AS "primaryCategoryId",
      primary_category.slug AS "primaryCategorySlug",
      ${categoryIdsExpr},
      ${categorySlugsExpr},
      p.created_at::text AS "createdAt",
      p.intro,
      p.updated_at::text AS "updatedAt"
    FROM prompts p
    LEFT JOIN categories primary_category
      ON primary_category.id = p.primary_category_id
    ${categoryJoin}
    WHERE ${conditions.join(' AND ')}
    ${groupByClause}
    ${orderClause}
  `, values });

  const prompts = result.rows
    .map((row) => normalizePromptSlim(row, {
      suppressUnverifiedMedia: false,
      resolveLegacyMedia: true,
    }))
    .filter((prompt) => prompt.title && prompt.prompt);

  if (prompts.length || !isPreviewEnvironment() || Number(offset) > 0) return prompts;

  const fallback = normalizePromptSlim(PREVIEW_SYNTHETIC_PROMPT, {
    resolveLegacyMedia: true,
  });
  const normalizedSearch = cleanText(search).toLowerCase();
  const searchWords = normalizedSearch.split(/\s+/).filter(Boolean);
  const searchableText = [
    fallback.title,
    fallback.prompt,
    fallback.intro,
    fallback.category,
    fallback.useCase,
    ...fallback.tags,
  ].join(' ').toLowerCase();
  const matchesCategory = categorySlugs.length === 0
    || categorySlugs.includes(fallback.primaryCategorySlug)
    || categorySlugs.some((slug) => fallback.categorySlugs.includes(slug));

  if (
    !matchesCategory
    || (searchWords.length > 0 && !searchWords.every((word) => searchableText.includes(word)))
    || (limit !== null && Number(limit) < 1)
  ) {
    return prompts;
  }

  return [fallback];
}

/**
 * Standalone total for the slim prompt listing, with the exact same filters
 * as the page query. Runs in parallel with the page query (see
 * getSlimPromptsPage): the old COUNT(*) OVER() window forced a full scan +
 * sort + window aggregate over every matching row before LIMIT, which
 * defeated the composite index on the listing path. No LATERAL join is
 * needed here — the category condition matches assigned slugs via a direct
 * EXISTS, and the count selects nothing from the aggregates.
 */
async function countSlimPrompts({ categorySlugs = [], search = '' } = {}) {
  const db = getPgPool();
  const { conditions, values } = buildSlimPromptConditions({ categorySlugs, search });
  const result = await db.query({ text: `
    SELECT COUNT(*)::int AS "totalCount"
    FROM prompts p
    LEFT JOIN categories primary_category
      ON primary_category.id = p.primary_category_id
    WHERE ${conditions.join(' AND ')}
  `, values });

  return Number(result.rows[0]?.totalCount || 0);
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

/**
 * Seeded random pick. Sorts ids only by md5(id:seed) — the same seeded
 * shuffle sort=random uses — then fetches the picked rows by id
 * (the ids-first pattern from the listing payload). The old
 * ORDER BY RANDOM() path aggregated all 576 rows with the GROUP BY form
 * (5.8 ms / 221 buffers), and routing the pick through the paginated
 * md5-seed query was slower still: the per-row subqueries ran for
 * all 576 rows before the md5 sort (10.4 ms / 2,562 buffers). The ids-only
 * sort is ~1.2 ms (narrow scan, no TOAST, no junction join) and the row
 * fetch is one PK lookup + subquery per pick. Same selection distribution
 * as the md5-seed shuffle: a different seed picks a different set.
 * When no seed is given one is generated server-side, so the weekly cron
 * (which passes none) still gets a fresh pick each run.
 */
export async function getRandomSlimPrompts(count = 5, randomSeed = null) {
  const safeCount = Math.min(Math.max(Number(count) || 5, 1), 20);
  const seed = Number.isSafeInteger(randomSeed)
    ? randomSeed
    : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  const { rows } = await getPgPool().query({
    text: `
      SELECT p.id
      FROM prompts p
      WHERE p.status = 'published'
        AND p.library_type = 'photo'
      ORDER BY md5(p.id::text || ':' || $1::text) LIMIT $2
    `,
    values: [seed, safeCount],
  });
  const ids = rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);

  if (ids.length === 0) {
    // Preview with an empty database: the old ORDER BY RANDOM() path
    // injected one synthetic prompt via queryPromptRowsSlim's fallback.
    if (!isPreviewEnvironment()) return [];
    const fallback = normalizePromptSlim(PREVIEW_SYNTHETIC_PROMPT, {
      resolveLegacyMedia: true,
    });
    return fallback.title && fallback.prompt ? [fallback] : [];
  }

  const prompts = await getSlimPromptsByIds(ids);
  // getSlimPromptsByIds returns rows in unspecified order; restore the
  // md5-seed order so the pick order is the seeded random order.
  const byId = new Map(prompts.map((prompt) => [Number(prompt.id), prompt]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function getSlimPromptsPage({
  categorySlugs = [],
  search = '',
  limit = 12,
  offset = 0,
  sort = 'latest',
  randomSeed = null,
} = {}) {
  const cleanSearch = cleanText(search);
  // The total comes from a separate count query run in parallel with the
  // page query. The old COUNT(*) OVER() window rode on a page row, so it
  // forced a full scan + sort + window aggregate over every matching row
  // before LIMIT — defeating the composite index on the listing path — and
  // a beyond-end page reported 0. Both queries are index-driven now; the
  // count is a cheap aggregate and the page query stops after its rows.
  const [prompts, totalCount] = await Promise.all([
    queryPromptRowsSlim({
      categorySlugs,
      search: cleanSearch,
      limit: Math.min(Math.max(Number(limit) || 12, 1), 1000),
      offset,
      sort,
      randomSeed,
    }),
    countSlimPrompts({ categorySlugs, search: cleanSearch }),
  ]);

  // In preview with an empty database the page query injects one synthetic
  // prompt while the count is 0 — report the injected row, as before.
  const resolvedTotalCount = totalCount === 0 && prompts.length > 0
    ? prompts.length
    : totalCount;

  return {
    prompts,
    totalCount: resolvedTotalCount,
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
        COALESCE((SELECT JSONB_AGG(c.name ORDER BY pc.position, c.id)
          FROM prompt_categories pc
          JOIN categories c ON c.id = pc.category_id
          WHERE pc.prompt_id = p.id), p.categories, '[]'::jsonb) AS categories,
        p.use_case AS "useCase",
        p.tags,
        p.status,
        p.primary_category_id AS "primaryCategoryId",
        primary_category.slug AS "primaryCategorySlug",
        COALESCE((SELECT JSONB_AGG(c.id ORDER BY pc.position, c.id)
          FROM prompt_categories pc
          JOIN categories c ON c.id = pc.category_id
          WHERE pc.prompt_id = p.id), '[]'::jsonb) AS "categoryIds",
        COALESCE((SELECT JSONB_AGG(c.slug ORDER BY pc.position, c.id)
          FROM prompt_categories pc
          JOIN categories c ON c.id = pc.category_id
          WHERE pc.prompt_id = p.id), '[]'::jsonb) AS "categorySlugs",
        p.created_at::text AS "createdAt",
        p.intro,
        p.updated_at::text AS "updatedAt"
      FROM prompts p
      LEFT JOIN categories primary_category ON primary_category.id = p.primary_category_id
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

// Legacy slug equivalents, mirroring the listing path (route +
// getSlimPromptsByCategory): a 'men' prompt also matches 'boys' rows and
// vice versa, same for 'women' / 'girls'.
const DETAIL_LEGACY_CATEGORY_SLUGS = {
  men: 'boys',
  women: 'girls',
  boys: 'men',
  girls: 'women',
};

// The category slugs the detail page's same-category test can match on:
// the prompt's primary + assigned slugs plus its derived category
// (getPromptCategory, from the category names), with legacy equivalents.
// Same set the detail component builds as promptCategorySlugs.
function getDetailCategorySlugs(currentPrompt = {}) {
  const slugs = new Set([
    currentPrompt.primaryCategorySlug,
    ...(Array.isArray(currentPrompt.categorySlugs) ? currentPrompt.categorySlugs : []),
    getPromptCategory(currentPrompt)?.slug,
  ].filter(Boolean).map((slug) => String(slug).toLowerCase()));
  for (const slug of [...slugs]) {
    const legacy = DETAIL_LEGACY_CATEGORY_SLUGS[slug];
    if (legacy) slugs.add(legacy);
  }
  return [...slugs];
}

/**
 * Targeted detail-page fetch: the slim prompts the detail page actually
 * reads — same-category candidates for related prompts, the prompt's manual
 * related ids, and the configured secret prompt (when set). Replaces the
 * whole-table getSlimAllPrompts() on the detail page (576 rows, ~1.2 MB)
 * with ~200 rows on average. The detail component re-applies its own
 * same-category filter on top, so the fetch only has to be a superset of
 * what that filter selects — verified against live data: for all 383
 * indexable prompts the category query returns exactly the component's
 * same-category set (0 missing, 0 extra), and the manual ids / secret
 * prompt are fetched by PK so no cross-category manual pick is lost.
 * Rows are id-ascending, the same order and shape as getSlimAllPrompts().
 * The current prompt itself is included (as before); the component
 * excludes it by slug.
 */
export async function getSlimPromptsForDetail(currentPrompt = {}) {
  const categorySlugs = getDetailCategorySlugs(currentPrompt);
  const manualIds = cleanIdArray(currentPrompt.relatedPromptIds);
  const configuredSecretSlug = String(process.env.NEXT_PUBLIC_SECRET_PROMPT_SLUG || '').trim();
  let secretId = null;
  if (configuredSecretSlug) {
    const match = (await getAllPromptSlugs())
      .find((entry) => entry.slug === configuredSecretSlug);
    if (match?.id) secretId = Number(match.id);
  }

  // Degenerate case: a prompt with no category slug at all falls back to
  // the component's name-matching branch, which only the whole table can
  // satisfy. Does not occur in live data (every published prompt has a
  // category slug); the fallback keeps the page correct if one appears.
  if (categorySlugs.length === 0) {
    return getSlimAllPrompts();
  }

  if (isBuildPhase()) {
    // Static generation shares the cached full payload: filter it in
    // memory with the same real-slug test the runtime query uses, then map
    // with the getSlimAllPrompts() build shape — no per-page database
    // round trip. The detail component re-applies its own (derived-slug)
    // filter on top, and the build set is a subset of the real-slug set
    // (verified on live data: 0/383 prompts have a build-only candidate),
    // so the static output is unchanged.
    const wantedIds = new Set([...manualIds, ...(secretId ? [secretId] : [])]);
    const slugSet = new Set(categorySlugs);
    return (await getAllPrompts())
      .filter((candidate) =>
        wantedIds.has(Number(candidate.id))
        || [candidate.primaryCategorySlug, ...(Array.isArray(candidate.categorySlugs) ? candidate.categorySlugs : [])]
          .filter(Boolean)
          .some((slug) => slugSet.has(String(slug).toLowerCase())),
      )
      .map(mapFullPromptToSlimBuildPrompt);
  }

  // Runtime: targeted SQL — the category query returns id-ascending slim
  // rows, the manual ids and the secret prompt come from PK lookups.
  // Deduped and id-sorted so the component sees the same candidate order
  // as the whole-table list.
  const [categoryPrompts, manualPrompts, secretPrompts] = await Promise.all([
    queryPromptRowsSlim({ categorySlugs }),
    manualIds.length > 0 ? getSlimPromptsByIds(manualIds) : Promise.resolve([]),
    secretId ? getSlimPromptsByIds([secretId]) : Promise.resolve([]),
  ]);
  const byId = new Map();
  for (const prompt of [...categoryPrompts, ...manualPrompts, ...secretPrompts]) {
    if (prompt?.id != null && !byId.has(Number(prompt.id))) {
      byId.set(Number(prompt.id), prompt);
    }
  }
  return [...byId.values()]
    .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
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
        COALESCE((SELECT JSONB_AGG(c.name ORDER BY pc.position, c.id)
          FROM prompt_categories pc
          JOIN categories c ON c.id = pc.category_id
          WHERE pc.prompt_id = p.id), p.categories, '[]'::jsonb) AS categories,
        p.use_case AS "useCase",
        p.created_at::text AS "createdAt"
      FROM prompts p
      LEFT JOIN categories primary_category
        ON primary_category.id = p.primary_category_id
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
      -- Direct join over the junction table: the same assigned slugs the
      -- old per-row aggregate + jsonb_array_elements_text() produced,
      -- without one aggregate execution per prompt. The outer DISTINCT dedupes.
      SELECT c.slug AS category_slug
      FROM prompts p
      JOIN prompt_categories pc ON pc.prompt_id = p.id
      JOIN categories c ON c.id = pc.category_id
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
    isSecretPrompt: item.isSecretPrompt === true || item.isSecretPrompt === 1 || item.is_secret_prompt === true || item.is_secret_prompt === 1,
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
  cachedSitemapRowsPromise = null;
  cachedSitemapRowsAt = 0;
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
  // Same rule as the prompt page's own noindex decision (isIndexablePrompt):
  // the previous containsMinorSubjectReference() check excluded any prompt
  // mentioning girl/boy/teen/child/children anywhere — even adult-woman
  // prompts — while the noindex rule only treats girl/boy as a minor signal
  // when no adult term (woman/man/...) is present. Evaluating the normalized
  // prompt with isIndexablePrompt keeps the sitemap exactly in step with
  // what is actually indexed: every indexable published prompt is listed,
  // and no noindexed prompt is.
  //
  // Note: getPublishedPromptSitemapRows no longer calls this — eligibility
  // is enforced in SQL with the maintained `should_noindex` column (the
  // stored form of shouldNoIndexPrompt(), recomputed on every
  // create/update/publish). This function is retained as the code-level
  // evaluation of the rule (and is asserted on by tests).
  return Boolean(
    prompt.slug
    && prompt.title
    && prompt.prompt
    && isIndexablePrompt(prompt)
  );
}

// Sitemap rows are cached (module-level promise, 1h TTL) so sitemap.xml and
// image-sitemap.xml share one fetch per regeneration window. The sitemap
// routes themselves revalidate every 24h, so a 1h in-memory TTL adds no
// meaningful staleness on top of the ISR cache.
const SITEMAP_ROWS_CACHE_TTL_MS = 60 * 60 * 1000;
let cachedSitemapRowsPromise = null;
let cachedSitemapRowsAt = 0;

/**
 * Slim sitemap query — selects ONLY the columns the sitemap renders
 * (slug, image, images, dates). The old query fetched the full prompt
 * text, tags, intro, use_case, og_image and a categories LATERAL aggregate
 * for all 576 published rows (~2 MB per regeneration, fetched separately
 * by both sitemap routes); the slim query fetches ~0.15 MB for the 576
 * eligible rows. Eligibility is the maintained `should_noindex` column
 * (same stored rule the homepage queries already filter on in SQL).
 *
 * The slim rows lose the media-risk context (slug/title/prompt/intro/tags)
 * that the image filter reads. The only rule that can newly fire on a
 * reduced context is the ambiguous-minor image-path rule, which needs an
 * adult term in the context; `hasAdultContext` is computed in SQL from
 * those same fields (Postgres `\y` is the word boundary, matching the JS
 * `\b` in the media check) and carried into the context as a synthetic
 * 'adult' tag, so image filtering matches the old full-context output.
 */
async function loadPublishedPromptSitemapRows() {
  const result = await getPgPool().query(`
    SELECT
      p.slug,
      p.image,
      p.images,
      p.created_at::text AS "createdAt",
      p.updated_at::text AS "updatedAt",
      (
        p.slug || ' ' || COALESCE(p.title, '') || ' ' || COALESCE(p.prompt, '')
        || ' ' || COALESCE(p.intro, '') || ' ' || COALESCE(p.tags::text, '')
      ) ~* '\\y(adult|woman|women|man|men|businessman|bride|groom)\\y' AS "hasAdultContext"
    FROM prompts p
    WHERE p.status = 'published'
      AND p.library_type = 'photo'
      AND COALESCE(p.should_noindex, false) = false
      AND NULLIF(BTRIM(p.slug), '') IS NOT NULL
      AND NULLIF(BTRIM(p.title), '') IS NOT NULL
      AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
    ORDER BY p.id
  `);

  return result.rows.map((row) => {
    const prompt = normalizePrompt(
      {
        ...row,
        // Synthetic adult marker for the media-risk context (see above):
        // normalizePrompt reads tags into the media context, and the
        // sitemap mapper uses nothing else from tags.
        tags: row.hasAdultContext ? ['adult'] : [],
      },
      {
        suppressUnverifiedMedia: true,
        resolveLegacyMedia: true,
      },
    );
    return {
      slug: prompt.slug,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      images: prompt.images,
    };
  });
}

export async function getPublishedPromptSitemapRows() {
  const now = Date.now();
  if (
    cachedSitemapRowsPromise
    && now - cachedSitemapRowsAt < SITEMAP_ROWS_CACHE_TTL_MS
  ) {
    return cachedSitemapRowsPromise;
  }

  cachedSitemapRowsAt = now;
  cachedSitemapRowsPromise = loadPublishedPromptSitemapRows()
    .catch((error) => {
      cachedSitemapRowsPromise = null;
      cachedSitemapRowsAt = 0;
      throw error;
    });
  return cachedSitemapRowsPromise;
}

let cachedSlimSitemapRowsPromise = null;
let cachedSlimSitemapRowsAt = 0;

// Slimmer sitemap rows for app/sitemap.js only: it renders slug + dates and
// never uses `images`, so skip the adult-context regex and the per-row
// normalizePrompt (576 calls) that the image sitemap needs. Same
// eligibility rule, same order, same 1h in-memory TTL. This keeps the main
// sitemap generation well inside the Workers 10 ms CPU limit (Error 1102);
// the image sitemap keeps using the full rows above.
async function loadPublishedPromptSitemapRowsSlim() {
  const result = await getPgPool().query(`
    SELECT
      p.slug,
      p.created_at::text AS "createdAt",
      p.updated_at::text AS "updatedAt"
    FROM prompts p
    WHERE p.status = 'published'
      AND p.library_type = 'photo'
      AND COALESCE(p.should_noindex, false) = false
      AND NULLIF(BTRIM(p.slug), '') IS NOT NULL
      AND NULLIF(BTRIM(p.title), '') IS NOT NULL
      AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
    ORDER BY p.id
  `);

  return result.rows.map((row) => ({
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getPublishedPromptSitemapRowsSlim() {
  const now = Date.now();
  if (
    cachedSlimSitemapRowsPromise
    && now - cachedSlimSitemapRowsAt < SITEMAP_ROWS_CACHE_TTL_MS
  ) {
    return cachedSlimSitemapRowsPromise;
  }

  cachedSlimSitemapRowsAt = now;
  cachedSlimSitemapRowsPromise = loadPublishedPromptSitemapRowsSlim()
    .catch((error) => {
      cachedSlimSitemapRowsPromise = null;
      cachedSlimSitemapRowsAt = 0;
      throw error;
    });
  return cachedSlimSitemapRowsPromise;
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
// Owner decision 2026-11-11: all published prompts are indexable, so the
// homepage card/category queries no longer exclude the September 2026
// noindex slug lists. The lists stay in content-indexing-policy.js as
// audit history only. Kept as an (empty) constant so the $2 query param
// and the `p.slug <> ALL($2::text[])` clause keep working unchanged.
const HOMEPAGE_NOINDEX_SLUGS = [];
// Owner decision 2026-11-11: the old ambiguous-minor SQL filter
// (boy/girl without an adult term) is retired with the rest of the
// noindex rule. Kept as an empty fragment so the interpolations in the
// homepage card/category queries stay valid.
const HOMEPAGE_INDEXABILITY_FILTER_SQL = ``;
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
          p.prompt,
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

// Homepage category summary, computed in JS.
//
// The original form was one SQL statement built on jsonb_to_recordset
// (to pass the category definitions in), jsonb_array_elements_text
// (legacy `categories` arrays), `= ANY(config.match_values)` and
// ARRAY_AGG(...)[1] for the representative image — none of which has a
// SQLite equivalent. The replacement fetches the eligible prompts once
// (one narrow SELECT), the assigned-category slugs once (one junction
// join), and does the matching and image pick in JS. The semantics are
// the same as the SQL:
// - eligible: published, photo library, not noindexed, non-blank title
//   and prompt (the noindex slug list and the indexability filter are
//   currently empty — see HOMEPAGE_NOINDEX_SLUGS /
//   HOMEPAGE_INDEXABILITY_FILTER_SQL — but the slug exclusion is still
//   applied in JS so a future list works unchanged).
// - a prompt matches a category when any of these (lowercased) is one
//   of the category's match values: its primary-category slug, an
//   assigned-category slug, its legacy `category`, its `use_case`, or
//   an element of its legacy `categories` array.
// - count is the number of distinct matching prompts; the image is
//   picked from the matching prompts ordered by (title === the
//   category's image_prompt_title first, created_at DESC NULLS LAST,
//   id DESC), taking the first with a non-empty image, with imageAlt
//   from that same prompt (its image_alt_texts[0], else its title).
// Returns rows shaped { slug, label, count, image, imageAlt }, ordered
// by slug — the shape loadHomepagePromptData maps into category cards.
async function queryHomepageCategorySummary() {
  const categoryDefinitions = Object.values(PROMPT_CATEGORIES).map((category) => ({
    slug: category.slug,
    label: category.label,
    matchValues: new Set(getCategoryMatchValues(category)),
    imagePromptTitle: HOMEPAGE_CATEGORY_IMAGE_PROMPT_TITLES[category.slug] || '',
  }));
  const startedAt = Date.now();

  try {
    const [promptsResult, assignedResult] = await Promise.all([
      getPgPool().query(`
        SELECT
          p.id,
          p.title,
          p.slug,
          COALESCE(NULLIF(p.images ->> 0, ''), NULLIF(p.image, '')) AS image,
          p.image_alt_texts ->> '0' AS "imageAlt",
          primary_category.slug AS "primaryCategorySlug",
          p.category,
          p.use_case AS "useCase",
          p.categories,
          p.created_at::text AS "createdAt"
        FROM prompts p
        LEFT JOIN categories primary_category
          ON primary_category.id = p.primary_category_id
        WHERE p.status = 'published'
          AND p.library_type = 'photo'
          AND COALESCE(p.should_noindex, false) = false
          AND NULLIF(BTRIM(p.title), '') IS NOT NULL
          AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
      `),
      getPgPool().query(`
        SELECT pc.prompt_id AS "promptId", LOWER(c.slug) AS slug
        FROM prompt_categories pc
        JOIN categories c ON c.id = pc.category_id
      `),
    ]);
    const assignedSlugsByPrompt = new Map();
    for (const row of assignedResult.rows) {
      const promptId = Number(row.promptId);
      if (!Number.isSafeInteger(promptId)) continue;
      if (!assignedSlugsByPrompt.has(promptId)) assignedSlugsByPrompt.set(promptId, new Set());
      if (typeof row.slug === 'string' && row.slug) assignedSlugsByPrompt.get(promptId).add(row.slug);
    }
    const noindexSlugs = new Set(
      HOMEPAGE_NOINDEX_SLUGS.map((slug) => String(slug || '').toLowerCase()),
    );
    const eligiblePrompts = promptsResult.rows.filter((prompt) => {
      const slug = String(prompt.slug || '').toLowerCase();
      return slug && !noindexSlugs.has(slug);
    });

    const rows = categoryDefinitions.map((category) => {
      const matches = eligiblePrompts.filter((prompt) => {
        const candidates = [
          typeof prompt.primaryCategorySlug === 'string'
            ? prompt.primaryCategorySlug.trim().toLowerCase()
            : '',
          ...(assignedSlugsByPrompt.get(Number(prompt.id)) || []),
          String(prompt.category || '').trim().toLowerCase(),
          String(prompt.useCase || '').trim().toLowerCase(),
          ...(Array.isArray(prompt.categories)
            ? prompt.categories.map((value) => String(value || '').trim().toLowerCase())
            : []),
        ].filter(Boolean);
        return candidates.some((candidate) => category.matchValues.has(candidate));
      });
      const ranked = [...matches].sort((a, b) => {
        const aTitleRank = a.title === category.imagePromptTitle ? 0 : 1;
        const bTitleRank = b.title === category.imagePromptTitle ? 0 : 1;
        if (aTitleRank !== bTitleRank) return aTitleRank - bTitleRank;
        const aCreatedAt = a.createdAt || null;
        const bCreatedAt = b.createdAt || null;
        if (aCreatedAt === null && bCreatedAt === null) return Number(b.id) - Number(a.id);
        if (aCreatedAt === null) return 1;
        if (bCreatedAt === null) return -1;
        if (aCreatedAt !== bCreatedAt) return aCreatedAt < bCreatedAt ? 1 : -1;
        return Number(b.id) - Number(a.id);
      });
      const picked = ranked.find((prompt) => typeof prompt.image === 'string' && prompt.image !== '');
      return {
        slug: category.slug,
        label: category.label,
        count: matches.length,
        image: picked ? picked.image : null,
        imageAlt: picked
          ? (typeof picked.imageAlt === 'string' && picked.imageAlt !== '' ? picked.imageAlt : picked.title)
          : null,
      };
    });
    rows.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    console.info(`[HOME_TIMING] category_summary_db_ms=${Date.now() - startedAt}`);
    return rows;
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
        prompt: cleanPublicPromptText(row.prompt),
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
    -- Ids first, then full text for those 24 only. The old CTE
    -- materialized all 576 rows WITH prompt text (TOAST reads) and only
    -- then took 24 (6.9 ms / 1,893 buffers). The ids CTE is index-driven
    -- (ORDER BY id DESC LIMIT 24) and the text join touches 24 rows.
    -- octet_length() is exactly equivalent to the old BTRIM check here:
    -- 0 published photo prompts have an empty (or whitespace-only) title
    -- or prompt, and octet_length() does NOT detoast, so the ids scan and
    -- the count stay cheap. The BTRIM check still runs on the 24 rows.
    WITH eligible_ids AS (
      SELECT p.id
      FROM prompts p
      WHERE p.status = 'published'
        AND p.library_type = 'photo'
        AND octet_length(p.title) > 0
        AND octet_length(p.prompt) > 0
      ORDER BY p.id DESC
      LIMIT $1
    ),
    totals AS (
      SELECT COUNT(*)::int AS total_count
      FROM prompts p
      WHERE p.status = 'published'
        AND p.library_type = 'photo'
        AND octet_length(p.title) > 0
        AND octet_length(p.prompt) > 0
    )
    SELECT
      p.id,
      p.title,
      p.slug,
      p.prompt,
      COALESCE(NULLIF(p.images ->> 0, ''), NULLIF(p.image, '')) AS image,
      p.image_alt_texts ->> '0' AS "imageAlt",
      totals.total_count AS "totalCount"
    FROM eligible_ids
    JOIN prompts p ON p.id = eligible_ids.id
    CROSS JOIN totals
    WHERE NULLIF(BTRIM(p.title), '') IS NOT NULL
      AND NULLIF(BTRIM(p.prompt), '') IS NOT NULL
    -- Newest first, direct: PromptListingPage no longer reverses its input.
    ORDER BY p.id DESC
  `, [PROMPT_LISTING_SCHEMA_LIMIT]);

  let prompts = result.rows
    .filter((row) => row.id !== null)
    .map((row) => {
      const prompt = normalizePromptSlim(row, { resolveLegacyMedia: true });
      return {
        id: prompt.id,
        title: prompt.title,
        slug: prompt.slug,
        prompt: prompt.prompt,
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

// Build-phase slim shape for a full prompt. Single source of truth for the
// mapping getSlimAllPrompts() applies in build workers — the detail-page
// targeted fetch (getSlimPromptsForDetail) maps identically. Note the shape
// deliberately drops primaryCategorySlug / categorySlugs / prompt /
// isSecretPrompt, matching the old inline mapping.
function mapFullPromptToSlimBuildPrompt(prompt) {
  return {
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
  };
}

export async function getSlimAllPrompts() {
  if (isBuildPhase()) {
    const prompts = await getAllPrompts();
    return prompts.map(mapFullPromptToSlimBuildPrompt);
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
      COALESCE((SELECT JSONB_AGG(c.name ORDER BY pc.position, c.id)
        FROM prompt_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.prompt_id = p.id), p.categories, '[]'::jsonb) AS categories,
      p.use_case AS "useCase",
      p.tags,
      p.faqs,
      p.customization_tips AS "customizationTips",
      p.status,
      p.primary_category_id AS "primaryCategoryId",
      primary_category.slug AS "primaryCategorySlug",
      COALESCE((SELECT JSONB_AGG(c.id ORDER BY pc.position, c.id)
        FROM prompt_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.prompt_id = p.id), '[]'::jsonb) AS "categoryIds",
      COALESCE((SELECT JSONB_AGG(c.slug ORDER BY pc.position, c.id)
        FROM prompt_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.prompt_id = p.id), '[]'::jsonb) AS "categorySlugs",
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
