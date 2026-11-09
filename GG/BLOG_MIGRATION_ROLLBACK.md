# Blog Migration Rollback Guide

## If Neon Migration Fails

The MDX files and generated data are preserved as backup. To restore the old blog system:

### Step 1: Restore MDX-based blog reads

Replace the following files with their MDX-based versions:

**`app/blog/page.jsx`** — Restore to read from `getAllPostsSnapshot()`:
```jsx
// Replace getPublishedBlogPostsSnapshot with getAllPostsSnapshot
import { getAllPostsSnapshot } from '@/lib/api';
// Change: const postsPayload = await getPublishedBlogPostsSnapshot();
// To: const postsPayload = getAllPostsSnapshot();
```

**`app/blog/[slug]/page.jsx`** — Restore to read from generated data:
```jsx
// Replace getBlogPostSnapshotBySlug with getPostSnapshotBySlug
import { getPostSnapshotBySlug } from '@/lib/api';
// Restore generateStaticParams from generated data
// Remove getPublishedBlogPostBySlug check
```

**`app/sitemap.js`** — Restore to read from `getAllPostsSnapshot()`:
```jsx
// Replace getPublishedBlogPosts with getAllPostsSnapshot
import { getAllPostsSnapshot } from '@/lib/api';
// Restore draft filtering logic
```

**`src/lib/blog-feed.js`** — Restore to read from `getAllPostsSnapshot()`:
```jsx
// Replace getPublishedBlogPosts with getAllPostsSnapshot
import { getAllPostsSnapshot } from '@/lib/api';
```

**`src/lib/metadata.js`** — Restore to use `fetchPostBySlug` from api.js:
```jsx
// Remove blog-db imports
// Restore buildBlogPostMetadata to use fetchPostBySlug
// Restore buildBlogPostJsonLd to use fetchPostBySlug
```

### Step 2: Restore MDX-based admin writes

**`app/admin/api/blog/route.js`** — Restore MDX filesystem writes.

**`app/admin/api/blog/[slug]/route.js`** — Restore MDX filesystem operations.

**`app/admin/blog/[slug]/page.jsx`** — Restore MDX filesystem reads.

### Step 3: Verify

1. Run `npm run build` — should complete without errors
2. Test `/blog` — should show posts from generated data
3. Test `/blog/[slug]` — should render posts
4. Test admin panel — should read/write MDX files

### Files to Keep as Backup

- `content/blog/*.mdx` — Source MDX files (DO NOT DELETE)
- `src/generated/posts.generated.js` — Generated post summaries
- `src/generated/content.generated.js` — Generated post content
- `public/data/posts/*.json` — Static JSON files
- `scripts/build-content.mjs` — Build script

### Files That Can Be Safely Removed After Rollback

- `src/lib/blog-db.js` — Neon blog database module
- `src/lib/blog-api.js` — Neon blog API layer
- `src/lib/blog-revalidation.js` — Cache invalidation module
- `scripts/migrate-blog-mdx-to-neon.mjs` — Migration script

### Database Cleanup

If you want to remove the `blog_posts` table from Neon after rollback:

```sql
DROP TABLE IF EXISTS blog_posts;
```

## Key Principle

The MDX files are the rollback safety net. Never delete them until the Neon migration is fully verified in production for at least 2 weeks.
