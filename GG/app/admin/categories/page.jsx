import Link from 'next/link';
import { redirect } from 'next/navigation';

import CategoryManager from './CategoryManager';
import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import { listCategories } from '@/lib/categories-db';

export const dynamic = 'force-dynamic';

export default async function AdminCategoriesPage() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect('/admin/login?reset=1');
  if (!isSuperAdmin(adminUser)) redirect('/admin?error=forbidden');

  const categories = await listCategories();

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header className="flex min-h-12 items-center bg-[#1d2327] px-5 text-white lg:px-8">
        <Link href="/admin" className="text-sm font-semibold">AQPrompts Admin</Link>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Categories</h1>
            <p className="mt-1 text-sm text-[#646970]">
              Manage prompt categories without changing the hardcoded public category routes.
            </p>
          </div>
          <Link href="/admin" className="text-sm font-semibold text-[#2271b1] hover:underline">
            Back to prompts
          </Link>
        </div>
        <div className="mt-6">
          <CategoryManager initialCategories={categories} />
        </div>
      </div>
    </main>
  );
}
