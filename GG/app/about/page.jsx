import JsonLd from '@/components/JsonLd';
import AboutPage from '@/route-views/AboutPage';
import { buildStaticPageMetadata, buildStaticPageSchema } from '@/lib/metadata';
import { getPublishedPromptCount } from '@/lib/prompts';

export const revalidate = 86400; // 24h — prompt count changes only when prompts are added/removed; on-demand revalidation via admin

export function generateMetadata() {
  return buildStaticPageMetadata('about');
}

export default async function Page() {
  const promptCount = await getPublishedPromptCount();

  return (
    <>
      <JsonLd data={buildStaticPageSchema('about')} />
      <AboutPage promptCount={promptCount} />
    </>
  );
}
