import JsonLd from '@/components/JsonLd';
import { buildStaticPageMetadata, buildStaticPageSchema } from '@/lib/metadata';
import DisclaimerPage from '@/route-views/DisclaimerPage';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildStaticPageMetadata('disclaimer');
}

export default function Page() {
  return (
    <>
      <JsonLd data={buildStaticPageSchema('disclaimer')} />
      <DisclaimerPage />
    </>
  );
}
