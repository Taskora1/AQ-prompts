import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import PromptFormWrapper from '@/components/admin/PromptFormWrapper';
import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import { listCategories } from '@/lib/categories-db';
import {
  getAdminPromptById,
  listAdminPromptOptions,
} from '@/lib/prompts-admin-db';

export const dynamic = 'force-dynamic';

export default async function EditPromptPage({ params }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect('/admin/login?reset=1');

  const routeParams = await params;
  const id = Number(routeParams?.id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const [prompt, categories, promptOptions] = await Promise.all([
    getAdminPromptById(id),
    listCategories(),
    listAdminPromptOptions(),
  ]);
  if (!prompt) notFound();

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header className="flex min-h-12 items-center bg-[#1d2327] px-5 text-white lg:px-8">
        <Link href="/admin" className="text-sm font-semibold">AQPrompts Admin</Link>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
        <h1 className="text-2xl font-semibold">Edit Prompt</h1>
        <p className="mt-1 text-sm text-[#646970]">Update “{prompt.title}”.</p>
        <section className="mt-6 rounded border border-[#c3c4c7] bg-white p-5 shadow-sm sm:p-7">
          <PromptFormWrapper
            initialPrompt={prompt}
            availableCategories={categories}
            availablePrompts={promptOptions}
            canManageCategories={isSuperAdmin(adminUser)}
          />
        </section>
      </div>
    </main>
  );
}
