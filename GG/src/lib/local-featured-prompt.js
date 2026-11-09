import fs from 'node:fs';
import path from 'node:path';

const promptIndex = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'prompts-index.json'), 'utf8'),
);

const RECENT_PROMPT_POOL_SIZE = 30;

function containsMinorReference(prompt = {}) {
  const text = [
    prompt.title,
    prompt.slug,
    prompt.prompt,
    prompt.intro,
    prompt.category,
    prompt.primaryCategorySlug,
    ...(Array.isArray(prompt.tags) ? prompt.tags : []),
  ]
    .join(' ')
    .toLowerCase();

  return /\b(?:boy|girl|kid|teen|teenager|teens|minor|child|children|student|school)\b/.test(text)
    || /\b(?:16|17)\s*[-–to]\s*18\b/.test(text)
    || /\b(?:16|17)\s*[-–]?\s*year[-\s]?old\b/.test(text)
    || /\bunder\s+(?:18|eighteen)\b/.test(text);
}

function promptDate(prompt = {}) {
  return Date.parse(prompt.createdAt || prompt.date || prompt.updatedAt || 0) || 0;
}

function utcDayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
}

export function getLocalFeaturedPrompt(date = new Date()) {
  const prompts = (promptIndex.prompts || [])
    .filter((prompt) => prompt?.status === 'published' && prompt.title && prompt.prompt && !containsMinorReference(prompt))
    .sort((a, b) => promptDate(b) - promptDate(a))
    .slice(0, RECENT_PROMPT_POOL_SIZE);

  if (prompts.length === 0) return null;

  return prompts[utcDayNumber(date) % prompts.length];
}
