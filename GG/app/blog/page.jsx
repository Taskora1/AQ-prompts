import { Suspense } from 'react';

import JsonLd from '@/components/JsonLd';
import BlogPage from '@/route-views/BlogPage';
import { getPublishedBlogPostsSnapshotSlim } from '@/lib/blog-api';
import { buildBlogListingJsonLd, buildStaticPageMetadata } from '@/lib/metadata';
import { getCloudinaryResponsiveImage, optimizeCloudinaryUrl } from '@/lib/cloudinary-optimize';

// The featured image is the blog list's LCP element, but it lives inside the
// Suspense-streamed BlogPage (useSearchParams forces the boundary), so it is
// NOT discoverable in the initial HTML (Lighthouse: requestDiscoverable=false,
// ~950ms observed load delay, LCP 5.0s). This preload is rendered by the
// server component outside the boundary, so it ships in the initial document
// head and the browser starts the image fetch ~1s earlier.
// The srcSet/sizes MUST match ResponsiveImage exactly (same helper, same
// defaults, same sizes string) or the browser downloads the image twice.
const FEATURED_IMAGE_SIZES = '(min-width: 768px) 50vw, 100vw';
const FEATURED_IMAGE_FALLBACK = '/images/prompts/cinematic-sunset-beach-portrait.webp';

export const revalidate = 86400; // 24h safety net — primary invalidation is on-demand via revalidateBlogContent

export function generateMetadata() {
  return buildStaticPageMetadata('blog');
}

function BlogSeoFallback() {
  return (
    <>
      <HeaderShell />
      <main id="main-content">
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

export default async function Page({ searchParams }) {
  const params = await searchParams;
  // With a search or category filter the Featured section is hidden, so
  // there is no featured image to preload — skip it and save the download.
  const hasFilter = Boolean(params?.search || params?.category);
  const postsPayload = await getPublishedBlogPostsSnapshotSlim();
  const blogJsonLd = await buildBlogListingJsonLd();
  const featuredPost = !hasFilter ? (postsPayload.posts || [])[0] : null;
  // Same resolution as BlogPage's ResponsiveImage (image || coverImage ||
  // featuredImage || fallback) so the preload matches the rendered <img>.
  const featuredImage = featuredPost
    ? (featuredPost.image || featuredPost.coverImage || featuredPost.featuredImage || FEATURED_IMAGE_FALLBACK)
    : '';
  const featuredSrcSet = featuredImage ? getCloudinaryResponsiveImage(featuredImage)?.srcSet : null;

  return (
    <>
      <JsonLd data={blogJsonLd} />
      {featuredImage ? (
        <link
          rel="preload"
          as="image"
          href={optimizeCloudinaryUrl(featuredImage)}
          {...(featuredSrcSet ? { imageSrcSet: featuredSrcSet, imageSizes: FEATURED_IMAGE_SIZES } : {})}
          fetchPriority="high"
        />
      ) : null}
      <Suspense fallback={<BlogSeoFallback />}>
        <BlogPage initialPosts={postsPayload.posts || []} />
      </Suspense>
    </>
  );
}

