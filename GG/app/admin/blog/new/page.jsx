import Link from 'next/link';
import { redirect } from 'next/navigation';

import BlogFormWrapper from '@/components/admin/BlogFormWrapper';
import { getCurrentAdminUser } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

export default async function NewBlogPostPage() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect('/admin/login?reset=1');

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header className="flex min-h-12 items-center bg-[#1d2327] px-5 text-white lg:px-8">
        <Link href="/admin" className="text-sm font-semibold">AQPrompts Admin</Link>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">New Blog Post</h1>
            <p className="mt-1 text-sm text-[#646970]">Write and publish a new blog post.</p>
          </div>
          <Link href="/admin/blog" className="text-sm font-semibold text-[#2271b1] hover:underline">
            ← Back to posts
          </Link>
        </div>
        <section className="mt-6 rounded border border-[#c3c4c7] bg-white p-5 shadow-sm sm:p-7">
          <BlogFormWrapper />
        </section>
      </div>
    </main>
  );
}
