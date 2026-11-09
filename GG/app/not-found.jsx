import Link from 'next/link';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Page Not Found',
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main id="main-content" className="container py-24 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">404</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
          Page not found
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
          The page you are looking for may have moved, or the link may no longer be active.
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
