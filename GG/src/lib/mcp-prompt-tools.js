import { getPgPool } from './db.js';
import { listCategories } from './categories-db.js';
import {
  getAdminPromptById,
  insertAdminPrompt,
  listAdminPromptRows,
  updateAdminPrompt,
  validateAdminPromptInput,
} from './prompts-admin-db.js';
import { clearPromptsCache } from './prompts-db.js';
import {
  getTextPromptById,
  insertTextPrompt,
  listTextPromptRows,
  updateTextPrompt,
  validateTextPromptInput,
} from './text-prompts-admin-db.js';
import { shouldNoIndexPrompt, slugifyPrompt } from './prompt-constants.js';
import { uploadMcpImageFile } from './mcp-image-upload.js';
import {
  canMcpOAuthReadPrompt,
  lockMcpOAuthCapability,
  lockMcpOAuthAuthorization,
  lockMcpOAuthDraftAuthorization,
  listMcpOAuthPromptRows,
  McpAuthorizationError,
} from './mcp-oauth-db.js';

const MAX_PAGE = 1000;
const MAX_PAGE_SIZE = 50;
const MAX_CATEGORIES = 100;

export class McpToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'McpToolError';
  }
}

function ensureLibrary(library) {
  if (library !== 'photo' && library !== 'text') {
    throw new McpToolError('library must be "photo" or "text".');
  }
  return library;
}

function ensurePromptId(id) {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new McpToolError('id must be a positive integer.');
  }
  return id;
}

function projectPhotoPrompt(prompt) {
  return {
    id: prompt.id,
    library: 'photo',
    title: prompt.title,
    prompt: prompt.prompt,
    slug: prompt.slug,
    status: prompt.status,
    category: prompt.category,
    categories: prompt.categories,
    categoryIds: prompt.categoryIds,
    tags: prompt.tags,
    intro: prompt.intro,
    faqs: prompt.faqs,
    customizationTips: prompt.customizationTips,
    variations: prompt.variations,
    recommendedTool: prompt.recommendedTool,
    toolNote: prompt.toolNote,
    howToUse: prompt.howToUse,
    tools: prompt.tools,
    metaDescription: prompt.metaDescription,
    useCase: prompt.useCase,
    image: prompt.image,
    images: prompt.images,
    imageAltTexts: prompt.imageAltTexts,
    ogImage: prompt.ogImage,
    relatedPromptIds: prompt.relatedPromptIds,
    recommendedAspectRatio: prompt.recommendedAspectRatio,
    aspectRatioReason: prompt.aspectRatioReason,
    reviewedAt: prompt.reviewedAt,
    generationTested: prompt.generationTested,
    generationTestedDate: prompt.generationTestedDate,
    generationTestedTool: prompt.generationTestedTool,
  };
}

function projectTextPrompt(prompt) {
  return {
    id: prompt.id,
    library: 'text',
    title: prompt.title,
    prompt: prompt.prompt,
    slug: prompt.slug,
    status: prompt.status,
    category: prompt.category,
    categories: prompt.categories,
    categoryIds: prompt.categoryIds,
    tags: prompt.tags,
    intro: prompt.intro,
    useCase: prompt.useCase,
    updatedAt: prompt.updatedAt,
  };
}

function validatePageOptions({ page = 1, pageSize = 20, status = 'all', search = '' }) {
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
    throw new McpToolError(`page must be between 1 and ${MAX_PAGE}.`);
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new McpToolError(`pageSize must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (!['all', 'draft', 'published'].includes(status)) {
    throw new McpToolError('status must be all, draft, or published.');
  }
  if (typeof search !== 'string' || search.length > 200) {
    throw new McpToolError('search must be 200 characters or fewer.');
  }

  return { page, pageSize: Math.max(pageSize, 20), status, search };
}

export async function listPrompts(input, authentication = null) {
  const library = ensureLibrary(input.library);
  const options = validatePageOptions(input);
  if (authentication?.type === 'oauth') {
    const result = await listMcpOAuthPromptRows(authentication, {
      library,
      ...options,
    });
    return {
      library,
      rows: result.rows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  }
  const result = library === 'photo'
    ? await listAdminPromptRows(options)
    : await listTextPromptRows(options);

  return {
    library,
    rows: result.rows.map((prompt) => ({
      id: Number(prompt.id),
      title: prompt.title,
      slug: prompt.slug,
      status: prompt.status,
      category: prompt.category,
      ...(library === 'photo' ? { image: prompt.image || '' } : {}),
      updatedAt: prompt.updatedAt || '',
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
}

export async function getPrompt(input, authentication = null) {
  const library = ensureLibrary(input.library);
  const id = ensurePromptId(input.id);
  if (authentication?.type === 'oauth') {
    const client = await getPgPool().connect();
    try {
      await client.query('BEGIN');
      await lockMcpOAuthAuthorization(client, authentication);
      if (!await canMcpOAuthReadPrompt(client, id, library, authentication)) {
        throw new McpAuthorizationError('Prompt not found or not accessible.');
      }
      const prompt = library === 'photo'
        ? await getAdminPromptById(id, { client })
        : await getTextPromptById(id, { client });
      await client.query('COMMIT');
      return library === 'photo' ? projectPhotoPrompt(prompt) : projectTextPrompt(prompt);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  const prompt = library === 'photo'
    ? await getAdminPromptById(id)
    : await getTextPromptById(id);

  if (!prompt) throw new McpToolError('Prompt not found in the selected library.');
  return library === 'photo' ? projectPhotoPrompt(prompt) : projectTextPrompt(prompt);
}

export async function getPromptCategories({ library = 'photo' } = {}) {
  const categories = await listCategories({ libraryType: library });
  return categories.slice(0, MAX_CATEGORIES).map((category) => ({
    id: Number(category.id),
    name: category.name,
    slug: category.slug,
  }));
}

function normalizeCategoryIds(primaryCategoryId, categoryIds = []) {
  return [...new Set([Number(primaryCategoryId), ...categoryIds.map(Number)])];
}

function validateData(library, data) {
  const validation = library === 'photo'
    ? validateAdminPromptInput(data)
    : validateTextPromptInput(data);
  if (!validation.valid) {
    throw new McpToolError(`Prompt validation failed: ${JSON.stringify(validation.errors)}`);
  }
  return validation.data;
}

export async function createDraft(input, authentication = null) {
  const library = ensureLibrary(input.library);
  const mcpAuthorization = authentication?.type === 'oauth' ? authentication : null;
  const common = {
    title: input.title,
    prompt: input.prompt,
    slug: input.slug || slugifyPrompt(input.title),
    primaryCategoryId: input.primaryCategoryId,
    categoryIds: normalizeCategoryIds(input.primaryCategoryId, input.categoryIds),
    tags: input.tags || [],
    intro: input.intro || '',
    useCase: input.useCase || '',
    status: 'draft',
  };

  if (library === 'text') {
    const data = validateData(library, common);
    const created = await insertTextPrompt(data, { mcpAuthorization });
    return { ...created, library, status: 'draft' };
  }

  const data = validateData(library, {
    ...common,
    image: input.image || '',
    images: input.images || (input.image ? [input.image] : []),
    imageAltTexts: input.imageAltTexts || {},
    ogImage: input.ogImage || '',
  });
  const created = await insertAdminPrompt(data, { mcpAuthorization });
  const shouldNoindex = shouldNoIndexPrompt({
    slug: data.slug,
    title: data.title,
    prompt: data.prompt,
    tags: data.tags,
    image: data.image,
    images: data.images,
    ogImage: data.ogImage,
    intro: data.intro,
  });
  await getPgPool().query(
    "UPDATE prompts SET should_noindex = $1 WHERE id = $2 AND library_type = $3 AND status = 'draft'",
    [shouldNoindex, created.id, 'photo'],
  );
  clearPromptsCache();
  return { ...created, library, status: 'draft' };
}

function mergePhotoUpdate(existing, input) {
  const merged = { ...existing, ...input, status: 'draft' };
  if (input.image && !input.images) {
    merged.images = [input.image, ...(existing.images || []).filter((url) => url !== input.image)];
  }
  return merged;
}

export async function updateDraft(input, authentication = null) {
  const library = ensureLibrary(input.library);
  const id = ensurePromptId(input.id);

  if (authentication?.type === 'oauth') {
    const client = await getPgPool().connect();
    try {
      await client.query('BEGIN');
      await lockMcpOAuthAuthorization(client, authentication);
      await lockMcpOAuthDraftAuthorization(client, id, library, authentication);

      if (library === 'photo') {
        const existing = await getAdminPromptById(id, { client });
        const data = validateData(library, mergePhotoUpdate(existing, input));
        const updated = await updateAdminPrompt(id, data, {
          expectedStatus: 'draft',
          mcpAuthorization: authentication,
          client,
          manageTransaction: false,
        });
        if (!updated) {
          throw new McpAuthorizationError('Prompt not found or not editable.');
        }
        const shouldNoindex = shouldNoIndexPrompt({
          slug: data.slug,
          title: data.title,
          prompt: data.prompt,
          tags: data.tags,
          image: data.image,
          images: data.images,
          ogImage: data.ogImage,
          intro: data.intro,
        });
        await client.query(
          'UPDATE prompts SET should_noindex = $1 WHERE id = $2 AND library_type = $3 AND status = $4',
          [shouldNoindex, id, 'photo', 'draft'],
        );
        await client.query('COMMIT');
        clearPromptsCache();
        return { ...updated, library, status: 'draft' };
      }

      const existing = await getTextPromptById(id, { client });
      const data = validateData(library, { ...existing, ...input, status: 'draft' });
      const updated = await updateTextPrompt(id, data, {
        expectedStatus: 'draft',
        mcpAuthorization: authentication,
        client,
        manageTransaction: false,
      });
      if (!updated) {
        throw new McpAuthorizationError('Prompt not found or not editable.');
      }
      await client.query('COMMIT');
      return { ...updated, library, status: 'draft' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  if (library === 'photo') {
    const existing = await getAdminPromptById(id);
    if (!existing) throw new McpToolError('Prompt not found in the selected library.');
    if (existing.status !== 'draft') {
      throw new McpToolError('Published prompts are read-only. Only drafts can be edited.');
    }

    const data = validateData(library, mergePhotoUpdate(existing, input));
    const updated = await updateAdminPrompt(id, data, { existing, expectedStatus: 'draft' });
    if (!updated) {
      throw new McpToolError('Prompt changed before it could be saved. Reload it and try again.');
    }
    const shouldNoindex = shouldNoIndexPrompt({
      slug: data.slug,
      title: data.title,
      prompt: data.prompt,
      tags: data.tags,
      image: data.image,
      images: data.images,
      ogImage: data.ogImage,
      intro: data.intro,
    });
    await getPgPool().query(
      "UPDATE prompts SET should_noindex = $1 WHERE id = $2 AND library_type = $3 AND status = 'draft'",
      [shouldNoindex, id, 'photo'],
    );
    clearPromptsCache();
    return { ...updated, library, status: 'draft' };
  }

  const existing = await getTextPromptById(id);
  if (!existing) throw new McpToolError('Prompt not found in the selected library.');
  if (existing.status !== 'draft') {
    throw new McpToolError('Published prompts are read-only. Only drafts can be edited.');
  }

  const data = validateData(library, { ...existing, ...input, status: 'draft' });
  const updated = await updateTextPrompt(id, data, { expectedStatus: 'draft' });
  if (!updated) {
    throw new McpToolError('Prompt changed before it could be saved. Reload it and try again.');
  }
  return { ...updated, library, status: 'draft' };
}

export async function publishDraft(input, authentication = null) {
  const library = ensureLibrary(input.library);
  const id = ensurePromptId(input.id);
  if (authentication?.type !== 'oauth') {
    throw new McpAuthorizationError('OAuth authentication is required to publish prompts.');
  }

  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    await lockMcpOAuthAuthorization(client, authentication);
    await lockMcpOAuthCapability(client, authentication, 'publish');
    await lockMcpOAuthDraftAuthorization(client, id, library, authentication);

    const existing = library === 'photo'
      ? await getAdminPromptById(id, { client })
      : await getTextPromptById(id, { client });
    if (!existing) throw new McpAuthorizationError('Prompt not found or not publishable.');

    const data = validateData(library, { ...existing, status: 'published' });
    const updated = library === 'photo'
      ? await updateAdminPrompt(id, data, {
          expectedStatus: 'draft',
          mcpAuthorization: authentication,
          client,
          manageTransaction: false,
        })
      : await updateTextPrompt(id, data, {
          expectedStatus: 'draft',
          mcpAuthorization: authentication,
          client,
          manageTransaction: false,
        });
    if (!updated) throw new McpAuthorizationError('Prompt not found or not publishable.');

    if (library === 'photo') {
      const shouldNoindex = shouldNoIndexPrompt({
        slug: data.slug,
        title: data.title,
        prompt: data.prompt,
        tags: data.tags,
        image: data.image,
        images: data.images,
        ogImage: data.ogImage,
        intro: data.intro,
      });
      await client.query(
        "UPDATE prompts SET should_noindex = $1 WHERE id = $2 AND library_type = 'photo' AND status = 'published'",
        [shouldNoindex, id],
      );
    }

    await client.query('COMMIT');
    if (library === 'photo') clearPromptsCache();
    return { ...updated, library, status: 'published' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function uploadPhotoImage(input, authentication = null) {
  if (authentication?.type !== 'oauth') {
    throw new McpAuthorizationError('OAuth authentication is required to upload images.');
  }

  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    await lockMcpOAuthAuthorization(client, authentication);
    await lockMcpOAuthCapability(client, authentication, 'upload_images');
    const image = await uploadMcpImageFile(input);
    await client.query('COMMIT');
    return image;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
