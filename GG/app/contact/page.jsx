import JsonLd from '@/components/JsonLd';
import ContactPage from '@/route-views/ContactPage';
import { buildStaticPageMetadata, buildStaticPageSchema } from '@/lib/metadata';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildStaticPageMetadata('contact');
}

export default function Page() {
  return (
    <>
      <JsonLd data={buildStaticPageSchema('contact')} />
      <ContactPage />
    </>
  );
}

