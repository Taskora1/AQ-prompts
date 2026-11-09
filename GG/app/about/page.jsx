import JsonLd from '@/components/JsonLd';
import AboutPage from '@/route-views/AboutPage';
import { buildStaticPageMetadata, buildStaticPageSchema } from '@/lib/metadata';
import { getPublishedPromptCount } from '@/lib/prompts';

export const dynamic = 'force-dynamic';

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
