import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import { listAuthorProfiles } from '@/lib/author-profiles-db';
import AuthorProfilesManager from './AuthorProfilesManager';

export const dynamic = 'force-dynamic';

export default async function AdminAuthorsPage() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect('/admin/login?reset=1');
  if (!isSuperAdmin(adminUser)) redirect('/admin');
  const authors = await listAuthorProfiles();

  return (
    <main className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header className="flex min-h-12 items-center bg-[#1d2327] px-5 text-white lg:px-8">
        <Link href="/admin" className="text-sm font-semibold">AQPrompts Admin</Link>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Author Profiles</h1>
          <p className="mt-1 text-sm text-[#646970]">Create public author pages and manage the profiles available to blog editors.</p>
        </div>
        <AuthorProfilesManager initialAuthors={authors} />
      </div>
    </main>
  );
}
