import { notFound } from 'next/navigation';

import JsonLd from '@/components/JsonLd';
import SinglePostPage from '@/route-views/SinglePostPage';
import { getBlogPostSnapshotBySlug } from '@/lib/blog-api';
import { getPublishedBlogPostBySlug } from '@/lib/blog-db';
import { buildBlogPostJsonLd, buildBlogPostMetadata } from '@/lib/metadata';

export const revalidate = 86400; // 24h safety net — primary invalidation is on-demand via revalidateBlogContent

// generateStaticParams removed — using ISR with on-demand rendering from Neon

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return buildBlogPostMetadata(slug);
}

export default async function Page({ params }) {
  const { slug } = await params;
  let payload;
  let jsonLd;

  try {
    // Verify the post exists and is published before rendering
    const post = await getPublishedBlogPostBySlug(slug);
    if (!post) {
      notFound();
    }

    payload = await getBlogPostSnapshotBySlug(slug);
    jsonLd = await buildBlogPostJsonLd(slug, post);
  } catch {
    notFound();
  }

  return (
    <>
      <JsonLd data={jsonLd} />
      <SinglePostPage initialPayload={payload} slug={slug} />
    </>
  );
}
