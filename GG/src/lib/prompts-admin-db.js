import { getPgPool } from './db.js';
import { supportsCategoryLibraryType } from './categories-db.js';
import {
  getMcpDraftAuthorizationSql,
  insertMcpPromptOwner,
  lockMcpOAuthAuthorization,
  lockMcpOAuthDraftAuthorization,
} from './mcp-oauth-db.js';
import { slugifyPrompt } from './prompt-constants.js';
import { getPromptEligibilityFlags, normalizePrompt } from './prompts-db.js';

const ADMIN_PROMPT_OPTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedAdminPromptOptions = null;
let cachedAdminPromptOptionsAt = 0;
const LIMITS = {
  title: 200,
  prompt: 20_000,
  slug: 220,
  useCase: 200,
  intro: 5_000,
  uniqueFeature: 2_000,
  bestUseCase: 2_000,
  arrayItems: 30,
  arrayItem: 100,
  images: 12,
  faqs: 20,
  faqQuestion: 300,
  faqAnswer: 5_000,
  promptBreakdownField: 5_000,
  troubleshootingItems: 20,
  troubleshootingIssue: 300,
  troubleshootingDetail: 5_000,
  metaTitle: 500,
  metaDescription: 320,
  relatedPrompts: 8,
  customizationTips: 4,
  customizationTipItem: 500,
  aspectRatioReason: 500,
  introWords: 300,
  variations: 3,
  variationLabel: 120,
  variationText: 5_000,
  recommendedTool: 100,
  toolNote: 500,
  howToUse: 4,
  howToUseStep: 500,
  tools: 10,
  toolName: 100,
};

function cleanText(value) {
  return String(value ?? '').trim();
}

function cleanArray(value) {
  const raw = Array.isArray(value) ? value : cleanText(value).split(',');
  return [...new Set(raw.map(cleanText).filter(Boolean))];
}

function cleanFaqs(value) {
  if (!Array.isArray(value)) return [];

  return value.map((faq) => ({
    question: cleanText(faq?.question),
    answer: cleanText(faq?.answer),
  }));
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

function cleanVariations(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((variation) => ({
      label: cleanText(variation?.label),
      text: cleanText(variation?.text),
    }))
    .filter((variation) => variation.label || variation.text);
}

function cleanSteps(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean);
}

const VALID_ASPECT_RATIOS = new Set(['4:5', '1:1', '9:16', '16:9']);

function cleanCustomizationTips(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((tip) => cleanText(tip))
    .filter((tip) => tip.length > 0)
    .slice(0, LIMITS.customizationTips);
}

function cleanAspectRatio(value) {
  const normalized = cleanText(value);
  return VALID_ASPECT_RATIOS.has(normalized) ? normalized : '';
}

function cleanDate(value) {
  const normalized = cleanText(value);
  if (!normalized) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  return null;
}

function cleanId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cleanIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanId).filter(Boolean))];
}

function isAllowedImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;

    return url.hostname.endsWith('.public.blob.vercel-storage.com')
      || (url.hostname === 'res.cloudinary.com' && url.pathname.includes('/image/upload/'));
  } catch {
    return false;
  }
}

function validateOptionalText(errors, field, value, label, maxLength) {
  if (value.length > maxLength) {
    errors[field] = `${label} must be ${maxLength.toLocaleString()} characters or fewer.`;
  }
}

export function validateAdminPromptInput(input, { promptId = null } = {}) {
  const title = cleanText(input?.title);
  const prompt = cleanText(input?.prompt);
  const slug = slugifyPrompt(cleanText(input?.slug));
  const image = cleanText(input?.image);
  const images = cleanArray(input?.images);
  const primaryCategoryId = cleanId(input?.primaryCategoryId);
  const categoryIds = cleanIdArray(input?.categoryIds);
  const status = input?.status === 'published'
    ? 'published'
    : input?.status === 'draft'
      ? 'draft'
      : '';
  const useCase = cleanText(input?.useCase);
  const tags = cleanArray(input?.tags);
  const intro = cleanText(input?.intro);
  const uniqueFeature = cleanText(input?.uniqueFeature);
  const bestUseCase = cleanText(input?.bestUseCase);
  const ogImage = cleanText(input?.ogImage);
  const metaDescription = cleanText(input?.metaDescription);
  const relatedPromptIds = cleanIdArray(input?.relatedPromptIds);
  const recommendedAspectRatio = cleanAspectRatio(input?.recommendedAspectRatio);
  const aspectRatioReason = cleanText(input?.aspectRatioReason);
  const reviewedAt = cleanDate(input?.reviewedAt);
  const generationTested = Boolean(input?.generationTested);
  const generationTestedDate = cleanDate(input?.generationTestedDate);
  const generationTestedTool = cleanText(input?.generationTestedTool);
  const faqs = cleanFaqs(input?.faqs);
  const customizationTips = cleanCustomizationTips(input?.customizationTips);
  const variations = cleanVariations(input?.variations);
  const recommendedTool = cleanText(input?.recommendedTool);
  const toolNote = cleanText(input?.toolNote);
  const howToUse = cleanSteps(input?.howToUse);
  const tools = cleanArray(input?.tools);
  const imageAltTexts = input?.imageAltTexts && typeof input.imageAltTexts === 'object' && !Array.isArray(input.imageAltTexts)
    ? Object.fromEntries(
        Object.entries(input.imageAltTexts)
          .map(([key, value]) => [key, cleanText(value)])
      )
    : {};
  const errors = {};

  if (input?.libraryType !== undefined && input.libraryType !== 'photo') {
    errors.libraryType = 'Photo prompts must use the Photo workflow.';
  }

  if (title.length < 3) {
    errors.title = 'Title must be at least 3 characters.';
  } else if (title.length > LIMITS.title) {
    errors.title = `Title must be ${LIMITS.title} characters or fewer.`;
  }

  if (prompt.length < 10) {
    errors.prompt = 'Prompt text must be at least 10 characters.';
  } else if (prompt.length > LIMITS.prompt) {
    errors.prompt = `Prompt text must be ${LIMITS.prompt.toLocaleString()} characters or fewer.`;
  }

  if (!slug) {
    errors.slug = 'Enter a valid slug.';
  } else if (slug.length > LIMITS.slug) {
    errors.slug = `Slug must be ${LIMITS.slug} characters or fewer.`;
  } else if (cleanText(input?.slug) !== slug) {
    errors.slug = 'Use lowercase letters, numbers, and hyphens only.';
  }

  if (!status) errors.status = 'Choose Draft or Published.';
  if (!primaryCategoryId) {
    errors.primaryCategoryId = 'Choose a primary category.';
  }
  if (categoryIds.length > LIMITS.arrayItems) {
    errors.categoryIds = `Choose no more than ${LIMITS.arrayItems} categories.`;
  }

  validateOptionalText(errors, 'useCase', useCase, 'Use case', LIMITS.useCase);
  validateOptionalText(errors, 'intro', intro, 'Intro', LIMITS.intro);
  const introText = intro
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[^;\s]+;/g, ' ')
    .trim();
  const introWordCount = introText ? introText.split(/\s+/).filter(Boolean).length : 0;
  if (introWordCount > LIMITS.introWords) {
    errors.intro = `Intro must be ${LIMITS.introWords} words or fewer.`;
  }
  validateOptionalText(
    errors,
    'uniqueFeature',
    uniqueFeature,
    'Unique feature',
    LIMITS.uniqueFeature,
  );
  validateOptionalText(
    errors,
    'bestUseCase',
    bestUseCase,
    'Best use case',
    LIMITS.bestUseCase,
  );
  validateOptionalText(
    errors,
    'metaDescription',
    metaDescription,
    'Meta description',
    LIMITS.metaDescription,
  );
  if (ogImage && !isAllowedImageUrl(ogImage)) {
    errors.ogImage = 'The custom OG image must be a Cloudinary or existing Vercel Blob URL.';
  }
  if (relatedPromptIds.length > LIMITS.relatedPrompts) {
    errors.relatedPromptIds = `Choose no more than ${LIMITS.relatedPrompts} related prompts.`;
  } else if (promptId && relatedPromptIds.includes(Number(promptId))) {
    errors.relatedPromptIds = 'A prompt cannot be related to itself.';
  }

  if (tags.length > LIMITS.arrayItems) {
    errors.tags = `Use no more than ${LIMITS.arrayItems} tags.`;
  } else if (tags.some((value) => value.length > LIMITS.arrayItem)) {
    errors.tags = `Each tag must be ${LIMITS.arrayItem} characters or fewer.`;
  }
  if (customizationTips.length > LIMITS.customizationTips) {
    errors.customizationTips = `Use no more than ${LIMITS.customizationTips} practical tips.`;
  } else if (customizationTips.some((tip) => tip.length > LIMITS.customizationTipItem)) {
    errors.customizationTips = `Each tip must be ${LIMITS.customizationTipItem} characters or fewer.`;
  }
  if (variations.length > LIMITS.variations) {
    errors.variations = `Use no more than ${LIMITS.variations} prompt variations.`;
  } else if (variations.some((variation) => (
    !variation.label
    || !variation.text
    || variation.label.length > LIMITS.variationLabel
    || variation.text.length > LIMITS.variationText
  ))) {
    errors.variations = 'Each variation needs a label (up to 120 characters) and text (up to 5,000 characters).';
  }
  validateOptionalText(errors, 'recommendedTool', recommendedTool, 'Recommended tool', LIMITS.recommendedTool);
  validateOptionalText(errors, 'toolNote', toolNote, 'Tool note', LIMITS.toolNote);
  if (howToUse.length > LIMITS.howToUse) {
    errors.howToUse = `Use no more than ${LIMITS.howToUse} steps.`;
  } else if (howToUse.some((step) => step.length > LIMITS.howToUseStep)) {
    errors.howToUse = `Each step must be ${LIMITS.howToUseStep} characters or fewer.`;
  }
  if (tools.length > LIMITS.tools) {
    errors.tools = `Use no more than ${LIMITS.tools} compatible tools.`;
  } else if (tools.some((tool) => tool.length > LIMITS.toolName)) {
    errors.tools = `Each tool name must be ${LIMITS.toolName} characters or fewer.`;
  }
  if (faqs.length > LIMITS.faqs) {
    errors.faqs = `Use no more than ${LIMITS.faqs} FAQ entries.`;
  } else if (faqs.some((faq) => (
    (faq.question && !faq.answer)
    || (!faq.question && faq.answer)
    || faq.question.length > LIMITS.faqQuestion
    || faq.answer.length > LIMITS.faqAnswer
  ))) {
    errors.faqs = 'Each FAQ needs both a question (up to 300 characters) and answer (up to 5,000 characters).';
  }

  // Alt text validation — mandatory when publishing
  const allImages = [...new Set([image, ...images].filter(Boolean))];
  if (status === 'published' && allImages.length > 0) {
    const missingAltImages = allImages.filter((url, index) => {
      const alt = imageAltTexts[String(index)] || imageAltTexts[index] || '';
      return !alt.trim();
    });
    if (missingAltImages.length > 0) {
      const missingIndexes = allImages
        .map((url, index) => {
          const alt = imageAltTexts[String(index)] || imageAltTexts[index] || '';
          return !alt.trim() ? index : -1;
        })
        .filter((i) => i >= 0);
      errors.imageAltTexts = `Please add alt text to all images before publishing. Image ${missingIndexes.map((i) => i + 1).join(', ')} ${missingIndexes.length === 1 ? 'is' : 'are'} missing alt text.`;
    }
  }

  if (!image && status === 'published') {
    errors.image = 'Upload a primary image.';
  } else if (image && !isAllowedImageUrl(image)) {
    errors.image = 'The primary image must be a Cloudinary or existing Vercel Blob URL.';
  } else if (allImages.length > LIMITS.images) {
    errors.images = `Use no more than ${LIMITS.images} images.`;
  } else if (allImages.some((url) => !isAllowedImageUrl(url))) {
    errors.images = 'Every image must be a Cloudinary or existing Vercel Blob URL.';
  }

  const orderedCategoryIds = primaryCategoryId
    ? [primaryCategoryId, ...categoryIds.filter((id) => id !== primaryCategoryId)]
    : categoryIds;

  validateOptionalText(errors, 'aspectRatioReason', aspectRatioReason, 'Aspect ratio reason', LIMITS.aspectRatioReason);

  if (generationTestedDate && !reviewedAt) {
    // reviewedAt is optional, but generationTestedDate is only meaningful with reviewedAt
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      title,
      prompt,
      slug,
      image,
      images: allImages,
      primaryCategoryId,
      categoryIds: orderedCategoryIds,
      status,
      useCase,
      tags,
      intro,
      uniqueFeature,
      bestUseCase,
      ogImage,
      metaDescription,
      relatedPromptIds,
      recommendedAspectRatio,
      aspectRatioReason,
      reviewedAt,
      generationTested,
      generationTestedDate,
      generationTestedTool,
      imageAltTexts,
      faqs,
      customizationTips,
      variations,
      recommendedTool,
      toolNote,
      howToUse,
      tools,
    },
  };
}

async function resolveCategorySelection(client, data) {
  const supportsLibraryType = await supportsCategoryLibraryType(client);
  const result = await client.query(
    `SELECT id, name FROM categories
     WHERE id = ANY($1::bigint[])${supportsLibraryType ? " AND library_type = 'photo'" : ''}`,
    [data.categoryIds],
  );
  const byId = new Map(result.rows.map((category) => [
    Number(category.id),
    category,
  ]));

  if (
    byId.size !== data.categoryIds.length
    || !byId.has(data.primaryCategoryId)
  ) {
    const error = new Error('One or more selected categories no longer exist.');
    error.code = 'INVALID_CATEGORY_SELECTION';
    throw error;
  }

  const ordered = data.categoryIds.map((id) => byId.get(id));
  return {
    primary: byId.get(data.primaryCategoryId),
    ordered,
  };
}

async function replaceCategoryAssignments(client, promptId, categoryIds) {
  await client.query('DELETE FROM prompt_categories WHERE prompt_id = $1', [promptId]);

  for (let position = 0; position < categoryIds.length; position += 1) {
    await client.query(
      `
        INSERT INTO prompt_categories (prompt_id, category_id, position)
        VALUES ($1, $2, $3)
      `,
      [promptId, categoryIds[position], position],
    );
  }
}

export async function getAdminPromptById(id, { client = getPgPool() } = {}) {
  const result = await client.query(
    `
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
        p.status,
        p.meta_title AS "metaTitle",
        p.meta_description AS "metaDescription",
        p.og_image AS "ogImage",
        p.related_prompt_ids AS "relatedPromptIds",
        p.prompt_breakdown AS "promptBreakdown",
        p.prompt_specific_troubleshooting AS "promptSpecificTroubleshooting",
        p.primary_category_id AS "primaryCategoryId",
        COALESCE((SELECT JSONB_AGG(c.id ORDER BY pc.position, c.id)
          FROM prompt_categories pc
          JOIN categories c ON c.id = pc.category_id
          WHERE pc.prompt_id = p.id), '[]'::jsonb) AS "categoryIds",
        p.created_at::text AS "createdAt",
        p.intro,
        p.unique_feature AS "uniqueFeature",
        p.best_use_case AS "bestUseCase",
        p.updated_at::text AS "updatedAt",
        p.customization_tips AS "customizationTips",
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
        AND p.library_type = 'photo'
      LIMIT 1
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? { id: Number(row.id), ...normalizePrompt(row) } : null;
}

export async function listAdminPromptOptions() {
  const now = Date.now();
  if (
    cachedAdminPromptOptions
    && now - cachedAdminPromptOptionsAt < ADMIN_PROMPT_OPTIONS_CACHE_TTL_MS
  ) {
    return cachedAdminPromptOptions;
  }

  const result = await getPgPool().query(`
    SELECT id, title, slug, status
    FROM prompts
    WHERE library_type = 'photo'
    ORDER BY LOWER(title), id
  `);

  cachedAdminPromptOptions = result.rows.map((prompt) => ({
    id: Number(prompt.id),
    title: prompt.title,
    slug: prompt.slug,
    status: prompt.status,
  }));
  cachedAdminPromptOptionsAt = now;
  return cachedAdminPromptOptions;
}

export async function listAdminPromptRows({
  page = 1,
  pageSize = 30,
  search = '',
  status = 'all',
  category = '',
  sort = 'updated_desc',
} = {}) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 30, 20), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const normalizedSearch = cleanText(search).slice(0, 200);
  const normalizedStatus = status === 'published' || status === 'draft' ? status : 'all';
  const normalizedCategory = cleanText(category).slice(0, 200);
  const normalizedSort = ['updated_asc', 'title_asc', 'title_desc'].includes(sort)
    ? sort
    : 'updated_desc';
  const orderBy = {
    updated_desc: 'p.updated_at DESC NULLS LAST, p.id DESC',
    updated_asc: 'p.updated_at ASC NULLS LAST, p.id ASC',
    title_asc: 'p.title ASC, p.id ASC',
    title_desc: 'p.title DESC, p.id DESC',
  }[normalizedSort];
  const categoryExpression = 'COALESCE(primary_category.name, p.category, p.use_case)';
  const conditions = ["p.library_type = 'photo'"];
  const values = [];

  if (normalizedSearch) {
    values.push(`%${normalizedSearch}%`);
    conditions.push(`LOWER(p.title) LIKE LOWER($${values.length})`);
  }
  if (normalizedStatus !== 'all') {
    values.push(normalizedStatus);
    conditions.push(`p.status = $${values.length}`);
  }
  if (normalizedCategory) {
    values.push(normalizedCategory);
    conditions.push(`${categoryExpression} = $${values.length}`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const [countResult, categoriesResult] = await Promise.all([
    getPgPool().query(
      `SELECT COUNT(*)::int AS total
       FROM prompts p
       LEFT JOIN categories primary_category ON primary_category.id = p.primary_category_id
       ${whereClause}`,
      values,
    ),
    getPgPool().query(`
      SELECT DISTINCT ${categoryExpression} AS category
      FROM prompts p
      LEFT JOIN categories primary_category ON primary_category.id = p.primary_category_id
      WHERE p.library_type = 'photo'
        AND ${categoryExpression} IS NOT NULL
        AND ${categoryExpression} <> ''
      ORDER BY category
    `),
  ]);
  const total = Number(countResult.rows[0]?.total || 0);
  const totalPages = Math.max(Math.ceil(total / safePageSize), 1);
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;
  const limitParam = values.length + 1;
  const offsetParam = values.length + 2;

  const result = await getPgPool().query(
    `
      SELECT
        p.id,
        p.title,
        p.slug,
        p.image,
        COALESCE(primary_category.name, p.category, p.use_case) AS category,
        p.updated_at::text AS "updatedAt",
        p.status
      FROM prompts p
      LEFT JOIN categories primary_category
        ON primary_category.id = p.primary_category_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${limitParam}
      OFFSET $${offsetParam}
    `,
    [...values, safePageSize, offset],
  );

  return {
    rows: result.rows.map((prompt) => ({
      id: Number(prompt.id),
      title: prompt.title,
      slug: prompt.slug,
      image: prompt.image,
      category: prompt.category,
      updatedAt: prompt.updatedAt,
      status: prompt.status,
    })),
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
    search: normalizedSearch,
    status: normalizedStatus,
    category: normalizedCategory,
    categories: categoriesResult.rows.map((row) => row.category),
    sort: normalizedSort,
  };
}

export async function insertAdminPrompt(data, { mcpAuthorization = null } = {}) {
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    if (mcpAuthorization) await lockMcpOAuthAuthorization(client, mcpAuthorization);
    const selection = await resolveCategorySelection(client, data);
    const eligibility = getPromptEligibilityFlags({
      ...data,
      category: selection.primary.name,
      categories: selection.ordered.map((category) => category.name),
    });
    const result = await client.query(
      `
        INSERT INTO prompts (
          title,
          prompt,
          slug,
          image,
          images,
          category,
          categories,
          use_case,
          tags,
          created_at,
          intro,
          unique_feature,
          best_use_case,
          status,
          primary_category_id,
          og_image,
          related_prompt_ids,
          recommended_aspect_ratio,
          aspect_ratio_reason,
          reviewed_at,
          generation_tested,
          generation_tested_date,
          generation_tested_tool,
          image_alt_texts,
          variations,
          recommended_tool,
          tool_note,
          how_to_use,
          tools,
          meta_description,
          library_type,
          is_public_eligible
        )
        VALUES (
          $1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9::jsonb,
          CURRENT_DATE, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19, $20, $21, $22, $23::jsonb,
          $24::jsonb, $25, $26, $27::jsonb, $28::jsonb, $29, 'photo', $30
        )
        RETURNING id, slug, status
      `,
      [
        data.title,
        data.prompt,
        data.slug,
        data.image,
        JSON.stringify(data.images),
        selection.primary.name,
        JSON.stringify(selection.ordered.map((category) => category.name)),
        data.useCase || null,
        JSON.stringify(data.tags),
        data.intro || null,
        data.uniqueFeature || null,
        data.bestUseCase || null,
        mcpAuthorization ? 'draft' : data.status,
        data.primaryCategoryId,
        data.ogImage || null,
        JSON.stringify(data.relatedPromptIds),
        data.recommendedAspectRatio || null,
        data.aspectRatioReason || null,
        data.reviewedAt || null,
        data.generationTested,
        data.generationTestedDate || null,
        data.generationTestedTool || null,
        JSON.stringify(data.imageAltTexts || {}),
        JSON.stringify(data.variations || []),
        data.recommendedTool || null,
        data.toolNote || null,
        JSON.stringify(data.howToUse || []),
        JSON.stringify(data.tools || []),
        data.metaDescription || null,
        eligibility.isPublicEligible,
      ],
    );
    const promptId = Number(result.rows[0].id);
    await replaceCategoryAssignments(client, promptId, data.categoryIds);
    if (mcpAuthorization) await insertMcpPromptOwner(client, promptId, mcpAuthorization);
    await client.query('COMMIT');

    return {
      id: promptId,
      slug: result.rows[0].slug,
      status: result.rows[0].status,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAdminPrompt(
  id,
  data,
  {
    existing = null,
    expectedStatus = null,
    mcpAuthorization = null,
    client: suppliedClient = null,
    manageTransaction = true,
  } = {},
) {
  const pool = getPgPool();
  const ownsClient = !suppliedClient;
  const client = suppliedClient || await pool.connect();

  try {
    if (manageTransaction) await client.query('BEGIN');
    if (mcpAuthorization) {
      await lockMcpOAuthAuthorization(client, mcpAuthorization);
      await lockMcpOAuthDraftAuthorization(client, id, 'photo', mcpAuthorization);
    }
    const currentPrompt = mcpAuthorization
      ? await getAdminPromptById(id, { client })
      : existing || await getAdminPromptById(id, { client });
    const safeData = {
      ...data,
      faqs: data.faqs ?? currentPrompt?.faqs ?? [],
      promptBreakdown: data.promptBreakdown ?? currentPrompt?.promptBreakdown ?? null,
      promptSpecificTroubleshooting: data.promptSpecificTroubleshooting ?? currentPrompt?.promptSpecificTroubleshooting ?? null,
      metaTitle: data.metaTitle ?? currentPrompt?.metaTitle ?? '',
      metaDescription: data.metaDescription ?? currentPrompt?.metaDescription ?? '',
      customizationTips: data.customizationTips ?? currentPrompt?.customizationTips ?? [],
      useCase: data.useCase ?? currentPrompt?.useCase ?? null,
      intro: data.intro ?? currentPrompt?.intro ?? null,
      uniqueFeature: data.uniqueFeature ?? currentPrompt?.uniqueFeature ?? null,
      bestUseCase: data.bestUseCase ?? currentPrompt?.bestUseCase ?? null,
      variations: data.variations ?? currentPrompt?.variations ?? [],
      recommendedTool: data.recommendedTool ?? currentPrompt?.recommendedTool ?? '',
      toolNote: data.toolNote ?? currentPrompt?.toolNote ?? '',
      howToUse: data.howToUse ?? currentPrompt?.howToUse ?? [],
      tools: data.tools ?? currentPrompt?.tools ?? [],
    };
    const selection = await resolveCategorySelection(client, data);
    const eligibility = getPromptEligibilityFlags({
      ...safeData,
      category: selection.primary.name,
      categories: selection.ordered.map((category) => category.name),
    });
    const accessSql = mcpAuthorization
      ? getMcpDraftAuthorizationSql(expectedStatus ? 38 : 37, expectedStatus ? 39 : 38)
      : '';
    const result = await client.query(
      `
        UPDATE prompts
        SET
          title = $2,
          prompt = $3,
          slug = $4,
          image = $5,
          images = $6::jsonb,
          category = $7,
          categories = $8::jsonb,
          use_case = $9,
          tags = $10::jsonb,
          intro = $11,
          unique_feature = $12,
          best_use_case = $13,
          faqs = $14::jsonb,
          status = $15,
          primary_category_id = $16,
          meta_title = $17,
          meta_description = $18,
          og_image = $19,
          related_prompt_ids = $20::jsonb,
          prompt_breakdown = $21::jsonb,
          prompt_specific_troubleshooting = $22::jsonb,
          customization_tips = $23::jsonb,
          recommended_aspect_ratio = $24,
          aspect_ratio_reason = $25,
          reviewed_at = $26,
          generation_tested = $27,
          generation_tested_date = $28,
          generation_tested_tool = $29,
          image_alt_texts = $30::jsonb,
          variations = $31::jsonb,
          recommended_tool = $32,
          tool_note = $33,
          how_to_use = $34::jsonb,
          tools = $35::jsonb,
          is_public_eligible = $36,
          updated_at = NOW()
        WHERE id = $1
          AND library_type = 'photo'
          ${expectedStatus ? 'AND status = $37' : ''}
          ${accessSql}
        RETURNING id, slug, status, updated_at::text AS "updatedAt"
      `,
      [
        id,
        safeData.title,
        safeData.prompt,
        safeData.slug,
        safeData.image,
        JSON.stringify(safeData.images),
        selection.primary.name,
        JSON.stringify(selection.ordered.map((category) => category.name)),
        safeData.useCase || null,
        JSON.stringify(safeData.tags),
        safeData.intro || null,
        safeData.uniqueFeature || null,
        safeData.bestUseCase || null,
        JSON.stringify(safeData.faqs),
        safeData.status,
        safeData.primaryCategoryId,
        safeData.metaTitle || null,
        safeData.metaDescription || null,
        safeData.ogImage || null,
        JSON.stringify(safeData.relatedPromptIds),
        safeData.promptBreakdown ? JSON.stringify(safeData.promptBreakdown) : null,
        safeData.promptSpecificTroubleshooting
          ? JSON.stringify(safeData.promptSpecificTroubleshooting)
          : null,
        JSON.stringify(safeData.customizationTips),
        safeData.recommendedAspectRatio || null,
        safeData.aspectRatioReason || null,
        safeData.reviewedAt || null,
        safeData.generationTested,
        safeData.generationTestedDate || null,
        safeData.generationTestedTool || null,
        JSON.stringify(safeData.imageAltTexts || {}),
        JSON.stringify(safeData.variations || []),
        safeData.recommendedTool || null,
        safeData.toolNote || null,
        JSON.stringify(safeData.howToUse || []),
        JSON.stringify(safeData.tools || []),
        eligibility.isPublicEligible,
        ...(expectedStatus ? [expectedStatus] : []),
        ...(mcpAuthorization ? [mcpAuthorization.subject, mcpAuthorization.clientId] : []),
      ],
    );
    if (!result.rows[0]) {
      if (manageTransaction) await client.query('ROLLBACK');
      return null;
    }

    await replaceCategoryAssignments(client, id, data.categoryIds);
    if (manageTransaction) await client.query('COMMIT');

    return {
      id: Number(result.rows[0].id),
      slug: result.rows[0].slug,
      status: result.rows[0].status,
      updatedAt: result.rows[0].updatedAt || '',
    };
  } catch (error) {
    if (manageTransaction) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
}

export async function deleteAdminPrompt(id) {
  const result = await getPgPool().query(
    "DELETE FROM prompts WHERE id = $1 AND library_type = 'photo' RETURNING id, title, slug, image, images, status",
    [id],
  );

  return result.rows[0] || null;
}
