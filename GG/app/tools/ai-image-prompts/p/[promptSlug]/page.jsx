import { notFound } from 'next/navigation';

import { PromptDetailPageServer } from '@/components/prompts/PromptPages';
import { buildPromptMetadata } from '@/lib/metadata';
import { getAllPromptSlugs, getCachedPromptBySlug, getPromptUrl, getSlimPromptsForDetail, isIndexablePrompt } from '@/lib/prompts';

export const dynamic = 'force-static';
export const revalidate = false;

export async function generateStaticParams() {
  const slugs = await getAllPromptSlugs();
  return slugs
    .filter((entry) => entry?.slug)
    .map((entry) => ({ promptSlug: entry.slug }));
}

export async function generateMetadata({ params }) {
  const { promptSlug } = await params;
  // React cache() dedupe: generateMetadata + Page share one PK query per render.
  const prompt = await getCachedPromptBySlug(promptSlug);
  if (!prompt) return {};

  return buildPromptMetadata(prompt, getPromptUrl(prompt));
}

export default async function Page({ params }) {
  const { promptSlug } = await params;
  // Full row (per-slug PK query) only for the prompt itself. Related/secret
  // navigation comes from a targeted fetch — same-category candidates +
  // manual related ids (+ the configured secret prompt) — instead of the
  // whole-table slim payload (576 rows, ~1.2 MB). The targeted query needs
  // the prompt's categories and manual ids, so it runs after the PK query
  // rather than in parallel with it.
  const prompt = await getCachedPromptBySlug(promptSlug);

  if (!prompt) notFound();

  const slimPrompts = await getSlimPromptsForDetail(prompt);
  const indexablePrompts = slimPrompts.filter(isIndexablePrompt);

  return <PromptDetailPageServer prompt={prompt} allPrompts={indexablePrompts} />;
}
