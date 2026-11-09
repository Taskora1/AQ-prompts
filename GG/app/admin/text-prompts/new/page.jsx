import Link from 'next/link';
import { redirect } from 'next/navigation';

import TextPromptForm from '@/components/admin/TextPromptForm';
import { getCurrentAdminUser } from '@/lib/admin-session';
import { listCategories } from '@/lib/categories-db';

export const dynamic = 'force-dynamic';

export default async function NewTextPromptPage() {
  if (!await getCurrentAdminUser()) redirect('/admin/login?reset=1');
  const categories = await listCategories({ libraryType: 'text' });

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header className="flex min-h-12 items-center bg-[#1d2327] px-5 text-white lg:px-8">
        <Link href="/admin/text-prompts" className="text-sm font-semibold">Text Prompts</Link>
      </header>
      <section className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
        <h1 className="text-2xl font-semibold">Create Text Prompt</h1>
        <div className="mt-5 rounded border border-[#c3c4c7] bg-white p-5 sm:p-7">
          <TextPromptForm categories={categories} />
        </div>
      </section>
    </main>
  );
}