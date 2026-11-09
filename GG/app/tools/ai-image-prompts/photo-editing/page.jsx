import { PromptListingPage } from '@/components/prompts/PromptPages';
import { buildPromptCategoryMetadata } from '@/lib/metadata';
import { getSlimPromptsByCategory, PROMPT_CATEGORIES } from '@/lib/prompts';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildPromptCategoryMetadata('photoEditing');
}

export default async function Page() {
  const category = PROMPT_CATEGORIES.photoEditing;
  return <PromptListingPage prompts={await getSlimPromptsByCategory(category.slug)} category={category} />;
}

