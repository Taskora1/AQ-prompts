import { PromptListingPage } from '@/components/prompts/PromptPages';
import { buildPromptCategoryMetadata } from '@/lib/metadata';
import { getSlimPromptsByCategory, PROMPT_CATEGORIES } from '@/lib/prompts';

const category = PROMPT_CATEGORIES.women;

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildPromptCategoryMetadata('women');
}

export default async function Page() {
  return <PromptListingPage prompts={await getSlimPromptsByCategory(category.slug)} category={category} />;
}
