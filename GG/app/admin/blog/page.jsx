import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import { getAdminBlogPostsSnapshot } from '@/lib/blog-api';
import BlogPostList from './BlogPostList';

export const dynamic = 'force-dynamic';

export default async function AdminBlogPage({ searchParams }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect('/admin/login?reset=1');

  const params = await searchParams;
  const page = Math.max(1, Number(params?.page) || 1);
  const status = ['all', 'published', 'draft'].includes(params?.status) ? params.status : 'all';
  const pageSize = 30;
  const postsPayload = await getAdminBlogPostsSnapshot({
    page,
    pageSize,
    status,
    search: params?.search,
    category: params?.category,
    sort: params?.sort,
    includeExcerpt: false,
  });
  const posts = (postsPayload.posts || []).map((post) => ({
    slug: post.slug,
    title: post.title,
    category: post.category,
    author: post.author,
    status: post.status,
    date: post.date,
    readingTime: post.readingTime,
    featuredImage: post.featuredImage,
    excerpt: post.excerpt,
    tags: post.tags || [],
  }));

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header className="flex min-h-12 items-center bg-[#1d2327] px-5 text-white lg:px-8">
        <Link href="/admin" className="text-sm font-semibold">AQPrompts Admin</Link>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Blog Posts</h1>
            <p className="mt-1 text-sm text-[#646970]">
              Create and manage blog posts with rich text editing.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin"
              className="inline-flex h-10 items-center justify-center rounded border border-[#8c8f94] bg-white px-4 text-sm font-semibold text-[#2c3338] transition hover:bg-[#f0f0f1]"
            >
              ← Prompts
            </Link>
            <Link
              href="/admin/blog/new"
              className="inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96]"
            >
              + New Post
            </Link>
          </div>
        </div>

        {params?.success && (
          <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {params.success === 'created' && 'Post created successfully.'}
            {params.success === 'updated' && 'Post updated successfully.'}
            {params.success === 'deleted' && 'Post deleted successfully.'}
          </div>
        )}

        {params?.error && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {params.error === 'forbidden' && 'You do not have permission for that action.'}
          </div>
        )}

        <div className="mt-6">
          <BlogPostList
            posts={posts}
            page={page}
            pageSize={pageSize}
            total={postsPayload.total}
            statusCounts={postsPayload.statusCounts}
            statusFilter={status}
            search={postsPayload.search}
            categoryFilter={postsPayload.category}
            categories={postsPayload.categories}
            sort={postsPayload.sort}
            currentUser={adminUser}
            canManage={isSuperAdmin(adminUser)}
          />
        </div>
      </div>
    </main>
  );
}
