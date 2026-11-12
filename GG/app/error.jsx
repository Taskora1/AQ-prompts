'use client';

import Link from 'next/link';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';

export default function Error({ error, reset }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main id="main-content" className="container py-24 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          Something went wrong
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          This page could not load
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
          The page ran into a temporary problem. Please try again, or head back to the
          prompt library — your prompts are still here.
        </p>
        {process.env.NODE_ENV === 'development' && error?.message ? (
          <p className="mx-auto mt-4 max-w-2xl rounded-md bg-slate-100 p-3 text-left font-mono text-xs text-slate-600">
            {error.message}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/tools/ai-image-prompts">Browse prompts</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
