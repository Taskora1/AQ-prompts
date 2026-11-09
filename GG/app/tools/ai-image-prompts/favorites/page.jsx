import Link from 'next/link';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import FavoritesPromptsClient from '@/components/prompts/FavoritesPromptsClient';
import { buildMetadata } from '@/lib/metadata';
import { getSlimAllPrompts, PROMPT_BASE_PATH } from '@/lib/prompts';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildMetadata({
    title: 'Saved AI Image Prompts',
    description: 'Your saved AQPrompts prompt list on this device.',
    path: `${PROMPT_BASE_PATH}/favorites`,
    noIndex: true,
    keywords: ['saved AI prompts', 'favorite prompts', 'AQPrompts saved'],
  });
}

export default async function FavoritesPage() {
  const prompts = await getSlimAllPrompts();

  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen bg-[var(--bg-secondary)]">
        <section className="border-b border-[var(--border)] bg-[var(--bg-primary)] py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <nav className="mb-5 flex flex-wrap gap-2 text-sm text-[var(--text-secondary)]">
              <Link href="/" className="hover:text-[#c2410c]">Home</Link>
              <span>/</span>
              <Link href={PROMPT_BASE_PATH} className="hover:text-[#c2410c]">AI Prompts</Link>
              <span>/</span>
              <span className="text-[var(--text-primary)]">Saved</span>
            </nav>
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-wide text-[#c2410c]">
                Favorites
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
                Saved AI Image Prompts
              </h1>
              <p className="mt-5 text-lg leading-8 text-[var(--text-secondary)]">
                Keep your favorite prompts on this device and open them again whenever you need them.
              </p>
            </div>
          </div>
        </section>
        <section className="py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <FavoritesPromptsClient prompts={prompts} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
