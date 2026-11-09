import { redirect } from 'next/navigation';

import AdminPromptList from './AdminPromptList';
import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import { listAdminPromptRows } from '@/lib/prompts-admin-db';

export const dynamic = 'force-dynamic';

const SUCCESS_MESSAGES = {
  created: 'Prompt created successfully.',
  updated: 'Prompt updated successfully.',
};

const ERROR_MESSAGES = {
  forbidden: 'You do not have permission to access that page.',
};

export default async function AdminPage({ searchParams }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect('/admin/login?reset=1');

  const params = await searchParams;
  const promptList = await listAdminPromptRows({
    page: params?.page,
    search: params?.search,
    status: params?.status,
    category: params?.category,
    sort: params?.sort,
  });
  return (
    <main id="main-content" className="admin-shell min-h-screen bg-[#f4f6fb] text-[#172033]">
      <AdminPromptList
        {...promptList}
        successMessage={SUCCESS_MESSAGES[params?.success] || ''}
        errorMessage={ERROR_MESSAGES[params?.error] || ''}
        canManageRestrictedActions={isSuperAdmin(adminUser)}
      />
    </main>
  );
}
