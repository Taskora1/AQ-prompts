import { PromptListingPage } from '@/components/prompts/PromptPages';
import { buildMetadata } from '@/lib/metadata';
import { getPromptListingPagePayload, PROMPT_BASE_PATH } from '@/lib/prompts';

export const dynamic = 'force-static';
export const revalidate = false;

export async function generateMetadata() {
  const payload = await getPromptListingPagePayload();
  const title = 'Instagram AI Image Prompt Library';
  const description = payload.pageDescription;

  return buildMetadata({
    title,
    description,
    path: PROMPT_BASE_PATH,
    keywords: ['AI image prompts', 'Instagram prompts', 'portrait prompts', 'Midjourney prompts'],
  });
}

export default async function Page() {
  const payload = await getPromptListingPagePayload();
  return (
    <PromptListingPage
      prompts={payload.prompts}
      payload={payload}
      totalCount={payload.totalCount}
    />
  );
}
