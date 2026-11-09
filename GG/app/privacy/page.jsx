import JsonLd from '@/components/JsonLd';
import PrivacyPage from '@/route-views/PrivacyPage';
import { buildStaticPageMetadata, buildStaticPageSchema } from '@/lib/metadata';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildStaticPageMetadata('privacy');
}

export default function Page() {
  return (
    <>
      <JsonLd data={buildStaticPageSchema('privacy')} />
      <PrivacyPage />
    </>
  );
}

