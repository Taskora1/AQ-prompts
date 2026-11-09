import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import TextPromptForm from '@/components/admin/TextPromptForm';
import { getCurrentAdminUser } from '@/lib/admin-session';
import { listCategories } from '@/lib/categories-db';
import { getTextPromptById } from '@/lib/text-prompts-admin-db';

export const dynamic = 'force-dynamic';

export default async function EditTextPromptPage({ params }) {
  if (!await getCurrentAdminUser()) redirect('/admin/login?reset=1');
  const routeParams = await params;
  const id = Number(routeParams?.id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const [prompt, categories] = await Promise.all([
    getTextPromptById(id),
    listCategories({ libraryType: 'text' }),
  ]);
  if (!prompt) notFound();

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header className="flex min-h-12 items-center bg-[#1d2327] px-5 text-white lg:px-8">
        <Link href="/admin/text-prompts" className="text-sm font-semibold">Text Prompts</Link>
      </header>
      <section className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
        <h1 className="text-2xl font-semibold">Edit Text Prompt</h1>
        <div className="mt-5 rounded border border-[#c3c4c7] bg-white p-5 sm:p-7">
          <TextPromptForm initialPrompt={prompt} categories={categories} />
        </div>
      </section>
    </main>
  );
}