import Link from 'next/link';
import { redirect } from 'next/navigation';

import UserManager from './UserManager';
import {
  getCurrentAdminUser,
  isSuperAdmin,
} from '@/lib/admin-session';
import { listAdminUsers } from '@/lib/admin-users-db';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) redirect('/admin/login?reset=1');
  if (!isSuperAdmin(currentUser)) redirect('/admin?error=forbidden');

  const users = await listAdminUsers();

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header className="flex min-h-12 items-center bg-[#1d2327] px-5 text-white lg:px-8">
        <Link href="/admin" className="text-sm font-semibold">AQPrompts Admin</Link>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Administrator Accounts</h1>
            <p className="mt-1 text-sm text-[#646970]">
              Create accounts, assign roles, and remove access.
            </p>
          </div>
          <Link href="/admin" className="text-sm font-semibold text-[#2271b1] hover:underline">
            Back to prompts
          </Link>
        </div>
        <div className="mt-6">
          <UserManager initialUsers={users} currentUserId={currentUser.id} />
        </div>
      </div>
    </main>
  );
}
