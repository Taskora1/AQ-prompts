import JsonLd from '@/components/JsonLd';
import TermsPage from '@/route-views/TermsPage';
import { buildStaticPageMetadata, buildStaticPageSchema } from '@/lib/metadata';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildStaticPageMetadata('terms');
}

export default function Page() {
  return (
    <>
      <JsonLd data={buildStaticPageSchema('terms')} />
      <TermsPage />
    </>
  );
}

