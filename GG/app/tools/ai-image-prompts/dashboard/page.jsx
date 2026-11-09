import Link from 'next/link';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import PromptDashboardClient from '@/components/prompts/PromptDashboardClient';
import { buildMetadata } from '@/lib/metadata';
import { PROMPT_BASE_PATH } from '@/lib/prompts';

export const dynamic = 'force-static';
export const revalidate = false;

export function generateMetadata() {
  return buildMetadata({
    title: 'Prompt Performance Dashboard',
    description: 'Analytics dashboard showing prompt performance metrics — copies, views, likes, ratings, and category breakdown.',
    path: `${PROMPT_BASE_PATH}/dashboard`,
    noIndex: true,
    noFollow: false,
    keywords: ['prompt analytics', 'dashboard', 'prompt performance'],
  });
}

export default function PromptDashboardPage() {
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
              <span className="text-[var(--text-primary)]">Dashboard</span>
            </nav>
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-wide text-[#c2410c]">
                Analytics
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
                Prompt Performance Dashboard
              </h1>
              <p className="mt-4 text-lg leading-8 text-[var(--text-secondary)]">
                Track copies, views, likes, and ratings across your prompt collection. Data updated in real-time.
              </p>
            </div>
          </div>
        </section>
        <section className="py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <PromptDashboardClient />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
