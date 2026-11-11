import { revalidatePath } from 'next/cache';

import {
  clearPromptsCache,
  clearPromptSlugsCache,
  clearSlimPromptsCache,
} from './prompts-db.js';
import {
  getPromptCategory,
  PROMPT_BASE_PATH,
} from './prompt-constants.js';

const PUBLIC_PROMPT_INDEX_PATHS = [
  PROMPT_BASE_PATH,
  `${PROMPT_BASE_PATH}/favorites`,
  '/api/prompts',
  '/sitemap.xml',
  '/image-sitemap.xml',
  '/feed.xml',
  '/rss.xml',
  '/pinterest-feed.xml',
];

const STRUCTURAL_PROMPT_PATHS = [
  '/',
  '/about',
  '/categories',
];

function isPublished(prompt) {
  return Boolean(prompt) && prompt.status !== 'draft';
}

function promptRoute(prompt) {
  return prompt?.slug ? `${PROMPT_BASE_PATH}/p/${prompt.slug}` : '';
}

function categoryRoute(prompt) {
  const category = getPromptCategory(prompt);
  return category ? `${PROMPT_BASE_PATH}/${category.slug}` : '';
}

export function revalidatePromptContent({
  previousPrompt = null,
  nextPrompt = null,
  mutation = 'update',
} = {}) {
  // Invalidate all prompt caches together: the full payload, the slim listing
  // payload, and the slugs index (getPromptBySlug resolves via slugs only — a
  // stale slugs cache would 404 a freshly created/renamed prompt).
  clearPromptsCache();
  clearSlimPromptsCache();
  clearPromptSlugsCache();

  const previousPublished = isPublished(previousPrompt);
  const nextPublished = isPublished(nextPrompt);

  // Draft-only work cannot change public output. Skipping public invalidation
  // avoids creating ISR reads while an editor is still preparing content.
  if (!previousPublished && !nextPublished) return;

  const structuralChange = mutation === 'create'
    || mutation === 'delete'
    || previousPrompt?.slug !== nextPrompt?.slug
    || previousPrompt?.status !== nextPrompt?.status;
  const previousCategoryRoute = previousPublished ? categoryRoute(previousPrompt) : '';
  const nextCategoryRoute = nextPublished ? categoryRoute(nextPrompt) : '';
  const categoryChanged = previousCategoryRoute !== nextCategoryRoute;

  const paths = [
    ...PUBLIC_PROMPT_INDEX_PATHS,
    previousPublished ? promptRoute(previousPrompt) : '',
    nextPublished ? promptRoute(nextPrompt) : '',
    previousCategoryRoute,
    nextCategoryRoute,
    ...(structuralChange ? STRUCTURAL_PROMPT_PATHS : []),
    ...(categoryChanged ? ['/categories'] : []),
  ];

  [...new Set(paths.filter(Boolean))].forEach((path) => revalidatePath(path));
}

export function revalidateCategoryContent({ previousCategory = null, nextCategory = null } = {}) {
  clearPromptsCache();
  clearSlimPromptsCache();
  clearPromptSlugsCache();

  const paths = [
    '/categories',
    '/',
    PROMPT_BASE_PATH,
    `${PROMPT_BASE_PATH}/favorites`,
    '/api/prompts',
    previousCategory?.slug ? `${PROMPT_BASE_PATH}/${previousCategory.slug}` : '',
    nextCategory?.slug ? `${PROMPT_BASE_PATH}/${nextCategory.slug}` : '',
    '/sitemap.xml',
    '/image-sitemap.xml',
  ];

  [...new Set(paths.filter(Boolean))].forEach((path) => revalidatePath(path));
}
