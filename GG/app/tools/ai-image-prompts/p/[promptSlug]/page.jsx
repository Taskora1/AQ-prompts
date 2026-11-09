import { redirect } from 'next/navigation';

import { PromptDetailPageServer } from '@/components/prompts/PromptPages';
import { buildPromptMetadata } from '@/lib/metadata';
import { getAllPromptSlugs, getCachedPromptBySlug, getSlimAllPrompts, getPromptUrl, isIndexablePrompt } from '@/lib/prompts';

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
  // Full row (per-slug PK query) only for the prompt itself; related/prev/next
  // navigation comes from the cached slim payload instead of a full-table scan.
  const [prompt, slimPrompts] = await Promise.all([
    getCachedPromptBySlug(promptSlug),
    getSlimAllPrompts(),
  ]);

  if (!prompt) redirect('/tools/ai-image-prompts');

  const indexablePrompts = slimPrompts.filter(isIndexablePrompt);

  return <PromptDetailPageServer prompt={prompt} allPrompts={indexablePrompts} />;
}
