import Link from 'next/link';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import TrendingPromptsClient from '@/components/prompts/TrendingPromptsClient';
import { buildMetadata } from '@/lib/metadata';
import { PROMPT_BASE_PATH } from '@/lib/prompts';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildMetadata({
    title: 'Trending AI Image Prompts',
    description: 'Browse the most popular AQPrompts ranked by recent views, likes, and copies.',
    path: `${PROMPT_BASE_PATH}/trending`,
    noIndex: true,
    noFollow: false,
    keywords: ['trending AI prompts', 'popular image prompts', 'AQPrompts trending'],
  });
}

export default function TrendingPromptsPage() {
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
              <span className="text-[var(--text-primary)]">Trending</span>
            </nav>
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-wide text-[#c2410c]">
                Popular prompts
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
                Trending AI Image Prompts
              </h1>
              <p className="mt-5 text-lg leading-8 text-[var(--text-secondary)]">
                Ranked by views, likes, and copies with a freshness score that keeps newer useful prompts visible.
              </p>
            </div>
          </div>
        </section>
        <section className="py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <TrendingPromptsClient />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
