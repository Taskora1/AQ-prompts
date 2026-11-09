/**
 * Blog Cache Invalidation — Next.js revalidation for Neon blog content.
 *
 * After a successful admin mutation (create/edit/delete/publish/unpublish),
 * this module invalidates the affected pages so they regenerate with
 * fresh data from Neon PostgreSQL.
 *
 * Architecture:
 *   Admin → Neon → revalidatePath/revalidateTag → Public Blog
 *
 * No Git. No GitHub. No Deploy Hook. No manual deployment.
 */

import { revalidatePath, revalidateTag } from 'next/cache';

// ── Revalidation Tags ───────────────────────────────────────────────────

const BLOG_TAG = 'blog-posts';
const BLOG_LISTING_PATH = '/blog';
const SITEMAP_PATH = '/sitemap.xml';
const IMAGE_SITEMAP_PATH = '/image-sitemap.xml';
const RSS_PATH = '/rss.xml';
const HOME_PATH = '/';
const AUTHOR_PATH = '/author/abdul-qudoos';

function revalidateBlogPostPath(slug) {
  revalidatePath(`${BLOG_LISTING_PATH}/${slug}`);
}

/**
 * Invalidate all blog-related pages after a mutation.
 *
 * @param {string} action - The mutation type: 'create', 'update', 'delete', 'publish', 'unpublish'
 * @param {string} slug - The post slug that was mutated
 */
export function revalidateBlogContent(action, slug) {
  console.log(`[blog-revalidation] Revalidating for ${action}: ${slug}`);

  // 1. Invalidate the blog listing page
  revalidatePath(BLOG_LISTING_PATH);

  // 2. Invalidate the specific post page
  if (slug) {
    revalidateBlogPostPath(slug);
  }

  // 3. Invalidate the sitemap (uses Neon data now)
  revalidatePath(SITEMAP_PATH);
  revalidatePath(IMAGE_SITEMAP_PATH);

  // 4. Invalidate the RSS feed
  revalidatePath(RSS_PATH);

  // 5. Invalidate using tag for any components that use it
  revalidateTag(BLOG_TAG, 'max');

  // 6. Invalidate homepage (may show featured posts)
  revalidatePath(HOME_PATH);

  // 7. Invalidate author page (may show blog posts)
  revalidatePath(AUTHOR_PATH);
  revalidatePath('/author/[slug]', 'page');

  console.log(`[blog-revalidation] Revalidation complete for ${action}: ${slug}`);
}

/**
 * Invalidate a specific blog post page.
 * Use when only one post's content changed (not status/visibility).
 */
export function revalidateBlogPost(slug) {
  if (!slug) return;

  console.log(`[blog-revalidation] Revalidating post: ${slug}`);
  revalidateBlogPostPath(slug);
  revalidateTag(BLOG_TAG, 'max');
}

/**
 * Invalidate the blog listing page only.
 * Use when post order changes but no individual post content changed.
 */
export function revalidateBlogListing() {
  console.log('[blog-revalidation] Revalidating blog listing');
  revalidatePath(BLOG_LISTING_PATH);
  revalidatePath(SITEMAP_PATH);
  revalidatePath(IMAGE_SITEMAP_PATH);
  revalidatePath(RSS_PATH);
  revalidateTag(BLOG_TAG, 'max');
}
