import { PromptListingPage } from '@/components/prompts/PromptPages';
import { buildMetadata } from '@/lib/metadata';
import { getSlimPromptsByCategory, PROMPT_BASE_PATH, PROMPT_CATEGORIES } from '@/lib/prompts';

const category = PROMPT_CATEGORIES.couples;

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildMetadata({
    title: `${category.label} AI Image Prompts`,
    description: category.description,
    path: `${PROMPT_BASE_PATH}/${category.slug}`,
    keywords: [`${category.label} AI prompts`, 'couple prompts', 'Instagram prompts'],
  });
}

export default async function Page() {
  return <PromptListingPage prompts={await getSlimPromptsByCategory(category.slug)} category={category} />;
}
