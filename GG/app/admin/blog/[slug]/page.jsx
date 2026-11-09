import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';

import BlogFormWrapper from '@/components/admin/BlogFormWrapper';
import { getCurrentAdminUser } from '@/lib/admin-session';
import { getBlogPostBySlug, ensureBlogTable } from '@/lib/blog-db';

export const dynamic = 'force-dynamic';

export default async function EditBlogPostPage({ params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect('/admin/login?reset=1');

  await ensureBlogTable();

  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header className="flex min-h-12 items-center bg-[#1d2327] px-5 text-white lg:px-8">
        <Link href="/admin" className="text-sm font-semibold">AQPrompts Admin</Link>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Edit Post</h1>
            <p className="mt-1 text-sm text-[#646970]">
              Editing: <span className="font-semibold">{post.title}</span>
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/blog" className="text-sm font-semibold text-[#2271b1] hover:underline">
              ← Back to posts
            </Link>
            <Link
              href={`/blog/${slug}`}
              target="_blank"
              className="text-sm font-semibold text-[#2271b1] hover:underline"
            >
              View live →
            </Link>
          </div>
        </div>
        <section className="mt-6 rounded border border-[#c3c4c7] bg-white p-5 shadow-sm sm:p-7">
          <BlogFormWrapper initialPost={post} />
        </section>
      </div>
    </main>
  );
}
