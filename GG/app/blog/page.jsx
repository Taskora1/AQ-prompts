import { Suspense } from 'react';

import JsonLd from '@/components/JsonLd';
import BlogPage from '@/route-views/BlogPage';
import { getPublishedBlogPostsSnapshotSlim } from '@/lib/blog-api';
import { buildBlogListingJsonLd, buildStaticPageMetadata } from '@/lib/metadata';

export const revalidate = 86400; // 24h safety net — primary invalidation is on-demand via revalidateBlogContent

export function generateMetadata() {
  return buildStaticPageMetadata('blog');
}

function BlogSeoFallback() {
  return (
    <>
      <HeaderShell />
      <main>
        <section className="relative bg-white py-12 sm:py-16 dark:bg-[#0a0a0f]">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-3xl font-bold text-[var(--text-primary)] sm:text-4xl lg:text-5xl">
                AQPrompts Blog
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-[var(--text-secondary)] sm:text-xl">
                Expert strategies, proven tips, and actionable insights to accelerate your social media growth.
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function HeaderShell() {
  return <div className="h-[4.5rem] border-b border-[var(--border)] bg-[var(--bg-card)]" />;
}

export default async function Page() {
  const postsPayload = await getPublishedBlogPostsSnapshotSlim();
  const blogJsonLd = await buildBlogListingJsonLd();

  return (
    <>
      <JsonLd data={blogJsonLd} />
      <Suspense fallback={<BlogSeoFallback />}>
        <BlogPage initialPosts={postsPayload.posts || []} />
      </Suspense>
    </>
  );
}

